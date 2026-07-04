require "test_helper"

class ProductStockMovementTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @product = Product.create!(
      family: @family,
      name: "Test Product",
      stock: 10
    )
  end

  test "entrada sums stock" do
    assert_difference -> { @product.reload.stock }, 5 do
      @product.stock_movements.create!(
        quantity_delta: 5,
        reason: "entrada",
        note: "Added some stock"
      )
    end
  end

  test "salida subtracts stock" do
    assert_difference -> { @product.reload.stock }, -3 do
      @product.stock_movements.create!(
        quantity_delta: -3,
        reason: "salida",
        note: "Sold some stock"
      )
    end
  end

  test "ajuste can be positive or negative" do
    assert_difference -> { @product.reload.stock }, 2 do
      @product.stock_movements.create!(
        quantity_delta: 2,
        reason: "ajuste",
        note: "Found extra stock"
      )
    end

    assert_difference -> { @product.reload.stock }, -1 do
      @product.stock_movements.create!(
        quantity_delta: -1,
        reason: "ajuste",
        note: "Lost some stock"
      )
    end
  end

  test "quantity_delta 0 is invalid" do
    movement = @product.stock_movements.build(
      quantity_delta: 0,
      reason: "ajuste"
    )
    assert_not movement.valid?
    assert_includes movement.errors[:quantity_delta], "must be different from 0"
  end
end
