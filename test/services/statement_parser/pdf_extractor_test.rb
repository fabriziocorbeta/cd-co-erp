require "test_helper"

module StatementParser
  class PdfExtractorTest < ActiveSupport::TestCase
    test "raises ExtractionError on corrupt data" do
      extractor = PdfExtractor.new("not a pdf")
      assert_raises(StatementParser::ExtractionError) { extractor.extract }
    end

    test "raises ExtractionError on empty bytes" do
      extractor = PdfExtractor.new("")
      assert_raises(StatementParser::ExtractionError) { extractor.extract }
    end

    test "returns String on valid PDF" do
      # Minimal valid PDF bytes that produce at least some text
      # Using a pre-built minimal PDF fixture approach
      skip "Requires real PDF fixture — add test/fixtures/files/sample_statement.pdf"
    end
  end
end
