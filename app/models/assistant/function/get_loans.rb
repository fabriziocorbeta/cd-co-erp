class Assistant::Function::GetLoans < Assistant::Function
  class << self
    def name
      "get_loans"
    end

    def description
      <<~INSTRUCTIONS
        Use this to get details about the user's loans: balance, interest rate, term, and
        calculated monthly payment for each loan account.

        This is great for answering questions like:
        - Tell me about my [loan name] loan
        - What's my monthly payment on [loan]?
        - How much do I still owe on my loans?
        - What's my total loan debt?

        Simple example:

        ```
        get_loans({})
        ```
      INSTRUCTIONS
    end
  end

  def call(params = {})
    loan_accounts = family.accounts.visible.where(accountable_type: "Loan").includes(:accountable)

    {
      currency: family.currency,
      total_loan_balance: format_money(loan_accounts.sum(&:balance)),
      loans: loan_accounts.map { |account| loan_data(account) }
    }
  end

  def params_schema
    build_schema
  end

  private
    def loan_data(account)
      loan = account.accountable

      {
        name: account.name,
        subtype: Loan::SUBTYPES.dig(loan.subtype, :long) || "Other Loan",
        current_balance: format_money(account.balance),
        original_balance: format_money(loan.original_balance),
        interest_rate: loan.interest_rate.present? ? "#{loan.interest_rate}% (#{loan.rate_type})" : nil,
        term_months: loan.term_months,
        monthly_payment: loan.monthly_payment&.format
      }
    end

    def format_money(value)
      Money.new(value, family.currency).format
    end
end
