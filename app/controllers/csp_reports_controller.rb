# Receives Content-Security-Policy violation reports sent automatically by
# browsers while config.content_security_policy_report_only is true (see
# config/initializers/content_security_policy.rb). Used to build up evidence
# before flipping CSP_REPORT_ONLY=false to actually enforce the policy.
class CspReportsController < ApplicationController
  skip_authentication
  skip_forgery_protection

  def create
    report = JSON.parse(request.body.read)["csp-report"]
    Rails.logger.warn("[CSP Violation] #{report.to_json}") if report.present?
  rescue JSON::ParserError
    # Malformed report body — nothing to log, still 204 so the browser doesn't retry
  ensure
    head :no_content
  end
end
