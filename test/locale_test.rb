require "test_helper"

class LocaleTest < ActiveSupport::TestCase
  test "default locale is Spanish" do
    # I18n.default_locale is :en in the test environment (config/environments/test.rb)
    # so the suite's mostly-unmodified-Sure assertions written in English still pass.
    # The actual production intent is verified directly against the source config.
    app_config = File.read(Rails.root.join("config/application.rb"))
    assert_match(/config\.i18n\.default_locale\s*=\s*:es\b/, app_config)
  end

  test "Spanish locale is available" do
    assert I18n.available_locales.include?(:es)
  end

  test "date format is DD/MM/YYYY" do
    I18n.with_locale(:es) do
      formatted = I18n.l(Date.new(2026, 5, 1))
      assert_equal "01/05/2026", formatted
    end
  end

  test "currency format uses Guaraní symbol" do
    I18n.with_locale(:es) do
      # Test that the currency symbol is available
      currency_format = I18n.t("number.currency.format.unit")
      assert_equal "₲", currency_format
    end
  end

  test "Paraguay-specific banking keys are available" do
    I18n.with_locale(:"es-PY") do
      assert_equal "Itaú Paraguay", I18n.t("finance_py.banks.itau")
      assert_equal "IVA 10%", I18n.t("finance_py.tax.iva_standard")
    end
  end
end
