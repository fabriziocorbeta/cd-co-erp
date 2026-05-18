require "test_helper"

class UserOrganizationRoleTest < ActiveSupport::TestCase
  test "user has platform_role" do
    user = User.new
    assert user.respond_to?(:platform_role)
  end

  test "platform_role defaults to client" do
    user = User.new
    assert_equal "client", user.platform_role
  end

  test "advisor? predicate works" do
    user = User.new(platform_role: :advisor)
    assert user.advisor?
  end

  test "super_admin? predicate works" do
    user = User.new(platform_role: :super_admin)
    assert user.super_admin?
  end
end
