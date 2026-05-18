module TaxHelper
  IVA_RATES = {
    standard: Rational(10, 110),
    reduced:  Rational(5,  105),
    exempt:   Rational(0,  1)
  }.freeze

  def iva_amount(gross_amount, rate: :standard)
    factor = IVA_RATES.fetch(rate)
    (gross_amount * factor).round
  end

  def net_amount(gross_amount, rate: :standard)
    gross_amount - iva_amount(gross_amount, rate: rate)
  end
end
