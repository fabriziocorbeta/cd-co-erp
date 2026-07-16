require "test_helper"

class PurchaseOrdersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @family_admin = users(:family_admin)
    @dylan_family = families(:dylan_family)

    # Enable business mode for the main test family
    @dylan_family.update!(business_mode_enabled: true)

    sign_in @family_admin

    @product = products(:dylan_product_1)

    @purchase_order = @dylan_family.purchase_orders.create!(
      supplier_name: "Test Supplier",
      status: "draft"
    )

    @purchase_order_item = @purchase_order.purchase_order_items.create!(
      product: @product,
      quantity: 5,
      unit_cost: 10
    )
  end

  test "should get index" do
    get purchase_orders_url
    assert_response :success
  end

  test "should get new" do
    get new_purchase_order_url
    assert_response :success
  end

  test "should create purchase order" do
    assert_difference("PurchaseOrder.count", 1) do
      post purchase_orders_url, params: {
        purchase_order: {
          supplier_name: "New Supplier",
          purchase_order_items_attributes: {
            "0" => {
              product_id: @product.id,
              quantity: 2,
              unit_cost: 10
            }
          }
        }
      }
    end

    purchase_order = PurchaseOrder.order(:created_at).last
    assert_redirected_to purchase_order_url(purchase_order)
    assert_equal "New Supplier", purchase_order.supplier_name
    assert_equal 1, purchase_order.purchase_order_items.count
  end

  test "should show purchase order" do
    get purchase_order_url(@purchase_order)
    assert_response :success
  end

  test "should get edit" do
    get edit_purchase_order_url(@purchase_order)
    assert_response :success
  end

  test "should update purchase order" do
    patch purchase_order_url(@purchase_order), params: {
      purchase_order: {
        supplier_name: "Updated Supplier"
      }
    }
    assert_redirected_to purchase_order_url(@purchase_order)
    @purchase_order.reload
    assert_equal "Updated Supplier", @purchase_order.supplier_name
  end

  test "should not update purchase order items if not draft" do
    @purchase_order.receive!
    @purchase_order.reload

    patch purchase_order_url(@purchase_order), params: {
      purchase_order: {
        supplier_name: "Another Update",
        purchase_order_items_attributes: {
          "0" => {
            id: @purchase_order_item.id,
            quantity: 10
          }
        }
      }
    }

    assert_redirected_to purchase_order_url(@purchase_order)
    @purchase_order.reload
    @purchase_order_item.reload
    assert_equal "Another Update", @purchase_order.supplier_name
    assert_equal 5, @purchase_order_item.quantity # Should not change
  end

  test "should receive purchase order" do
    assert_difference("ProductStockMovement.count", 1) do
      patch receive_purchase_order_url(@purchase_order)
    end

    assert_redirected_to purchase_order_url(@purchase_order)
    @purchase_order.reload
    assert_equal "received", @purchase_order.status

    movement = ProductStockMovement.last
    assert_equal "entrada", movement.reason
    assert_equal 5, movement.quantity_delta
  end

  test "should cancel purchase order" do
    @purchase_order.receive!
    @purchase_order.reload

    assert_difference("ProductStockMovement.count", 1) do
      patch cancel_purchase_order_url(@purchase_order)
    end

    assert_redirected_to purchase_order_url(@purchase_order)
    @purchase_order.reload
    assert_equal "cancelled", @purchase_order.status

    movement = ProductStockMovement.last
    assert_equal "salida", movement.reason
    assert_equal -5, movement.quantity_delta
  end

  test "should destroy purchase order" do
    assert_difference("PurchaseOrder.count", -1) do
      delete purchase_order_url(@purchase_order)
    end

    assert_redirected_to purchase_orders_url
  end

  test "redirects when business mode is disabled" do
    @dylan_family.update!(business_mode_enabled: false)

    get purchase_orders_url
    assert_redirected_to root_url
    assert_equal "This feature isn't enabled for your family.", flash[:alert]
  end

  test "cannot access purchase order from another family" do
    other_family = Family.create!(name: "Other Family", business_mode_enabled: true)
    other_purchase_order = other_family.purchase_orders.create!(
      supplier_name: "Other Supplier",
      status: "draft"
    )

    get purchase_order_url(other_purchase_order)
    assert_response :not_found

    patch purchase_order_url(other_purchase_order), params: { purchase_order: { supplier_name: "Hacked" } }
    assert_response :not_found
    assert_equal "Other Supplier", other_purchase_order.reload.supplier_name
  end
end
