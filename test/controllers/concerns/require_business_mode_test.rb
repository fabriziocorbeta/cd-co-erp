require "test_helper"

# Exercises the concern through a real controller/route (FleetVehiclesController)
# instead of a synthetic route, since dynamically registering routes in a test
# (Rails.application.routes.draw/prepend) proved unreliable to make take effect
# for a single request without also disturbing sessions_path.
class RequireBusinessModeTest < ActionDispatch::IntegrationTest
  test "redirects to root when family has business mode disabled" do
    sign_in users(:family_admin)
    users(:family_admin).family.update!(business_mode_enabled: false)

    get fleet_vehicles_path

    assert_redirected_to root_path
  end

  test "allows the request through when business mode is enabled" do
    sign_in users(:family_admin)
    users(:family_admin).family.update!(business_mode_enabled: true)

    get fleet_vehicles_path

    assert_response :success
  end
end
