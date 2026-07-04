require "test_helper"

class FleetVehicleTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @vehicle = FleetVehicle.new(
      family: @family,
      plate: "XYZ-123",
      brand: "Toyota",
      model: "Hilux"
    )
  end

  test "should be valid with valid attributes" do
    assert @vehicle.valid?
  end

  test "should require plate" do
    @vehicle.plate = nil
    assert_not @vehicle.valid?
    assert_includes @vehicle.errors[:plate], "can't be blank"
  end

  test "should require brand" do
    @vehicle.brand = nil
    assert_not @vehicle.valid?
    assert_includes @vehicle.errors[:brand], "can't be blank"
  end

  test "should require model" do
    @vehicle.model = nil
    assert_not @vehicle.valid?
    assert_includes @vehicle.errors[:model], "can't be blank"
  end

  test "plate should be unique within family" do
    @vehicle.save!

    duplicate_vehicle = FleetVehicle.new(
      family: @family,
      plate: "XYZ-123",
      brand: "Honda",
      model: "Civic"
    )
    assert_not duplicate_vehicle.valid?
    assert_includes duplicate_vehicle.errors[:plate], "has already been taken"
  end

  test "plate can be duplicated across different families" do
    @vehicle.save!

    # We create a new family dynamically since only dylan_family was requested
    other_family = Family.create!(name: "Other Family", currency: "pyg")

    other_vehicle = FleetVehicle.new(
      family: other_family,
      plate: "XYZ-123",
      brand: "Honda",
      model: "Civic"
    )
    assert other_vehicle.valid?
  end
end
