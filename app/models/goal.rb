class Goal < ApplicationRecord
  include AASM, Monetizable

  COLORS = Category::COLORS
  ICONS = Category.icon_codes

  validates :icon, inclusion: { in: ICONS, allow_nil: true }
  validates :color, format: { with: /\A#[0-9A-Fa-f]{6}\z/ }, allow_nil: true

  belongs_to :family
  has_many :goal_accounts, dependent: :destroy, autosave: true
  has_many :linked_accounts, through: :goal_accounts, source: :account
  has_many :goal_pledges, dependent: :destroy
  has_many :open_pledges,
           -> { where(status: "open").where("expires_at >= ?", Time.current) },
           class_name: "GoalPledge"

  validates :name, presence: true, length: { maximum: 255 }
  validates :target_amount, presence: true, numericality: { greater_than: 0 }
  validates :currency, presence: true
  before_save :default_progress_basis_for_investment

  validate :must_have_at_least_one_linked_account
  validate :linked_accounts_must_be_fundable
  validate :linked_accounts_must_match_goal_currency
  validate :linked_accounts_must_belong_to_family
  validate :currency_locked_once_linked

  monetize :target_amount

  scope :alphabetically, -> { order(Arel.sql("LOWER(name) ASC")) }

  def self.pooled_allocations_for(family)
    GoalAccount.joins(:goal)
               .where(goals: { family_id: family.id })
               .where.not(goals: { state: "archived" })
               .pluck(:account_id, :goal_id, :allocated_amount)
               .group_by(&:first)
               .transform_values do |triples|
                 triples.map { |(_, goal_id, amount)| { goal_id: goal_id, allocated_amount: amount } }
               end
  end

  attr_writer :pooled_allocations

  def self.market_flows_for(family)
    account_ids = GoalAccount.joins(:goal).where(goals: { family_id: family.id }).distinct.pluck(:account_id)
    return {} if account_ids.empty?

    Balance.where(account_id: account_ids).group(:account_id).sum(:net_market_flows)
  end

  attr_writer :market_flows

  aasm column: :state do
    after_all_transitions :reset_state_dependent_caches!

    state :active, initial: true
    state :paused
    state :completed
    state :archived

    event :pause do
      transitions from: :active, to: :paused
    end

    event :resume do
      transitions from: :paused, to: :active
    end

    event :complete do
      transitions from: [ :active, :paused ], to: :completed
    end

    event :archive do
      transitions from: [ :active, :paused, :completed ], to: :archived
    end

    event :unarchive do
      transitions from: :archived, to: :active
    end

    event :reopen do
      transitions from: :completed, to: :active
    end
  end

  def current_balance
    @current_balance ||= begin
      matching = linked_accounts.select { |a| a.currency == currency }
      matching.sum { |account| account_amount_for(account) }
    end
  end

  def current_balance_money
    @current_balance_money ||= Money.new(current_balance, currency)
  end

  def account_backing(account)
    Money.new(account_amount_for(account), currency)
  end

  def contributions_basis?
    progress_basis == "contributions"
  end

  def remaining_amount
    @remaining_amount ||= [ target_amount - current_balance, 0 ].max
  end

  def remaining_amount_money
    @remaining_amount_money ||= Money.new(remaining_amount, currency)
  end

  def progress_percent
    return @progress_percent if defined?(@progress_percent)

    @progress_percent = if completed?
      100
    elsif target_amount.to_d.zero?
      0
    elsif remaining_amount.to_d.zero?
      100
    else
      ((current_balance.to_d / target_amount.to_d) * 100).floor.clamp(0, 99)
    end
  end

  def display_status
    return @display_status if defined?(@display_status)

    @display_status = if archived?
      :archived
    elsif paused?
      :paused
    elsif completed?
      :completed
    else
      :active
    end
  end

  def any_connected_account?
    linked_accounts.any? { |a| !a.manual? }
  end

  def pledges_use_transfer?
    linked_accounts.any? { |a| a.default_pledge_kind == "transfer" }
  end

  private
    def account_amount_for(account)
      base = contributions_basis? ? net_contributed_for(account) : account.balance.to_d
      backing_share_for(account, base)
    end

    def net_contributed_for(account)
      market_gain = (market_flows[account.id] || 0).to_d
      [ account.balance.to_d - market_gain, 0.to_d ].max
    end

    def backing_share_for(account, base)
      base = base.to_d
      return 0.to_d if base <= 0

      mine = own_allocation_for(account)
      others_fixed = (pooled_allocations[account.id] || [])
        .reject { |r| r[:goal_id] == id }
        .sum { |r| r[:allocated_amount].to_d }

      if mine
        total_fixed = others_fixed + mine
        if total_fixed > base && total_fixed.positive?
          (mine * (base / total_fixed)).round(4)
        else
          mine
        end
      else
        [ base - others_fixed, 0 ].max
      end
    end

    def own_allocation_for(account)
      goal_accounts.find { |ga| ga.account_id == account.id }&.allocated_amount
    end

    def pooled_allocations
      @pooled_allocations ||= self.class.pooled_allocations_for(family)
    end

    def market_flows
      @market_flows ||= self.class.market_flows_for(family)
    end

    def reset_state_dependent_caches!
      %i[
        @display_status
        @current_balance @current_balance_money
        @remaining_amount @remaining_amount_money
        @progress_percent @pooled_allocations
      ].each do |ivar|
        remove_instance_variable(ivar) if instance_variable_defined?(ivar)
      end
    end

    def must_have_at_least_one_linked_account
      return unless goal_accounts.reject(&:marked_for_destruction?).empty?

      errors.add(:base, :at_least_one_linked_account_required)
    end

    def linked_accounts_must_be_fundable
      offending = goal_accounts.reject(&:marked_for_destruction?).reject do |sga|
        sga.account&.depository? || sga.account&.investment?
      end
      return if offending.empty?

      errors.add(:linked_accounts, :must_be_fundable)
    end

    def default_progress_basis_for_investment
      return unless goal_accounts.any? { |ga| ga.account&.investment? }
      return unless progress_basis.blank? || progress_basis == "balance"

      self.progress_basis = "contributions"
    end

    def linked_accounts_must_match_goal_currency
      return if currency.blank?

      mismatched = goal_accounts.reject(&:marked_for_destruction?).reject do |sga|
        sga.account.nil? || sga.account.currency == currency
      end
      return if mismatched.empty?

      errors.add(:linked_accounts, :currency_mismatch)
    end

    def linked_accounts_must_belong_to_family
      return if family.nil?

      foreign = goal_accounts.reject(&:marked_for_destruction?).reject do |sga|
        sga.account.nil? || sga.account.family_id == family_id
      end
      return if foreign.empty?

      errors.add(:linked_accounts, :must_belong_to_family)
    end

    def currency_locked_once_linked
      return unless persisted? && currency_changed?
      return unless goal_accounts.where.not(id: nil).exists?

      errors.add(:currency, :locked_after_linked)
    end
end
