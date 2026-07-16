class RemoveStaleFamilyLevelRecurringTxnIndex < ActiveRecord::Migration[7.2]
  # 20260326112218 (AddAccountIdToRecurringTransactions) intended to replace the
  # original family-level unique index with account-scoped ones, but it tried to
  # drop indexes named "idx_recurring_txns_merchant" / "idx_recurring_txns_name" —
  # names that only exist inside that same migration's `down`. On any database
  # that ran the original CreateRecurringTransactions migration forward, the real
  # index is "idx_recurring_txns_on_family_merchant_amount_currency" (no
  # account_id), and `remove_index ..., if_exists: true` silently no-op'd on it.
  #
  # That stale family-level unique index still enforces uniqueness on
  # (family_id, merchant_id, amount, currency) with no account_id, so two
  # recurring transactions for the same merchant/amount/currency in two
  # different accounts raise ActiveRecord::RecordNotUnique. The per-account
  # indexes added by 20260326112218 make this index fully redundant.
  def up
    remove_index :recurring_transactions,
      name: "idx_recurring_txns_on_family_merchant_amount_currency",
      if_exists: true
  end

  def down
    add_index :recurring_transactions,
      [ :family_id, :merchant_id, :amount, :currency ],
      unique: true,
      name: "idx_recurring_txns_on_family_merchant_amount_currency"
  end
end
