class PurchaseOrderItem < ApplicationRecord
  belongs_to :purchase_order
  belongs_to :product

  validates :quantity, presence: true, numericality: { greater_than: 0 }
  validates :unit_cost, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validate :purchase_order_must_be_draft

  before_destroy :prevent_destroy_if_purchase_order_not_draft

  def subtotal
    quantity * unit_cost
  end

  private

    def purchase_order_must_be_draft
      if purchase_order.present? && !purchase_order.draft?
        errors.add(:base, "Cannot modify items if the purchase order is not in draft status")
      end
    end

    def prevent_destroy_if_purchase_order_not_draft
      if purchase_order.present? && !purchase_order.draft?
        errors.add(:base, "Cannot remove items if the purchase order is not in draft status")
        throw :abort
      end
    end
end
