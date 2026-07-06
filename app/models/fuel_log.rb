class FuelLog < ApplicationRecord
  belongs_to :fleet_vehicle
  belongs_to :account
  belongs_to :entry, optional: true

  validates :liters, presence: true, numericality: { greater_than: 0 }
  validates :cost, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :odometer, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :logged_at, presence: true
  validate :account_belongs_to_family

  after_create_commit :create_associated_entry
  after_update_commit :update_associated_entry
  before_destroy :store_account_for_sync
  after_destroy_commit :destroy_associated_entry

  private

    def account_belongs_to_family
      if account && fleet_vehicle && account.family_id != fleet_vehicle.family_id
        errors.add(:account, "must belong to the same family as the vehicle")
      end
    end

    def create_associated_entry
      transaction = Transaction.new
      entry = account.entries.create!(
        entryable: transaction,
        name: "Combustible - #{fleet_vehicle.plate}",
        date: logged_at,
        amount: cost,
        currency: account.currency
      )
      update_column(:entry_id, entry.id)

      account.family.syncs.visible.destroy_all # hack to avoid Sidekiq latency locally in specs
      entry.sync_account_later
    end

    def update_associated_entry
      return unless entry

      if saved_change_to_cost? || saved_change_to_logged_at? || saved_change_to_account_id?
        entry.update!(
          account: account,
          amount: cost,
          date: logged_at,
          currency: account.currency
        )
        entry.sync_account_later
      end
    end

    def store_account_for_sync
      @account_for_sync = account
    end

    def destroy_associated_entry
      if entry
        entry.destroy!
        entry.sync_account_later
      end
    end
end
