# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self, :https
    policy.font_src    :self, :https, :data
    policy.img_src     :self, :https, :data
    policy.object_src  :none
    policy.script_src  :self, :https, "https://us.i.posthog.com"
    policy.style_src   :self, :https
    policy.connect_src :self, :https, "https://us.i.posthog.com"
  end

  # Generate session nonces for permitted importmap, inline scripts, and inline styles.
  config.content_security_policy_nonce_generator = ->(request) { request.session.id.to_s }
  config.content_security_policy_nonce_directives = %w(script-src style-src)

  # Ship in report-only mode first so violations surface without breaking the
  # app. Flip to enforce (remove this line / set to false) once the reports are
  # clean. Override via CSP_REPORT_ONLY=false to enforce immediately.
  config.content_security_policy_report_only = ENV.fetch("CSP_REPORT_ONLY", "true") != "false"
end
