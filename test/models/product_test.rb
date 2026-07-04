require "test_helper"

class ProductTest < ActiveSupport::TestCase
  def setup
    @family = families(:dylan_family)
  end

  test "valid creation" do
    product = Product.new(
      family: @family,
      name: "Test Product",
      sku: "SKU123",
      category: "Test Category",
      supplier: "Test Supplier",
      buy_price: 10.50,
      sell_price: 20.00,
      currency: "usd",
      stock: 100,
      min_stock: 10,
      description: "Test Description"
    )
    assert product.valid?
    assert product.save
  end

  test "sku must be unique per family" do
    Product.create!(family: @family, name: "Product 1", sku: "DUPLICATE")

    product2 = Product.new(family: @family, name: "Product 2", sku: "DUPLICATE")
    assert_not product2.valid?
    assert_not_empty product2.errors[:sku]
  end

  test "sku can be reused across different families" do
    Product.create!(family: @family, name: "Product 1", sku: "REUSABLE")

    other_family = families(:empty)
    product2 = Product.new(family: other_family, name: "Product 2", sku: "REUSABLE")
    assert product2.valid?
  end

  test "validates numericality of buy_price, sell_price, stock, min_stock" do
    product = Product.new(
      family: @family,
      name: "Test Product",
      buy_price: -1,
      sell_price: -1,
      stock: -1,
      min_stock: -1
    )
    assert_not product.valid?
    assert_not_empty product.errors[:buy_price]
    assert_not_empty product.errors[:sell_price]
    assert_not_empty product.errors[:stock]
    assert_not_empty product.errors[:min_stock]
  end

  test "currency defaults to pyg" do
    product = Product.new(family: @family, name: "Test Product")
    assert_equal "pyg", product.currency
    assert product.pyg?
  end
end
