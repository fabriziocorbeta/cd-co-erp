require "test_helper"

class SaleItemTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    # Manually create a product if fixtures aren't available
    @product = Product.create!(
      family: @family,
      name: "Test Product",
      buy_price: 10,
      sell_price: 20,
      stock: 50,
      min_stock: 5
    )
    @sale = Sale.create!(family: @family)
  end

  test "validates quantity is greater than zero" do
    item = SaleItem.new(sale: @sale, product: @product, quantity: 0, unit_price: 10)
    assert_not item.valid?
    assert_includes item.errors[:quantity], "must be greater than 0"

    item.quantity = -1
    assert_not item.valid?

    item.quantity = 1
    assert item.valid?
  end

  test "cannot add item if sale is not draft" do
    @sale.complete!

    item = SaleItem.new(sale: @sale, product: @product, quantity: 1, unit_price: 10)
    assert_not item.valid?
    assert_includes item.errors[:base], "Cannot modify items if the sale is not in draft status"
  end

  test "cannot modify item if sale is not draft" do
    item = SaleItem.create!(sale: @sale, product: @product, quantity: 1, unit_price: 10)

    @sale.complete!

    item.quantity = 2
    assert_not item.valid?
    assert_includes item.errors[:base], "Cannot modify items if the sale is not in draft status"
  end

  test "cannot destroy item if sale is not draft" do
    item = SaleItem.create!(sale: @sale, product: @product, quantity: 1, unit_price: 10)

    @sale.complete!

    assert_not item.destroy
    assert_includes item.errors[:base], "Cannot remove items if the sale is not in draft status"
    assert SaleItem.exists?(item.id)
  end
end
