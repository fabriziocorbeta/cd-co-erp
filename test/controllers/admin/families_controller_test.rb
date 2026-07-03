require "test_helper"

class Admin::FamiliesControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in users(:sure_support_staff)
  end

  test "index lists families" do
    get admin_families_url
    assert_response :success
    assert_includes response.body, families(:dylan_family).name
  end

  test "update toggles business_mode_enabled" do
    family = families(:dylan_family)
    assert_not family.business_mode_enabled?

    patch admin_family_url(family), params: { family: { business_mode_enabled: true } }

    assert_redirected_to admin_families_url
    assert family.reload.business_mode_enabled?
  end

  test "non-super-admin is redirected" do
    sign_in users(:family_admin)

    get admin_families_url

    assert_redirected_to root_path
  end
end
