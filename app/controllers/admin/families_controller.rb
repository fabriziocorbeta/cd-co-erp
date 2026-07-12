class Admin::FamiliesController < Admin::BaseController
  def index
    @families = Family.order(:name)
  end

  def update
    family = Family.find(params[:id])

    old_business_mode = family.business_mode_enabled
    new_business_mode = ActiveRecord::Type::Boolean.new.cast(family_params[:business_mode_enabled])

    family.update!(business_mode_enabled: new_business_mode)

    if new_business_mode && !old_business_mode
      family.sync_inventory_account!

      account = family.accounts.find_by(name: "Mercadería", accountable_type: "OtherAsset")
      if account&.disabled?
        account.enable!
      end
    elsif !new_business_mode && old_business_mode
      account = family.accounts.find_by(name: "Mercadería", accountable_type: "OtherAsset")
      account&.disable!
    end

    redirect_to admin_families_path, notice: "Updated #{family.name}."
  end

  private
    def family_params
      params.require(:family).permit(:business_mode_enabled)
    end
end
