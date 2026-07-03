# Compatibility aliases — Sure code still references Family/FamilyMembership.
# to_prepare runs after Zeitwerk loads the app, so Organization is resolvable
# (a plain initializer runs too early: defined?(Organization) is nil there).
Rails.application.config.to_prepare do
  Object.const_set(:Family, Organization) unless Object.const_defined?(:Family)
  Object.const_set(:FamilyMembership, OrganizationMembership) unless Object.const_defined?(:FamilyMembership)
end
