require "test_helper"

class FuelLogTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @vehicle = FleetVehicle.create!(
      family: @family,
      plate: "XYZ-123",
      brand: "Toyota",
      model: "Hilux"
    )
    @fuel_log = FuelLog.new(
      fleet_vehicle: @vehicle,
      liters: 50.5,
      cost: 350000,
      odometer: 15000,
      logged_at: Date.today
    )
  end

  test "should be valid with valid attributes" do
    assert @fuel_log.valid?
  end

  test "should require liters" do
    @fuel_log.liters = nil
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:liters], "can't be blank"
  end

  test "liters must be greater than 0" do
    @fuel_log.liters = 0
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:liters], "must be greater than 0"

    @fuel_log.liters = -1
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:liters], "must be greater than 0"
  end

  test "should require cost" do
    @fuel_log.cost = nil
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:cost], "can't be blank"
  end

  test "cost must be greater than or equal to 0" do
    @fuel_log.cost = -1
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:cost], "must be greater than or equal to 0"

    @fuel_log.cost = 0
    assert @fuel_log.valid?
  end

  test "odometer must be greater than or equal to 0 if present" do
    @fuel_log.odometer = -1
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:odometer], "must be greater than or equal to 0"

    @fuel_log.odometer = 0
    assert @fuel_log.valid?

    @fuel_log.odometer = nil
    assert @fuel_log.valid?
  end

  test "should require logged_at" do
    @fuel_log.logged_at = nil
    assert_not @fuel_log.valid?
    assert_includes @fuel_log.errors[:logged_at], "can't be blank"
  end
end
