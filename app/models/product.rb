class Product < ApplicationRecord
  belongs_to :family

  enum :currency, { pyg: "pyg", usd: "usd" }, default: "pyg"

  has_many :stock_movements, class_name: "ProductStockMovement", dependent: :destroy

  validates :name, presence: true
  validates :sku, uniqueness: { scope: :family_id }, allow_nil: true
  validates :buy_price, :sell_price, :stock, :min_stock, numericality: { greater_than_or_equal_to: 0 }
end
