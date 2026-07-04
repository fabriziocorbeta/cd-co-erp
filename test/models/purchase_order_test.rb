require "test_helper"

class PurchaseOrderTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @product1 = products(:dylan_product_1)
    @product2 = products(:dylan_product_2)
  end

  test "order_number auto-increments per family" do
    po1 = PurchaseOrder.create!(family: @family)
    assert_equal 1, po1.order_number

    po2 = PurchaseOrder.create!(family: @family)
    assert_equal 2, po2.order_number
  end

  test "total calculates correctly" do
    po = PurchaseOrder.create!(family: @family)
    po.purchase_order_items.create!(product: @product1, quantity: 2, unit_cost: 10.0)
    po.purchase_order_items.create!(product: @product2, quantity: 3, unit_cost: 15.0)

    assert_equal (2 * 10.0) + (3 * 15.0), po.total
  end

  test "receive! updates status and increases stock" do
    po = PurchaseOrder.create!(family: @family)
    po.purchase_order_items.create!(product: @product1, quantity: 5, unit_cost: 10.0)

    initial_stock = @product1.stock

    assert_difference -> { ProductStockMovement.count }, 1 do
      po.receive!
    end

    assert po.received?
    assert_equal initial_stock + 5, @product1.reload.stock
  end

  test "receive! fails if not draft" do
    po = PurchaseOrder.create!(family: @family)
    po.receive!

    assert_raises(ActiveRecord::RecordInvalid) do
      po.receive!
    end
  end

  test "cancel! from received decreases stock" do
    po = PurchaseOrder.create!(family: @family)
    po.purchase_order_items.create!(product: @product1, quantity: 5, unit_cost: 10.0)
    po.receive!

    stock_after_receive = @product1.reload.stock

    assert_difference -> { ProductStockMovement.count }, 1 do
      po.cancel!
    end

    assert po.cancelled?
    assert_equal stock_after_receive - 5, @product1.reload.stock
  end

  test "cancel! from draft does not create stock movements" do
    po = PurchaseOrder.create!(family: @family)
    po.purchase_order_items.create!(product: @product1, quantity: 5, unit_cost: 10.0)

    assert_no_difference -> { ProductStockMovement.count } do
      po.cancel!
    end

    assert po.cancelled?
  end

  test "cannot change status directly" do
    po = PurchaseOrder.create!(family: @family)

    po.status = "received"
    assert_not po.valid?
    assert_includes po.errors[:status], "cannot be changed directly. Use receive! or cancel! instead."
  end
end
