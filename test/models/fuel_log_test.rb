require "test_helper"

class FuelLogTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @account = accounts(:other_asset)
    @vehicle = FleetVehicle.create!(
      family: @family,
      plate: "XYZ-123",
      brand: "Toyota",
      model: "Hilux"
    )
    @fuel_log = FuelLog.new(
      fleet_vehicle: @vehicle,
      account: @account,
      liters: 50.5,
      cost: 350000,
      odometer: 15000,
      logged_at: Date.today
    )
  end

  test "should be valid with valid attributes" do
    assert @fuel_log.valid?, @fuel_log.errors.full_messages
  end

  test "should require account" do
    @fuel_log.account = nil
    assert_not @fuel_log.valid?
  end

  test "should require liters" do
    @fuel_log.liters = nil
    assert_not @fuel_log.valid?
  end

  test "liters must be greater than 0" do
    @fuel_log.liters = 0
    assert_not @fuel_log.valid?

    @fuel_log.liters = -1
    assert_not @fuel_log.valid?
  end

  test "should require cost" do
    @fuel_log.cost = nil
    assert_not @fuel_log.valid?
  end

  test "cost must be greater than or equal to 0" do
    @fuel_log.cost = -1
    assert_not @fuel_log.valid?

    @fuel_log.cost = 0
    assert @fuel_log.valid?
  end

  test "odometer must be greater than or equal to 0 if present" do
    @fuel_log.odometer = -1
    assert_not @fuel_log.valid?

    @fuel_log.odometer = 0
    assert @fuel_log.valid?

    @fuel_log.odometer = nil
    assert @fuel_log.valid?
  end

  test "should require logged_at" do
    @fuel_log.logged_at = nil
    assert_not @fuel_log.valid?
  end

  test "account belongs to family" do
    other_family = Family.create!(name: "Other Family", currency: "usd")
    other_account = other_family.accounts.create!(name: "Other Account", currency: "usd", balance: 100, accountable: Depository.new)
    @fuel_log.account = other_account
    assert_not @fuel_log.valid?
  end

  test "should create entry and sync" do
    assert_difference "Entry.count", 1 do
      @fuel_log.save!
    end
    assert_equal @fuel_log.entry.amount, @fuel_log.cost
  end
end
