class FuelLogsController < ApplicationController
  include RequireBusinessMode

  before_action :set_fleet_vehicle
  before_action :set_fuel_log, only: %i[destroy]

  def create
    @fuel_log = @fleet_vehicle.fuel_logs.new(fuel_log_params)

    if @fuel_log.save
      redirect_to @fleet_vehicle, notice: t(".success")
    else
      redirect_to @fleet_vehicle, alert: t(".error")
    end
  end

  def destroy
    @fuel_log.destroy!
    redirect_to @fleet_vehicle, notice: t(".success")
  end

  private

    def set_fleet_vehicle
      @fleet_vehicle = Current.family.fleet_vehicles.find(params[:fleet_vehicle_id])
    end

    def set_fuel_log
      @fuel_log = @fleet_vehicle.fuel_logs.find(params[:id])
    end

    def fuel_log_params
      params.require(:fuel_log).permit(:liters, :cost, :odometer, :currency, :logged_at, :notes)
    end
end
