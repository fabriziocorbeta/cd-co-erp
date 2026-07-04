require "test_helper"

class GoalPledgesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family = families(:dylan_family)
    sign_in users(:family_admin)

    @account = @family.accounts.create!(
      name: "Ahorros", balance: 5000, currency: "USD",
      accountable_type: "Depository", accountable_attributes: {}
    )
    @goal = Goal.new(family: @family, name: "Reserva", target_amount: 10000, currency: "USD")
    @goal.goal_accounts.build(account: @account)
    @goal.save!
  end

  test "should create pledge" do
    assert_difference -> { GoalPledge.count } do
      post goal_pledges_url(@goal), params: {
        goal_pledge: {
          account_id: @account.id,
          amount: 500
        }
      }
    end
    assert_redirected_to goal_url(@goal)
  end
end
