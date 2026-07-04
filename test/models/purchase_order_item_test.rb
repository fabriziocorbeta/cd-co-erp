require "test_helper"

class PurchaseOrderItemTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @product = products(:dylan_product_1)
    @purchase_order = PurchaseOrder.create!(family: @family)
  end

  test "validates quantity > 0" do
    item = @purchase_order.purchase_order_items.build(product: @product, quantity: 0, unit_cost: 10)
    assert_not item.valid?
    assert_includes item.errors[:quantity], "must be greater than 0"
  end

  test "validates unit_cost >= 0" do
    item = @purchase_order.purchase_order_items.build(product: @product, quantity: 1, unit_cost: -1)
    assert_not item.valid?
    assert_includes item.errors[:unit_cost], "must be greater than or equal to 0"
  end

  test "cannot add items if purchase_order is not draft" do
    @purchase_order.receive!

    item = @purchase_order.purchase_order_items.build(product: @product, quantity: 1, unit_cost: 10)
    assert_not item.valid?
    assert_includes item.errors[:base], "Cannot modify items if the purchase order is not in draft status"
  end

  test "cannot edit items if purchase_order is not draft" do
    item = @purchase_order.purchase_order_items.create!(product: @product, quantity: 1, unit_cost: 10)
    @purchase_order.receive!

    item.quantity = 2
    assert_not item.valid?
    assert_includes item.errors[:base], "Cannot modify items if the purchase order is not in draft status"
  end

  test "cannot remove items if purchase_order is not draft" do
    item = @purchase_order.purchase_order_items.create!(product: @product, quantity: 1, unit_cost: 10)
    @purchase_order.receive!

    assert_not item.destroy
    assert_includes item.errors[:base], "Cannot remove items if the purchase order is not in draft status"
  end
end
