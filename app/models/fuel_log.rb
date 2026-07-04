class FuelLog < ApplicationRecord
  belongs_to :fleet_vehicle

  enum :currency, { pyg: "pyg", usd: "usd" }, default: "pyg"

  validates :liters, presence: true, numericality: { greater_than: 0 }
  validates :cost, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :odometer, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :logged_at, presence: true
end
