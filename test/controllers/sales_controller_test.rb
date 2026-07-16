require "test_helper"

class SalesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family_admin = users(:family_admin)
    @dylan_family = families(:dylan_family)

    # Enable business mode for the main test family
    @dylan_family.update!(business_mode_enabled: true)

    sign_in @family_admin

    @product = @dylan_family.products.create!(
      name: "Test Product",
      buy_price: 10,
      sell_price: 20,
      stock: 50
    )

    @sale = @dylan_family.sales.create!(
      client_name: "Test Client",
      status: "draft"
    )

    @sale_item = @sale.sale_items.create!(
      product: @product,
      quantity: 5,
      unit_price: 20
    )
  end

  test "should get index" do
    get sales_url
    assert_response :success
  end

  test "should get new" do
    get new_sale_url
    assert_response :success
  end

  test "should create sale" do
    assert_difference("Sale.count", 1) do
      post sales_url, params: {
        sale: {
          client_name: "New Client",
          sale_items_attributes: {
            "0" => {
              product_id: @product.id,
              quantity: 2,
              unit_price: 20
            }
          }
        }
      }
    end

    sale = Sale.order(:created_at).last
    assert_redirected_to sale_url(sale)
    assert_equal "New Client", sale.client_name
    assert_equal 1, sale.sale_items.count
  end

  test "should show sale" do
    get sale_url(@sale)
    assert_response :success
  end

  test "should get edit" do
    get edit_sale_url(@sale)
    assert_response :success
  end

  test "should update sale" do
    patch sale_url(@sale), params: {
      sale: {
        client_name: "Updated Client"
      }
    }
    assert_redirected_to sale_url(@sale)
    @sale.reload
    assert_equal "Updated Client", @sale.client_name
  end

  test "should not update sale items if not draft" do
    @sale.complete!
    @sale.reload

    patch sale_url(@sale), params: {
      sale: {
        client_name: "Another Update",
        sale_items_attributes: {
          "0" => {
            id: @sale_item.id,
            quantity: 10
          }
        }
      }
    }

    assert_redirected_to sale_url(@sale)
    @sale.reload
    @sale_item.reload
    assert_equal "Another Update", @sale.client_name
    assert_equal 5, @sale_item.quantity # Should not change
  end

  test "should complete sale" do
    assert_difference("ProductStockMovement.count", 1) do
      patch complete_sale_url(@sale)
    end

    assert_redirected_to sale_url(@sale)
    @sale.reload
    assert_equal "completed", @sale.status

    movement = ProductStockMovement.last
    assert_equal "salida", movement.reason
    assert_equal -5, movement.quantity_delta
  end

  test "should cancel sale" do
    @sale.complete!
    @sale.reload

    assert_difference("ProductStockMovement.count", 1) do
      patch cancel_sale_url(@sale)
    end

    assert_redirected_to sale_url(@sale)
    @sale.reload
    assert_equal "cancelled", @sale.status

    movement = ProductStockMovement.last
    assert_equal "entrada", movement.reason
    assert_equal 5, movement.quantity_delta
  end

  test "should destroy sale" do
    assert_difference("Sale.count", -1) do
      delete sale_url(@sale)
    end

    assert_redirected_to sales_url
  end

  test "redirects when business mode is disabled" do
    @dylan_family.update!(business_mode_enabled: false)

    get sales_url
    assert_redirected_to root_url
    assert_equal "This feature isn't enabled for your family.", flash[:alert]
  end

  test "cannot access sale from another family" do
    other_family = Family.create!(name: "Other Family", business_mode_enabled: true)
    other_sale = other_family.sales.create!(
      client_name: "Other Client",
      status: "draft"
    )

    get sale_url(other_sale)
    assert_response :not_found

    patch sale_url(other_sale), params: { sale: { client_name: "Hacked" } }
    assert_response :not_found
    assert_equal "Other Client", other_sale.reload.client_name
  end
end
