class FleetVehiclesController < ApplicationController
  include RequireBusinessMode

  before_action :set_fleet_vehicle, only: %i[show edit update destroy]

  def index
    @fleet_vehicles = Current.family.fleet_vehicles.includes(:fuel_logs).order(created_at: :desc)
  end

  def show
  end

  def new
    @fleet_vehicle = Current.family.fleet_vehicles.new
  end

  def create
    @fleet_vehicle = Current.family.fleet_vehicles.new(fleet_vehicle_params)

    if @fleet_vehicle.save
      redirect_to @fleet_vehicle, notice: t(".success")
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @fleet_vehicle.update(fleet_vehicle_params)
      redirect_to @fleet_vehicle, notice: t(".success")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @fleet_vehicle.destroy!
    redirect_to fleet_vehicles_url, notice: t(".success")
  end

  private

    def set_fleet_vehicle
      @fleet_vehicle = Current.family.fleet_vehicles.find(params[:id])
    end

    def fleet_vehicle_params
      params.require(:fleet_vehicle).permit(:plate, :brand, :model, :year, :status, :notes)
    end
end
