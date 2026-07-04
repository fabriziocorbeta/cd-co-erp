require "test_helper"

class GoalPledgeTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @account = @family.accounts.create!(
      name: "Inversión", balance: 5000, currency: "USD",
      accountable_type: "Investment", accountable_attributes: {}
    )
    @goal = Goal.new(family: @family, name: "Fondo", target_amount: 10000, currency: "USD")
    @goal.goal_accounts.build(account: @account)
    @goal.save!
  end

  test "cannot have duplicate open pledges for same account and amount" do
    @goal.goal_pledges.create!(account: @account, amount: 100, currency: "USD", status: "open", expires_at: 1.week.from_now)
    pledge2 = @goal.goal_pledges.build(account: @account, amount: 100, currency: "USD", status: "open", expires_at: 1.week.from_now)

    assert_not pledge2.valid?
  end

  test "extend! updates expiration date" do
    pledge = @goal.goal_pledges.create!(account: @account, amount: 100, currency: "USD", status: "open", expires_at: Time.current + 7.days)

    pledge.extend!(days: 7)
    assert_in_delta (Time.current + 14.days).to_f, pledge.expires_at.to_f, 2
  end
end
