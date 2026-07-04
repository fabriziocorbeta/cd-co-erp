class FleetVehicle < ApplicationRecord
  belongs_to :family
  has_many :fuel_logs, foreign_key: :fleet_vehicle_id, dependent: :destroy

  enum :status, { active: "active", maintenance: "maintenance", inactive: "inactive" }, default: "active"

  validates :plate, presence: true, uniqueness: { scope: :family_id }
  validates :brand, presence: true
  validates :model, presence: true
end
