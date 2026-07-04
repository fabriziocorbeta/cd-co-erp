class ProductStockMovement < ApplicationRecord
  belongs_to :product

  enum :reason, { entrada: "entrada", salida: "salida", ajuste: "ajuste" }

  validates :quantity_delta, presence: true, exclusion: { in: [0], message: "must be different from 0" }

  after_create_commit :apply_to_product_stock

  private

  def apply_to_product_stock
    product.with_lock do
      product.increment!(:stock, quantity_delta)
    end
  end
end
