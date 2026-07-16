# frozen_string_literal: true

# config/locales/es.yml sets number.currency.format.unit to the Guaraní
# symbol (₲) for Paraguay, but the rails-i18n gem ships its own "es" locale
# pack with generic Spanish (Euro) currency defaults, and empirically wins
# over the app's own translation depending on I18n.load_path ordering.
#
# I18n::Backend::Chain checks a small dedicated override backend first and
# falls through to the real backend for every other key. A plain
# I18n::Backend::Simple instance isn't enough on its own: it lazily calls
# init_translations on first lookup (translate(..., do_init: true)), which
# reloads EVERY file in the *global* I18n.load_path (same broken order) and
# clobbers whatever was store_translations'd into it beforehand. Overriding
# init_translations as a no-op on this one instance guarantees its
# @translations only ever contains what's explicitly stored below.
require "i18n/backend/chain"

Rails.application.config.to_prepare do
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
    def overrides.init_translations
      @translations ||= {}
    end

    overrides.store_translations(:es, guarani_currency)
    overrides.store_translations(:"es-PY", guarani_currency)

    I18n.backend = I18n::Backend::Chain.new(overrides, I18n.backend)
  end
end
