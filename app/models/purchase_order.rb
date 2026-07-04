class PurchaseOrder < ApplicationRecord
  belongs_to :family
  has_many :purchase_order_items, dependent: :destroy

  enum :status, { draft: "draft", received: "received", cancelled: "cancelled" }, default: "draft"
  enum :currency, { pyg: "pyg", usd: "usd" }, default: "pyg"

  validates :order_number, presence: true, uniqueness: { scope: :family_id }
  validate :status_cannot_be_changed_directly, on: :update

  before_validation :assign_order_number, on: :create

  attr_accessor :allow_status_change

  def total
    purchase_order_items.sum(&:subtotal)
  end

  def receive!
    transaction do
      unless draft?
        errors.add(:status, "must be draft to receive")
        raise ActiveRecord::RecordInvalid.new(self)
      end

      purchase_order_items.each do |item|
        ProductStockMovement.create!(
          product: item.product,
          reason: "entrada",
          quantity_delta: item.quantity
        )
      end

      begin
        @allow_status_change = true
        update!(status: "received")
      ensure
        @allow_status_change = false
      end
    end
  end

  def cancel!
    transaction do
      unless draft? || received?
        errors.add(:status, "must be draft or received to cancel")
        raise ActiveRecord::RecordInvalid.new(self)
      end

      if received?
        purchase_order_items.each do |item|
          ProductStockMovement.create!(
            product: item.product,
            reason: "salida",
            quantity_delta: -item.quantity
          )
        end
      end

      begin
        @allow_status_change = true
        update!(status: "cancelled")
      ensure
        @allow_status_change = false
      end
    end
  end

  private

    def assign_order_number
      if order_number.blank? && family.present?
        self.order_number = family.purchase_orders.maximum(:order_number).to_i + 1
      end
    end

    def status_cannot_be_changed_directly
      if status_changed? && !@allow_status_change
        errors.add(:status, "cannot be changed directly. Use receive! or cancel! instead.")
      end
    end
end
