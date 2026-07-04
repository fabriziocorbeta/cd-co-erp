class Product < ApplicationRecord
  belongs_to :family

  enum :currency, { pyg: "pyg", usd: "usd" }, default: "pyg"

  validates :name, presence: true
  validates :sku, uniqueness: { scope: :family_id }, allow_nil: true
  validates :buy_price, :sell_price, :stock, :min_stock, numericality: { greater_than_or_equal_to: 0 }
end
