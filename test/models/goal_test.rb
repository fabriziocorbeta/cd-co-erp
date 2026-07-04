require "test_helper"

class GoalTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @account = @family.accounts.create!(
      name: "Caja Fuerte", balance: 5000, currency: "USD",
      accountable_type: "Depository", accountable_attributes: {}
    )
  end

  test "valid goal requires at least one linked account" do
    goal = Goal.new(family: @family, name: "Auto Nuevo", target_amount: 10000, currency: "USD")
    assert_not goal.valid?

    goal.goal_accounts.build(account: @account)
    assert goal.valid?
  end

  test "state transitions work properly" do
    goal = Goal.new(family: @family, name: "Viaje", target_amount: 10000, currency: "USD")
    goal.goal_accounts.build(account: @account)
    goal.save!

    assert goal.active?
    goal.pause!
    assert goal.paused?
    goal.complete!
    assert goal.completed?
    goal.archive!
    assert goal.archived?
  end
end
