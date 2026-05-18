ENV["ANTHROPIC_API_KEY"] ||= Rails.application.credentials.dig(:anthropic, :api_key).to_s
