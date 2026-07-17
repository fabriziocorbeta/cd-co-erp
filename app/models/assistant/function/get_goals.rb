class Assistant::Function::GetGoals < Assistant::Function
  class << self
    def name
      "get_goals"
    end

    def description
      <<~INSTRUCTIONS
        Use this to get the user's savings/financial goals and their progress.

        This is great for answering questions like:
        - How's my [goal name] goal going?
        - How much more do I need to save for [goal]?
        - What are my active goals?

        Simple example:

        ```
        get_goals({})
        ```
      INSTRUCTIONS
    end
  end

  def call(params = {})
    goals = family.goals.where.not(state: "archived")

    {
      currency: family.currency,
      goals: goals.map { |goal| goal_data(goal) }
    }
  end

  def params_schema
    build_schema
  end

  private
    def goal_data(goal)
      {
        name: goal.name,
        status: goal.display_status,
        target_amount: goal.target_amount_money.format,
        current_amount: goal.current_balance_money.format,
        remaining_amount: goal.remaining_amount_money.format,
        progress_percent: "#{goal.progress_percent}%",
        target_date: goal.target_date
      }
    end
end
