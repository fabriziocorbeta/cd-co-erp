require "test_helper"

class TaxHelperTest < ActionView::TestCase
  include TaxHelper

  test "iva_amount returns 10% of gross for standard rate" do
    gross = Money.new(110_000, "PYG")
    assert_equal Money.new(10_000, "PYG"), iva_amount(gross, rate: :standard)
  end

  test "iva_amount returns 5% for reduced rate" do
    gross = Money.new(105_000, "PYG")
    assert_equal Money.new(5_000, "PYG"), iva_amount(gross, rate: :reduced)
  end

  test "net_amount removes IVA from gross" do
    gross = Money.new(110_000, "PYG")
    assert_equal Money.new(100_000, "PYG"), net_amount(gross, rate: :standard)
  end

  test "iva_amount returns 0 for exempt" do
    gross = Money.new(100_000, "PYG")
    assert_equal Money.new(0, "PYG"), iva_amount(gross, rate: :exempt)
  end

  test "iva_amount returns 0 for zero gross" do
    gross = Money.new(0, "PYG")
    assert_equal Money.new(0, "PYG"), iva_amount(gross, rate: :standard)
  end

  test "iva_amount raises on unknown rate" do
    gross = Money.new(110_000, "PYG")
    assert_raises(KeyError) { iva_amount(gross, rate: :bogus) }
  end

  test "net_amount returns gross for exempt rate" do
    gross = Money.new(100_000, "PYG")
    assert_equal gross, net_amount(gross, rate: :exempt)
  end
end
