module StatementParser
  class ClaudeParser
    SYSTEM_PROMPT = <<~PROMPT.freeze
      You are a financial data extractor for Paraguayan bank statements.
      Extract ALL transactions. Return ONLY valid JSON array, no markdown.

      Each object:
      - "date": "YYYY-MM-DD"
      - "description": string (preserve original)
      - "amount_cents": integer (negative=debit, positive=credit; PYG: multiply by 100, e.g. 150,000 Gs = 15000000)
      - "currency": "PYG" (or detected)
      - "transaction_type": "debit" or "credit"
      - "balance_cents": integer or null

      Skip headers, totals, page footers.
    PROMPT

    MODEL = "claude-sonnet-4-6"

    def initialize(text, bank_name: nil)
      @text      = text
      @bank_name = bank_name
      @client    = Anthropic::Client.new(api_key: ENV.fetch("ANTHROPIC_API_KEY"))
    end

    def parse
      response = @client.messages(
        model:      MODEL,
        max_tokens: 8192,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: user_prompt }]
      )
      raw_json = response.content.first.text
      transactions = JSON.parse(raw_json)
      raise ExtractionError, "Expected array, got #{transactions.class}" unless transactions.is_a?(Array)
      transactions.map { |t| ParsedTransaction.new(t) }
    rescue JSON::ParserError => e
      raise ExtractionError, "Claude returned invalid JSON: #{e.message}"
    rescue KeyError
      raise ExtractionError, "ANTHROPIC_API_KEY not set"
    end

    private

    def user_prompt
      parts = @bank_name.present? ? ["Bank: #{@bank_name}"] : []
      parts << "Statement:\n\n#{@text}"
      parts.join("\n")
    end
  end
end
