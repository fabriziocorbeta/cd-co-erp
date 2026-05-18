require "test_helper"

class FormatHelperTest < ActionView::TestCase
  include FormatHelper

  test "format_pyg uses dot as thousands delimiter" do
    # Money.new(fractional, currency) where fractional is in subunits
    # PYG has no subunit, so 1500000 = ₲1.500.000
    result = format_pyg(Money.new(1_500_000, "PYG"))
    assert_equal "₲ 1.500.000", result
  end

  test "format_pyg returns zero for nil" do
    assert_equal "₲ 0", format_pyg(nil)
  end

  test "format_pyg handles integer input" do
    result = format_pyg(50_000)
    assert_equal "₲ 50.000", result
  end

  test "format_date_py uses DD/MM/YYYY format" do
    result = format_date_py(Date.new(2026, 5, 1))
    assert_equal "01/05/2026", result
  end

  test "format_date_py returns empty string for nil" do
    assert_equal "", format_date_py(nil)
  end

  test "format_datetime_py includes time in DD/MM/YYYY HH:MM format" do
    result = format_datetime_py(Time.new(2026, 5, 1, 14, 30))
    assert_equal "01/05/2026 14:30", result
  end

  test "format_datetime_py returns empty string for nil" do
    assert_equal "", format_datetime_py(nil)
  end
end
