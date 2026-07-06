class FleetVehicle < ApplicationRecord
  belongs_to :family
  has_many :fuel_logs, foreign_key: :fleet_vehicle_id, dependent: :destroy

  enum :status, { active: "active", maintenance: "maintenance", inactive: "inactive" }, default: "active"

  validates :plate, presence: true, uniqueness: { scope: :family_id }
  validates :brand, presence: true
  validates :model, presence: true

  def average_fuel_efficiency
    logs = fuel_logs.where.not(odometer: nil).order(:logged_at)
    return nil if logs.size < 2

    valid_pairs_efficiencies = []

    logs.each_cons(2) do |prev_log, curr_log|
      distance = curr_log.odometer - prev_log.odometer
      liters = curr_log.liters

      if distance > 0 && liters > 0
        valid_pairs_efficiencies << (distance.to_f / liters)
      end
    end

    return nil if valid_pairs_efficiencies.empty?

    valid_pairs_efficiencies.sum / valid_pairs_efficiencies.size
  end
end
