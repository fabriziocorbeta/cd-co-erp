# frozen_string_literal: true

require "test_helper"

class OrganizationPolicyTest < ActiveSupport::TestCase
  def setup
    @org = Organization.new(name: "Test", slug: "test", country: "PY", plan: :free)
    @owner    = User.new(platform_role: :advisor)
    @advisor  = User.new(platform_role: :advisor)
    @client   = User.new(platform_role: :client)
    @outsider = User.new(platform_role: :client)
  end

  test "OrganizationPolicy defines expected action methods" do
    assert OrganizationPolicy.instance_methods(false).include?(:show?)
    assert OrganizationPolicy.instance_methods(false).include?(:update?)
    assert OrganizationPolicy.instance_methods(false).include?(:destroy?)
    assert OrganizationPolicy.instance_methods(false).include?(:manage_members?)
  end

  test "OrganizationPolicy::Scope exists and inherits from ApplicationPolicy::Scope" do
    assert defined?(OrganizationPolicy::Scope)
    assert OrganizationPolicy::Scope.ancestors.include?(ApplicationPolicy::Scope)
  end

  test "OrganizationPolicy::Scope responds to resolve" do
    assert OrganizationPolicy::Scope.instance_methods(false).include?(:resolve)
  end
end
