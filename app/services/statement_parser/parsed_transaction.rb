module StatementParser
  class ParsedTransaction
    attr_reader :date, :description, :amount_cents, :currency, :transaction_type, :balance_cents

    def initialize(attrs)
      data = attrs.is_a?(Hash) ? attrs.transform_keys(&:to_sym) : attrs.to_h
      @date             = parse_date(data[:date])
      @description      = data[:description].to_s.strip
      @amount_cents     = data[:amount_cents].to_i
      @currency         = data[:currency]&.upcase || "PYG"
      @transaction_type = data[:transaction_type]&.to_sym || :unknown
      @balance_cents    = data[:balance_cents]&.to_i
    end

    def debit?  = transaction_type == :debit
    def credit? = transaction_type == :credit

    def to_h
      {
        date:             date&.iso8601,
        description:      description,
        amount_cents:     amount_cents,
        currency:         currency,
        transaction_type: transaction_type.to_s,
        balance_cents:    balance_cents
      }
    end

    private

      def parse_date(value)
        return nil if value.nil?
        value.is_a?(Date) ? value : Date.parse(value.to_s)
      rescue ArgumentError, TypeError
        nil
      end
  end
end
