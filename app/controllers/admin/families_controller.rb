class Admin::FamiliesController < Admin::BaseController
  def index
    @families = Family.order(:name)
  end

  def update
    family = Family.find(params[:id])
    family.update!(business_mode_enabled: family_params[:business_mode_enabled])
    redirect_to admin_families_path, notice: "Updated #{family.name}."
  end

  private
    def family_params
      params.require(:family).permit(:business_mode_enabled)
    end
end
