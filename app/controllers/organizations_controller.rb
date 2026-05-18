class OrganizationsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_organization

  def show
  end

  def edit
  end

  def update
    if @organization.update(organization_params)
      redirect_to organization_path(@organization), notice: t(".success")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_organization
    @organization = current_organization
    authorize @organization
  end

  def organization_params
    params.require(:organization).permit(:name, :country, :locale, :date_format, :start_date_at, :moniker, :assistant_type, :default_account_sharing)
  end
end
