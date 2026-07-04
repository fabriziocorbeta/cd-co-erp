require "test_helper"

class FuelLogTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @vehicle = Vehicle.create!(family: @family, brand: "Toyota", model: "Corolla", plate: "ABC 123")
  end

  test "validates liters > 0" do
    fuel_log = FuelLog.new(vehicle: @vehicle, cost: 50000, logged_at: Date.current, liters: 0)
    assert_not fuel_log.valid?
    assert_includes fuel_log.errors[:liters], "must be greater than 0"

    fuel_log.liters = 10.5
    assert_predicate fuel_log, :valid?
  end

  test "validates cost >= 0" do
    fuel_log = FuelLog.new(vehicle: @vehicle, liters: 10, logged_at: Date.current, cost: -1000)
    assert_not fuel_log.valid?
    assert_includes fuel_log.errors[:cost], "must be greater than or equal to 0"

    fuel_log.cost = 0
    assert_predicate fuel_log, :valid?

    fuel_log.cost = 50000
    assert_predicate fuel_log, :valid?
  end

  test "validates odometer >= 0 if present" do
    fuel_log = FuelLog.new(vehicle: @vehicle, liters: 10, cost: 50000, logged_at: Date.current)

    # allow_nil
    assert_predicate fuel_log, :valid?

    fuel_log.odometer = -5
    assert_not fuel_log.valid?
    assert_includes fuel_log.errors[:odometer], "must be greater than or equal to 0"

    fuel_log.odometer = 150000
    assert_predicate fuel_log, :valid?
  end

  test "validates logged_at presence" do
    fuel_log = FuelLog.new(vehicle: @vehicle, liters: 10, cost: 50000, logged_at: nil)
    assert_not fuel_log.valid?
    assert_includes fuel_log.errors[:logged_at], "can't be blank"
  end

  test "currency defaults to pyg" do
    fuel_log = FuelLog.new(vehicle: @vehicle, liters: 10, cost: 50000, logged_at: Date.current)
    assert_equal "pyg", fuel_log.currency
  end
end
