require "test_helper"

class VehicleTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @other_family = families(:empty)
  end

  test "validates presence of plate" do
    vehicle = Vehicle.new(family: @family, brand: "Toyota", model: "Corolla", plate: nil)
    assert_not vehicle.valid?
    assert_includes vehicle.errors[:plate], "can't be blank"
  end

  test "validates uniqueness of plate per family" do
    Vehicle.create!(family: @family, brand: "Toyota", model: "Corolla", plate: "ABC 123")

    duplicate_vehicle = Vehicle.new(family: @family, brand: "Honda", model: "Civic", plate: "ABC 123")
    assert_not duplicate_vehicle.valid?
    assert_includes duplicate_vehicle.errors[:plate], "has already been taken"

    # Same plate in a different family is valid
    other_family_vehicle = Vehicle.new(family: @other_family, brand: "Ford", model: "Focus", plate: "ABC 123")
    assert_predicate other_family_vehicle, :valid?
  end

  test "validates presence of brand and model" do
    vehicle = Vehicle.new(family: @family, plate: "XYZ 987", brand: nil, model: nil)
    assert_not vehicle.valid?
    assert_includes vehicle.errors[:brand], "can't be blank"
    assert_includes vehicle.errors[:model], "can't be blank"
  end

  test "status defaults to active" do
    vehicle = Vehicle.new(family: @family, plate: "XYZ 987", brand: "Nissan", model: "Sentra")
    assert_equal "active", vehicle.status
  end
end
