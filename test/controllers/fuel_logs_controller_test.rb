require "test_helper"

class FuelLogsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family_admin = users(:family_admin)
    @dylan_family = families(:dylan_family)
    @account = accounts(:other_asset)

    @dylan_family.update!(business_mode_enabled: true)

    sign_in @family_admin

    @fleet_vehicle = @dylan_family.fleet_vehicles.create!(
      plate: "AAA-123",
      brand: "Toyota",
      model: "Hilux"
    )

    @fuel_log = @fleet_vehicle.fuel_logs.create!(
      account: @account,
      liters: 50.5,
      cost: 150000,
      logged_at: Date.current
    )
  end

  test "should create fuel log" do
    assert_difference("FuelLog.count", 1) do
      post fleet_vehicle_fuel_logs_url(@fleet_vehicle), params: {
        fuel_log: {
          account_id: @account.id,
          liters: 45.0,
          cost: 135000,
          logged_at: Date.current
        }
      }
    end

    assert_redirected_to fleet_vehicle_url(@fleet_vehicle)
  end

  test "should destroy fuel log" do
    assert_difference("FuelLog.count", -1) do
      delete fleet_vehicle_fuel_log_url(@fleet_vehicle, @fuel_log)
    end

    assert_redirected_to fleet_vehicle_url(@fleet_vehicle)
  end

  test "redirects when business mode is disabled" do
    @dylan_family.update!(business_mode_enabled: false)

    post fleet_vehicle_fuel_logs_url(@fleet_vehicle), params: {
      fuel_log: {
        account_id: @account.id,
        liters: 45.0,
        cost: 135000,
        logged_at: Date.current
      }
    }
    assert_redirected_to root_url
  end
end
