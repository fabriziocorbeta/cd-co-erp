require "test_helper"

class CurrenciesTest < ActiveSupport::TestCase
  test "PYG currency exists and has correct symbol" do
    pyg = Money::Currency.find("PYG")
    assert_not_nil pyg
    assert_equal "₲", pyg.symbol
  end

  test "default currency is PYG" do
    assert_equal "PYG", Money.default_currency.iso_code
  end
end
