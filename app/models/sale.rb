class Sale < ApplicationRecord
  belongs_to :family
  has_many :sale_items, dependent: :destroy
  accepts_nested_attributes_for :sale_items, allow_destroy: true, reject_if: proc { |attributes| attributes['product_id'].blank? }

  enum :status, { draft: "draft", completed: "completed", cancelled: "cancelled" }, default: "draft"
  enum :currency, { pyg: "pyg", usd: "usd" }, default: "pyg"

  validates :sale_number, presence: true, uniqueness: { scope: :family_id }
  validate :status_cannot_be_changed_directly, on: :update

  before_validation :assign_sale_number, on: :create

  attr_accessor :allow_status_change

  def total
    sale_items.sum(&:subtotal)
  end

  def complete!
    transaction do
      unless draft?
        errors.add(:status, "must be draft to complete")
        raise ActiveRecord::RecordInvalid.new(self)
      end

      sale_items.each do |item|
        ProductStockMovement.create!(
          product: item.product,
          reason: "salida",
          quantity_delta: -item.quantity
        )
      end

      begin
        @allow_status_change = true
        update!(status: "completed")
      ensure
        @allow_status_change = false
      end
    end
  end

  def cancel!
    transaction do
      unless draft? || completed?
        errors.add(:status, "must be draft or completed to cancel")
        raise ActiveRecord::RecordInvalid.new(self)
      end

      if completed?
        sale_items.each do |item|
          ProductStockMovement.create!(
            product: item.product,
            reason: "entrada",
            quantity_delta: item.quantity
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

    def assign_sale_number
      if sale_number.blank? && family.present?
        self.sale_number = family.sales.maximum(:sale_number).to_i + 1
      end
    end

    def status_cannot_be_changed_directly
      if status_changed? && !@allow_status_change
        errors.add(:status, "cannot be changed directly. Use complete! or cancel! instead.")
      end
    end
end
