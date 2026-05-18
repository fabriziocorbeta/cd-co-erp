class StatementParseJob < ApplicationJob
  queue_as :default

  def perform(statement_import_id)
    import = StatementImport.find(statement_import_id)
    return if import.completed? || import.processing?

    import.update!(status: :processing)

    unless import.source_file.attached?
      raise StatementParser::ExtractionError, "No file attached to import"
    end

    content_type = import.source_file.content_type
    unless content_type == "application/pdf"
      raise StatementParser::ExtractionError, "Unsupported file type: #{content_type}"
    end

    file_bytes = import.source_file.download

    text = StatementParser::PdfExtractor.new(file_bytes).extract
    transactions = StatementParser::ClaudeParser.new(text, bank_name: import.bank_name).parse

    import.update!(
      status:           :review,
      raw_transactions: transactions.map(&:to_h),
      parsed_count:     transactions.length
    )
  rescue StatementParser::ExtractionError => e
    import&.update!(status: :failed, error_message: e.message)
  rescue ActiveRecord::RecordNotFound
    # Import deleted before job ran — nothing to do
  end
end
