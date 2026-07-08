class PurchaseOrdersController < ApplicationController
  include RequireBusinessMode

  before_action :set_purchase_order, only: %i[show edit update destroy receive cancel]

  def index
    @purchase_orders = Current.family.purchase_orders.includes(:purchase_order_items).order(created_at: :desc)
  end

  def show
  end

  def new
    @purchase_order = Current.family.purchase_orders.new
    5.times { @purchase_order.purchase_order_items.build }
  end

  def create
    @purchase_order = Current.family.purchase_orders.new(purchase_order_params)

    if @purchase_order.save
      redirect_to @purchase_order, notice: t(".success")
    else
      items_needed = 5 - @purchase_order.purchase_order_items.size
      items_needed.times { @purchase_order.purchase_order_items.build } if items_needed > 0
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    if @purchase_order.draft?
      items_needed = 5 - @purchase_order.purchase_order_items.size
      items_needed.times { @purchase_order.purchase_order_items.build } if items_needed > 0
    end
  end

  def update
    filtered_params = @purchase_order.draft? ? purchase_order_params : purchase_order_params.except(:purchase_order_items_attributes)

    if @purchase_order.update(filtered_params)
      redirect_to @purchase_order, notice: t(".success")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @purchase_order.destroy!
    redirect_to purchase_orders_url, notice: t(".success")
  rescue ActiveRecord::RecordNotDestroyed => e
    redirect_to @purchase_order, alert: e.record.errors.full_messages.join(", ")
  end

  def receive
    @purchase_order.receive!
    redirect_to @purchase_order, notice: t(".success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to @purchase_order, alert: e.record.errors.full_messages.join(", ")
  end

  def cancel
    @purchase_order.cancel!
    redirect_to @purchase_order, notice: t(".success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to @purchase_order, alert: e.record.errors.full_messages.join(", ")
  end

  private

    def set_purchase_order
      @purchase_order = Current.family.purchase_orders.find(params[:id])
    end

    def purchase_order_params
      params.require(:purchase_order).permit(
        :supplier_name, :currency, :expected_date, :notes,
        purchase_order_items_attributes: [ :id, :product_id, :quantity, :unit_cost, :_destroy ]
      )
    end
end
