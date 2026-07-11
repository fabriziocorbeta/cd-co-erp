class Invitation < ApplicationRecord
  include Encryptable

  belongs_to :family
  belongs_to :inviter, class_name: "User"

  # Encrypt sensitive fields if ActiveRecord encryption is configured
  if encryption_ready?
    encrypts :token, deterministic: true
    encrypts :email, deterministic: true, downcase: true
  end

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, presence: true, inclusion: { in: %w[admin member guest] }
  validates :token, presence: true, uniqueness: true
  validate :no_duplicate_pending_invitation_in_family
  validate :inviter_is_admin
  validate :no_other_pending_invitation, on: :create

  before_validation :normalize_email
  before_validation :generate_token, on: :create
  before_validation :expire_stale_unaccepted_invitation, on: :create
  before_create :set_expiration

  scope :pending, -> { where(accepted_at: nil).where("expires_at > ?", Time.current) }
  scope :accepted, -> { where.not(accepted_at: nil) }

  def pending?
    accepted_at.nil? && expires_at > Time.current
  end

  def accept_for(user)
    return false if user.blank?
    return false unless pending?
    return false unless emails_match?(user)

    transaction do
      user.update!(family_id: family_id, role: role.to_s)
      update!(accepted_at: Time.current)
      auto_share_existing_accounts(user) if family.share_all_by_default?
    end
    true
  end

  private

    def emails_match?(user)
      inv_email = email.to_s.strip.downcase
      usr_email = user.email.to_s.strip.downcase
      inv_email.present? && usr_email.present? && inv_email == usr_email
    end

    def generate_token
      loop do
        self.token = SecureRandom.hex(32)
        break unless self.class.exists?(token: token)
      end
    end

    def set_expiration
      self.expires_at = 3.days.from_now
    end

    def normalize_email
      self.email = email.to_s.strip.downcase if email.present?
    end

    # The unique index on (email, family_id) only excludes accepted invitations
    # (WHERE accepted_at IS NULL), while the `pending` scope/`pending?` also
    # excludes expired ones. That gap let an expired-but-unaccepted invitation
    # pass the `no_duplicate_pending_invitation_in_family` validation and then
    # crash the insert with a raw PG::UniqueViolation. Clear the stale row
    # before validating so the two "pending" definitions can't disagree.
    def expire_stale_unaccepted_invitation
      return if email.blank? || family_id.blank?

      scope = self.class.where(family_id: family_id, accepted_at: nil)

      if self.class.encryption_ready?
        scope.where(email: email).delete_all
      else
        scope.where("LOWER(email) = ?", email.to_s.strip.downcase).delete_all
      end
    end

    def no_other_pending_invitation
      return if email.blank?

      existing = if self.class.encryption_ready?
        self.class.pending.where(email: email).where.not(family_id: family_id).exists?
      else
        self.class.pending.where("LOWER(email) = ?", email.downcase).where.not(family_id: family_id).exists?
      end

      if existing
        errors.add(:email, "already has a pending invitation from another family")
      end
    end

    def no_duplicate_pending_invitation_in_family
      return if email.blank?

      scope = self.class.pending.where(family_id: family_id)
      scope = scope.where.not(id: id) if persisted?

      exists = if self.class.encryption_ready?
        scope.where(email: email).exists?
      else
        scope.where("LOWER(email) = ?", email.to_s.strip.downcase).exists?
      end

      errors.add(:email, "has already been invited to this family") if exists
    end

    def inviter_is_admin
      inviter.admin?
    end

    def auto_share_existing_accounts(user)
      records = family.accounts.where.not(owner_id: user.id).pluck(:id).map do |account_id|
        { account_id: account_id, user_id: user.id, permission: "read_write",
          include_in_finances: true, created_at: Time.current, updated_at: Time.current }
      end

      AccountShare.insert_all(records, unique_by: %i[account_id user_id]) if records.any?
    end
end
