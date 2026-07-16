class DataCacheClearJob < ApplicationJob
  queue_as :low_priority

  def perform(family)
    ActiveRecord::Base.transaction do
      # ExchangeRate and Security::Price are shared reference data across all
      # families on the instance, not family-scoped — deleting them here (as
      # this job previously did, unconditionally) would wipe every other
      # family's cached rates/prices as a side effect of one family clearing
      # its own cache. Only clear what actually belongs to this family.
      family.accounts.each do |account|
        account.balances.delete_all
        account.holdings.delete_all
      end

      family.sync_later
    end
  end
end
