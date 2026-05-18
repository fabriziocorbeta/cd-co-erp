module FormatHelper
  def format_pyg(amount)
    return "₲ 0" if amount.nil?
    # PYG has no subunit (fractional is in PYG units directly)
    cents = amount.is_a?(Money) ? amount.fractional : amount.to_i
    "₲ #{number_with_delimiter(cents, delimiter: '.', separator: ',')}"
  end

  def format_date_py(date)
    return "" if date.nil?
    date.strftime("%d/%m/%Y")
  end

  def format_datetime_py(dt)
    return "" if dt.nil?
    dt.strftime("%d/%m/%Y %H:%M")
  end
end
