require "test_helper"

class GoalsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family = families(:dylan_family)
    sign_in users(:family_admin)

    @account = @family.accounts.create!(
      name: "Ahorros", balance: 5000, currency: "USD",
      accountable_type: "Depository", accountable_attributes: {}
    )
  end

  test "should create goal" do
    assert_difference -> { Goal.count } do
      post goals_url, params: {
        goal: {
          name: "Nuevo Techo",
          target_amount: 5000,
          target_date: 1.year.from_now.to_date,
          color: "#ff0000",
          account_ids: [ @account.id ],
          allocations: { @account.id.to_s => "" }
        }
      }
    end
    assert_redirected_to goal_url(Goal.last)
  end

  test "cannot see goals from other family" do
    other_family = families(:empty)
    other_account = other_family.accounts.create!(
      name: "Oculto", balance: 5000, currency: "USD",
      accountable_type: "Depository", accountable_attributes: {}
    )
    other_goal = Goal.new(family: other_family, name: "Privado", target_amount: 5000, currency: "USD")
    other_goal.goal_accounts.build(account: other_account)
    other_goal.save!

    assert_raises(ActiveRecord::RecordNotFound) do
      get goal_url(other_goal)
    end
  end
end
