require "test_helper"

class ProductsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family_admin = users(:family_admin)
    @dylan_family = families(:dylan_family)

    # Enable business mode for the main test family
    @dylan_family.update!(business_mode_enabled: true)

    sign_in @family_admin

    @product = @dylan_family.products.create!(
      name: "Existing Product",
      buy_price: 10,
      sell_price: 20
    )
  end

  test "should get index" do
    get products_url
    assert_response :success
  end

  test "should get new" do
    get new_product_url
    assert_response :success
  end

  test "should create product without initial stock" do
    assert_difference("Product.count", 1) do
      post products_url, params: {
        product: {
          name: "New Product",
          buy_price: 15,
          sell_price: 25
        }
      }
    end

    assert_redirected_to product_url(Product.last)
    assert_equal "New Product", Product.last.name
    assert_equal 0, Product.last.stock
  end

  test "should create product with initial stock" do
    assert_difference("Product.count", 1) do
      assert_difference("ProductStockMovement.count", 1) do
        post products_url, params: {
          product: {
            name: "New Product With Stock",
            buy_price: 15,
            sell_price: 25,
            initial_stock: "50"
          }
        }
      end
    end

    product = Product.last
    assert_redirected_to product_url(product)
    assert_equal "New Product With Stock", product.name

    # Reloading since stock is updated by the movement after commit callback
    # Tests without transactional fixtures might need reload, but let's check
    product.reload
    assert_equal 50, product.stock

    movement = product.stock_movements.last
    assert_equal "entrada", movement.reason
    assert_equal 50, movement.quantity_delta
  end

  test "should not create product with negative initial stock" do
    assert_no_difference(["Product.count", "ProductStockMovement.count"]) do
      post products_url, params: {
        product: {
          name: "Invalid Stock Product",
          buy_price: 15,
          sell_price: 25,
          initial_stock: "-10"
        }
      }
    end

    assert_response :unprocessable_entity
    assert_match "Initial stock must be zero or positive", response.body
  end

  test "should show product" do
    get product_url(@product)
    assert_response :success
  end

  test "should get edit" do
    get edit_product_url(@product)
    assert_response :success
  end

  test "should update product" do
    patch product_url(@product), params: {
      product: {
        name: "Updated Product",
        sell_price: 30
      }
    }
    assert_redirected_to product_url(@product)
    @product.reload
    assert_equal "Updated Product", @product.name
    assert_equal 30, @product.sell_price
  end

  test "should destroy product" do
    assert_difference("Product.count", -1) do
      delete product_url(@product)
    end

    assert_redirected_to products_url
  end

  test "redirects when business mode is disabled" do
    @dylan_family.update!(business_mode_enabled: false)

    get products_url
    assert_redirected_to root_url
    assert_equal "This feature isn't enabled for your family.", flash[:alert]
  end

  test "cannot access product from another family" do
    # Create another family and product
    other_family = Family.create!(name: "Other Family", business_mode_enabled: true)
    other_product = other_family.products.create!(
      name: "Other Product",
      buy_price: 10,
      sell_price: 20
    )

    assert_raises(ActiveRecord::RecordNotFound) do
      get product_url(other_product)
    end

    assert_raises(ActiveRecord::RecordNotFound) do
      patch product_url(other_product), params: { product: { name: "Hacked" } }
    end
  end
end
