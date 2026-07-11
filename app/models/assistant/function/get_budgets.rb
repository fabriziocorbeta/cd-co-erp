class Assistant::Function::GetBudgets < Assistant::Function
  include ActiveSupport::NumberHelper

  class << self
    def name
      "get_budgets"
    end

    def description
      <<~INSTRUCTIONS
        Use this to get the user's budget for a specific month: how much is budgeted vs. actually
        spent per category, and what remains unallocated or uncategorized.

        This is great for answering questions like:
        - How much have I spent on [category] this month?
        - Am I over or under budget?
        - What's left in my budget?
        - How much is uncategorized this month?

        Simple example:

        ```
        get_budgets({ month: "2026-07" })
        ```
      INSTRUCTIONS
    end
  end

  def call(params = {})
    start_date = params["month"].present? ? Date.strptime(params["month"], "%Y-%m") : Date.current.beginning_of_month
    budget = Budget.find_or_bootstrap(family, start_date: start_date, user: user)

    return { error: "No budget available for that month" } if budget.nil?

    {
      currency: family.currency,
      period: { start_date: budget.start_date, end_date: budget.end_date },
      initialized: budget.initialized?,
      totals: {
        budgeted_spending: format_money(budget.budgeted_spending || 0),
        actual_spending: format_money(budget.actual_spending),
        available_to_spend: format_money(budget.available_to_spend),
        expected_income: format_money(budget.expected_income || 0),
        actual_income: format_money(budget.actual_income),
        available_to_allocate: format_money(budget.available_to_allocate)
      },
      categories: category_breakdown(budget),
      uncategorized: uncategorized_breakdown(budget)
    }
  end

  def params_schema
    build_schema(
      required: [ "month" ],
      properties: {
        month: {
          type: "string",
          description: "Month to get the budget for, in YYYY-MM format"
        }
      }
    )
  end

  private
    def format_money(value)
      Money.new(value, family.currency).format
    end

    def category_breakdown(budget)
      budget.budget_categories.reject(&:subcategory?).sort_by { |bc| -budget.budget_category_actual_spending(bc) }.map do |bc|
        {
          name: bc.category.name,
          budgeted: format_money(bc.budgeted_spending || 0),
          actual: format_money(budget.budget_category_actual_spending(bc)),
          available: format_money((bc.budgeted_spending || 0) - budget.budget_category_actual_spending(bc))
        }
      end
    end

    def uncategorized_breakdown(budget)
      bc = budget.uncategorized_budget_category
      {
        actual: format_money(budget.budget_category_actual_spending(bc)),
        note: "Transactions with no category assigned, including standalone payments that were never linked as a transfer (e.g. a manual loan/credit-card payment recorded as a plain transaction)."
      }
    end
end
