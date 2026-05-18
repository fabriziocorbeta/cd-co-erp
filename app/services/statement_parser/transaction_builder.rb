module StatementParser
  class TransactionBuilder
    def initialize(account)
      @account = account
    end

    # Returns an unsaved Entry with a built Transaction entryable.
    # amount is stored as integer cents; sign convention follows Sure Finance:
    # negative = money leaving the account (debit), positive = money arriving (credit).
    def build(parsed)
      transaction = Transaction.new

      Entry.new(
        account: @account,
        date: parsed.date,
        name: parsed.description,
        amount: parsed.amount_cents,
        currency: parsed.currency,
        entryable: transaction
      )
    end

    def build_and_save!(parsed)
      raise ArgumentError, "Account must be persisted before importing transactions" unless @account.persisted?
      entry = build(parsed)
      entry.save!
      entry
    end
  end
end
