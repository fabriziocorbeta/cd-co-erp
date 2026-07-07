require "test_helper"

class FleetVehiclesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family_admin = users(:family_admin)
    @dylan_family = families(:dylan_family)

    # Enable business mode for the main test family
    @dylan_family.update!(business_mode_enabled: true)

    sign_in @family_admin

    @fleet_vehicle = @dylan_family.fleet_vehicles.create!(
      plate: "AAA-123",
      brand: "Toyota",
      model: "Hilux"
    )
  end

  test "should get index" do
    get fleet_vehicles_url
    assert_response :success
  end

  test "should get new" do
    get new_fleet_vehicle_url
    assert_response :success
  end

  test "should create fleet vehicle" do
    assert_difference("FleetVehicle.count", 1) do
      post fleet_vehicles_url, params: {
        fleet_vehicle: {
          plate: "BBB-456",
          brand: "Ford",
          model: "Ranger"
        }
      }
    end

    assert_redirected_to fleet_vehicle_url(FleetVehicle.order(created_at: :asc).last)
    assert_equal "BBB-456", FleetVehicle.order(created_at: :asc).last.plate
  end

  test "should show fleet vehicle" do
    get fleet_vehicle_url(@fleet_vehicle)
    assert_response :success
  end

  test "should get edit" do
    get edit_fleet_vehicle_url(@fleet_vehicle)
    assert_response :success
  end

  test "should update fleet vehicle" do
    patch fleet_vehicle_url(@fleet_vehicle), params: {
      fleet_vehicle: {
        model: "Hilux Revo"
      }
    }
    assert_redirected_to fleet_vehicle_url(@fleet_vehicle)
    @fleet_vehicle.reload
    assert_equal "Hilux Revo", @fleet_vehicle.model
  end

  test "should destroy fleet vehicle" do
    assert_difference("FleetVehicle.count", -1) do
      delete fleet_vehicle_url(@fleet_vehicle)
    end

    assert_redirected_to fleet_vehicles_url
  end

  test "redirects when business mode is disabled" do
    @dylan_family.update!(business_mode_enabled: false)

    get fleet_vehicles_url
    assert_redirected_to root_url
  end

  test "cannot access fleet vehicle from another family" do
    other_family = Family.create!(name: "Other Family", business_mode_enabled: true, currency: "pyg")
    other_vehicle = other_family.fleet_vehicles.create!(
      plate: "CCC-789",
      brand: "Nissan",
      model: "Frontier"
    )

    get fleet_vehicle_url(id: other_vehicle.id)
    assert_response :not_found
  end
end
