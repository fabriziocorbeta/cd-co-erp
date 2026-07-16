# frozen_string_literal: true

# config/locales/es.yml sets number.currency.format.unit to the Guaraní
# symbol (₲) for Paraguay, but the rails-i18n gem ships its own "es" locale
# pack with generic Spanish (Euro) currency defaults, and empirically wins
# over the app's own translation regardless of I18n.load_path ordering.
#
# A plain I18n::Backend::Simple instance isn't a safe override vehicle: its
# lazy translate(..., do_init: true) reloads EVERY file in the *global*
# I18n.load_path (same broken order) into itself on first real lookup,
# clobbering anything pre-loaded via store_translations. This backend is a
# minimal, from-scratch implementation with no load_path/file dependency at
# all — it can only ever return exactly what's hardcoded below, or raise
# I18n::MissingTranslationData so I18n::Backend::Chain falls through to the
# real backend for every other key.
require "i18n/backend/chain"

module FinancePyLocaleOverrides
  GUARANI_CURRENCY_FORMAT = {
    unit: "₲",
    precision: 0,
    separator: ",",
    delimiter: ".",
    format: "%u %n"
  }.freeze

  DATA = {
    es: { number: { currency: { format: GUARANI_CURRENCY_FORMAT } } },
    :"es-PY" => { number: { currency: { format: GUARANI_CURRENCY_FORMAT } } }
  }.freeze

  class Backend
    def available_locales
      DATA.keys
    end

    def translate(locale, key, options = {})
      scope = DATA[locale.to_sym]
      raise I18n::MissingTranslationData.new(locale, key, options) unless scope

      value = key.to_s.split(".").reduce(scope) do |acc, segment|
        acc.is_a?(Hash) ? acc[segment.to_sym] : nil
      end
      raise I18n::MissingTranslationData.new(locale, key, options) if value.nil?

      value
    end

    def exists?(locale, key)
      scope = DATA[locale.to_sym]
      return false unless scope

      !key.to_s.split(".").reduce(scope) { |acc, segment| acc.is_a?(Hash) ? acc[segment.to_sym] : nil }.nil?
    end

    def localize(*)
      raise I18n::MissingTranslationData.new(nil, nil, {})
    end

    def pluralize(*)
      raise I18n::MissingTranslationData.new(nil, nil, {})
    end
  end
end

Rails.application.config.to_prepare do
  unless I18n.backend.is_a?(I18n::Backend::Chain) &&
         I18n.backend.backends.any? { |b| b.is_a?(FinancePyLocaleOverrides::Backend) }
    I18n.backend = I18n::Backend::Chain.new(FinancePyLocaleOverrides::Backend.new, I18n.backend)
  end
end
