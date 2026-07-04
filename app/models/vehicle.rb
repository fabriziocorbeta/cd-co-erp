class Vehicle < ApplicationRecord
  include RequireBusinessMode

  belongs_to :family
  has_many :fuel_logs, dependent: :destroy

  enum :status, { active: "active", maintenance: "maintenance", inactive: "inactive" }, default: "active"

  validates :plate, presence: true, uniqueness: { scope: :family_id }
  validates :brand, :model, presence: true
end
