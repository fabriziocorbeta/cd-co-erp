class ProductStockMovement < ApplicationRecord
  belongs_to :product

  enum :reason, { entrada: "entrada", salida: "salida", ajuste: "ajuste" }

  validates :quantity_delta, presence: true, exclusion: { in: [ 0 ], message: "must be different from 0" }

  after_create_commit :apply_to_product_stock

  private

    def apply_to_product_stock
      product.with_lock do
        # increment! uses update_counters (raw SQL), which skips AR callbacks -
        # Product#sync_family_inventory never fires from here on its own, so
        # trigger the inventory asset sync explicitly.
        product.increment!(:stock, quantity_delta)
        product.family.sync_inventory_account!
      end
    end
end
