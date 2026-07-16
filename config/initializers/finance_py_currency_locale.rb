# frozen_string_literal: true

# config/locales/es.yml sets number.currency.format.unit to the Guaraní
# symbol (₲) for Paraguay, but the rails-i18n gem ships its own "es" locale
# pack with generic Spanish (Euro) currency defaults. Depending on I18n load
# order, the gem's translations can be loaded after the app's and silently
# win, showing "€" instead of "₲" to Paraguayan users.
#
# Re-applying these overrides in after_initialize guarantees they load last
# (after every gem, including rails-i18n) and always take precedence,
# regardless of I18n.load_path ordering.
Rails.application.config.after_initialize do
  guarani_currency = {
    number: {
      currency: {
        format: {
          unit: "₲",
          precision: 0,
          separator: ",",
          delimiter: ".",
          format: "%u %n"
        }
      }
    }
  }

  I18n.backend.store_translations(:es, guarani_currency)
  I18n.backend.store_translations(:"es-PY", guarani_currency)
end
