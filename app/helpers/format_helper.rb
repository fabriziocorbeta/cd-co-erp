module FormatHelper
  def format_pyg(amount)
    return "₲ 0" if amount.nil?
    # Sure's custom Money exposes .amount (BigDecimal); PYG has no decimals
    value = amount.is_a?(Money) ? amount.amount.to_i : amount.to_i
    "₲ #{number_with_delimiter(value, delimiter: '.', separator: ',')}"
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
