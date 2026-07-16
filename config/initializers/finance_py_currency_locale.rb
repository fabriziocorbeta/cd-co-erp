# frozen_string_literal: true

# config/locales/es.yml sets number.currency.format.unit to the Guaraní
# symbol (₲) for Paraguay, but the rails-i18n gem ships its own "es" locale
# pack with generic Spanish (Euro) currency defaults, and empirically wins
# depending on I18n.load_path ordering between the app and its gems.
#
# I18n::Backend::Chain checks each backend in order and returns the first
# one that has the requested key, independent of I18n.load_path ordering or
# lazy-init timing — the standard pattern for guaranteeing a small set of
# overrides always wins over gem-provided translations for the same keys.
require "i18n/backend/chain"

Rails.application.config.to_prepare do
  # Idempotent: to_prepare re-runs on every request in dev (class reloading),
  # so guard against re-wrapping the backend each time.
  unless I18n.backend.is_a?(I18n::Backend::Chain)
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

    overrides = I18n::Backend::Simple.new
    overrides.store_translations(:es, guarani_currency)
    overrides.store_translations(:"es-PY", guarani_currency)

    I18n.backend = I18n::Backend::Chain.new(overrides, I18n.backend)
  end
end
