class GoalsController < ApplicationController
  before_action :set_goal, only: %i[show edit update destroy pause resume complete archive unarchive reopen]

  FUNDABLE_TYPES = %w[Depository Investment].freeze
  rescue_from ActiveRecord::RecordNotFound, with: :goal_not_found

  def index
    all_goals = Current.family.goals
                       .alphabetically
                       .includes(:open_pledges, :goal_accounts, linked_accounts: :account_providers)
                       .to_a
    @active_goals = all_goals.reject { |g| %w[completed archived].include?(g.state) }
    @completed_goals = all_goals.select { |g| g.state == "completed" }
    @archived_goals = all_goals.select { |g| g.state == "archived" }

    pooled = Goal.pooled_allocations_for(Current.family)
    flows = Goal.market_flows_for(Current.family)
    all_goals.each do |goal|
      goal.pooled_allocations = pooled
      goal.market_flows = flows
    end

    @linkable_account_count = Current.user.accessible_accounts.where(accountable_type: FUNDABLE_TYPES).visible.count
  end

  def show
    @open_pledges = @goal.open_pledges.reverse_chronological.to_a
  end

  def new
    @goal = Current.family.goals.new(
      color: Goal::COLORS.sample,
      currency: Current.family.primary_currency_code
    )
    @linkable_accounts = linkable_accounts_for_new
  end

  def create
    @goal = Current.family.goals.new(goal_params)
    accounts = lookup_accounts(params.dig(:goal, :account_ids))
    @goal.currency = (accounts.first&.currency || Current.family.primary_currency_code) if @goal.currency.blank?

    allocations = submitted_allocations
    Goal.transaction do
      accounts.each { |a| @goal.goal_accounts.build(account: a, allocated_amount: allocations[a.id.to_s]) }
      @goal.save!
    end

    redirect_to goal_path(@goal), notice: t(".success")
  rescue ActiveRecord::RecordInvalid
    @linkable_accounts = linkable_accounts_for_new
    render :new, status: :unprocessable_entity
  end

  def edit
    @linkable_accounts = linkable_accounts_for_new
    @currently_linked_account_ids = @goal.goal_accounts.pluck(:account_id).map(&:to_s)
  end

  def update
    account_ids = params.dig(:goal, :account_ids)
    accounts_supplied = !account_ids.nil?
    accounts = accounts_supplied ? lookup_accounts(account_ids) : []

    if accounts_supplied && accounts.empty?
      @goal.errors.add(:base, :at_least_one_linked_account_required)
      @linkable_accounts = linkable_accounts_for_new
      @currently_linked_account_ids = @goal.goal_accounts.pluck(:account_id).map(&:to_s)
      render :edit, status: :unprocessable_entity
      return
    end

    Goal.transaction do
      @goal.update!(goal_update_params)
      sync_linked_accounts!(@goal, accounts, submitted_allocations) if accounts_supplied
    end

    redirect_to goal_path(@goal), notice: t(".success")
  rescue ActiveRecord::RecordInvalid
    @linkable_accounts = linkable_accounts_for_new
    @currently_linked_account_ids = @goal.goal_accounts.pluck(:account_id).map(&:to_s)
    render :edit, status: :unprocessable_entity
  end

  def destroy
    unless @goal.archived?
      redirect_to goal_path(@goal), alert: t(".archive_first")
      return
    end

    @goal.destroy!
    redirect_to goals_path, notice: t(".success")
  end

  def pause
    perform_transition!(:pause)
  end

  def resume
    perform_transition!(:resume)
  end

  def complete
    perform_transition!(:complete)
  end

  def archive
    perform_transition!(:archive)
  end

  def unarchive
    perform_transition!(:unarchive)
  end

  def reopen
    perform_transition!(:reopen)
  end

  private
    def set_goal
      @goal = Current.family.goals
                             .includes(:open_pledges, linked_accounts: :account_providers)
                             .find(params[:id])
    end

    def goal_not_found
      redirect_to goals_path, alert: t("goals.errors.not_found")
    end

    def goal_params
      params.require(:goal).permit(:name, :target_amount, :target_date, :color, :icon, :notes)
    end

    def goal_update_params
      params.require(:goal).permit(:name, :target_amount, :target_date, :color, :icon, :notes)
    end

    def lookup_accounts(ids)
      return [] if ids.blank?

      ids = Array(ids).reject(&:blank?)
      Current.user.accessible_accounts.where(accountable_type: FUNDABLE_TYPES).visible.where(id: ids).to_a
    end

    def linkable_accounts_for_new
      Current.user.accessible_accounts.where(accountable_type: FUNDABLE_TYPES).visible.alphabetically.to_a
    end

    def sync_linked_accounts!(goal, accounts, allocations = {})
      desired_ids = accounts.map(&:id).to_set
      current_ids = goal.goal_accounts.pluck(:account_id).to_set
      removable_ids = Current.user.accessible_accounts.where(id: current_ids.to_a).pluck(:id).to_set

      ((current_ids & removable_ids) - desired_ids).each do |id|
        goal.goal_accounts.where(account_id: id).destroy_all
      end
      goal.goal_accounts.reload

      accounts.each do |account|
        existing = goal.goal_accounts.find { |ga| ga.account_id == account.id }
        if existing
          existing.allocated_amount = allocations[account.id.to_s] if allocations.key?(account.id.to_s)
        else
          goal.goal_accounts.build(account: account, allocated_amount: allocations[account.id.to_s])
        end
      end
      goal.save!
    end

    def submitted_allocations
      raw = params.dig(:goal, :allocations)
      return {} if raw.blank?

      hash = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw
      hash.each_with_object({}) do |(account_id, amount), memo|
        memo[account_id.to_s] = amount.to_s.strip.presence
      end
    end

    def perform_transition!(event)
      if @goal.aasm.may_fire_event?(event)
        @goal.public_send("#{event}!")
        redirect_to goal_path(@goal), notice: t(".success")
      else
        redirect_to goal_path(@goal), alert: t(".invalid_transition")
      end
    end
end
