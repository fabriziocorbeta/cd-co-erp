require "test_helper"

module StatementParser
  class ClaudeParserTest < ActiveSupport::TestCase
    test "ParsedTransaction initializes from hash" do
      t = ParsedTransaction.new(
        date: "2026-05-01", description: "SUPERMERCADO STOCK",
        amount_cents: -15_000_000, currency: "PYG",
        transaction_type: "debit", balance_cents: 85_000_000
      )
      assert_equal Date.new(2026, 5, 1), t.date
      assert_equal "SUPERMERCADO STOCK", t.description
      assert_equal(-15_000_000, t.amount_cents)
      assert t.debit?
      assert_not t.credit?
    end

    test "ParsedTransaction handles nil date" do
      t = ParsedTransaction.new(date: nil, description: "X", amount_cents: 0)
      assert_nil t.date
    end

    test "ParsedTransaction to_h roundtrips" do
      t = ParsedTransaction.new(date: "2026-05-01", description: "TEST",
            amount_cents: 100, currency: "PYG",
            transaction_type: "credit", balance_cents: 200)
      h = t.to_h
      assert_equal "2026-05-01", h[:date]
      assert_equal "credit", h[:transaction_type]
    end
  end
end
