module StatementParser
  class PdfExtractor
    def initialize(bytes)
      @bytes = bytes
    end

    def extract
      reader = PDF::Reader.new(StringIO.new(@bytes))
      text = reader.pages.map(&:text).join("\n")
      raise ExtractionError, "PDF produced no text (may be scanned image)" if text.strip.empty?
      text
    rescue PDF::Reader::MalformedPDFError, PDF::Reader::EncryptedPDFError => e
      raise ExtractionError, "PDF extraction failed: #{e.message}"
    rescue ArgumentError => e
      raise ExtractionError, "Invalid PDF data: #{e.message}"
    end
  end
end
