module RequireBusinessMode
  extend ActiveSupport::Concern

  included do
    before_action :require_business_mode!
  end

  private
    def require_business_mode!
      redirect_to root_path, alert: "This feature isn't enabled for your family." unless Current.family.business_mode_enabled?
    end
end
