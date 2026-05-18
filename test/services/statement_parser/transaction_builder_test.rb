require "test_helper"

module StatementParser
  class TransactionBuilderTest < ActiveSupport::TestCase
    def setup
      @parsed = ParsedTransaction.new(
        date: "2026-05-01",
        description: "SUPERMERCADO STOCK",
        amount_cents: -15_000_000,
        currency: "PYG",
        transaction_type: :debit,
        balance_cents: 85_000_000
      )
    end

    test "build returns an Entry instance" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_kind_of Entry, entry
    end

    test "built entry has correct date" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_equal Date.new(2026, 5, 1), entry.date
    end

    test "built entry has correct name from description" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_equal "SUPERMERCADO STOCK", entry.name
    end

    test "built entry has correct amount in cents" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_equal(-15_000_000, entry.amount)
    end

    test "built entry has correct currency" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_equal "PYG", entry.currency
    end

    test "built entry is not persisted" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_not entry.persisted?
    end

    test "built entry has a Transaction entryable" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_kind_of Transaction, entry.entryable
    end

    test "built entry references the given account" do
      account = Account.new
      builder = TransactionBuilder.new(account)
      entry = builder.build(@parsed)
      assert_equal account, entry.account
    end
  end
end
