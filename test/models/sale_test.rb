require "test_helper"

class SaleTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @product = products(:dylan_product_1)
  end

  test "sale_number auto-increments per family" do
    family2 = Family.create!(name: "Another Family", default_account_sharing: "shared", setup_completed_at: Time.current)

    sale1 = Sale.create!(family: @family)
    assert_equal 1, sale1.sale_number

    sale2 = Sale.create!(family: @family)
    assert_equal 2, sale2.sale_number

    sale3 = Sale.create!(family: family2)
    assert_equal 1, sale3.sale_number
  end

  test "total calculates sum of sale items" do
    sale = Sale.create!(family: @family)
    sale.sale_items.create!(product: @product, quantity: 2, unit_price: 10)
    sale.sale_items.create!(product: @product, quantity: 3, unit_price: 15)

    assert_equal 65, sale.total
  end

  test "complete! updates status to completed and creates stock movements" do
    sale = Sale.create!(family: @family)
    item = sale.sale_items.create!(product: @product, quantity: 2, unit_price: 10)

    assert_difference -> { ProductStockMovement.count }, 1 do
      sale.complete!
    end

    assert_equal "completed", sale.reload.status
    movement = ProductStockMovement.last
    assert_equal "salida", movement.reason
    assert_equal -2, movement.quantity_delta
    assert_equal @product.id, movement.product_id
  end

  test "cancel! from completed updates status and creates return stock movements" do
    sale = Sale.create!(family: @family)
    item = sale.sale_items.create!(product: @product, quantity: 2, unit_price: 10)
    sale.complete!

    assert_difference -> { ProductStockMovement.count }, 1 do
      sale.cancel!
    end

    assert_equal "cancelled", sale.reload.status
    movement = ProductStockMovement.last
    assert_equal "entrada", movement.reason
    assert_equal 2, movement.quantity_delta
  end

  test "cancel! from draft updates status and does not create stock movements" do
    sale = Sale.create!(family: @family)
    item = sale.sale_items.create!(product: @product, quantity: 2, unit_price: 10)

    assert_no_difference -> { ProductStockMovement.count } do
      sale.cancel!
    end

    assert_equal "cancelled", sale.reload.status
  end

  test "status cannot be changed directly" do
    sale = Sale.create!(family: @family)

    sale.status = "completed"
    assert_not sale.valid?
    assert_includes sale.errors[:status], "cannot be changed directly. Use complete! or cancel! instead."

    assert_raises(ActiveRecord::RecordInvalid) do
      sale.save!
    end
  end
end
