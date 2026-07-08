class SalesController < ApplicationController
  include RequireBusinessMode

  before_action :set_sale, only: %i[show edit update destroy complete cancel]

  def index
    @sales = Current.family.sales.includes(:sale_items).order(created_at: :desc)
  end

  def show
  end

  def new
    @sale = Current.family.sales.new
    5.times { @sale.sale_items.build }
  end

  def create
    @sale = Current.family.sales.new(sale_params)

    if @sale.save
      redirect_to @sale, notice: t(".success")
    else
      # Ensure there are always at least 5 rows available in the form on error
      items_needed = 5 - @sale.sale_items.size
      items_needed.times { @sale.sale_items.build } if items_needed > 0
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    if @sale.draft?
      items_needed = 5 - @sale.sale_items.size
      items_needed.times { @sale.sale_items.build } if items_needed > 0
    end
  end

  def update
    # If the sale is not in draft, we ignore any modifications to sale_items
    filtered_params = @sale.draft? ? sale_params : sale_params.except(:sale_items_attributes)

    if @sale.update(filtered_params)
      redirect_to @sale, notice: t(".success")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @sale.destroy!
    redirect_to sales_url, notice: t(".success")
  rescue ActiveRecord::RecordNotDestroyed => e
    redirect_to @sale, alert: e.record.errors.full_messages.join(", ")
  end

  def complete
    @sale.complete!
    redirect_to @sale, notice: t(".success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to @sale, alert: e.record.errors.full_messages.join(", ")
  end

  def cancel
    @sale.cancel!
    redirect_to @sale, notice: t(".success")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to @sale, alert: e.record.errors.full_messages.join(", ")
  end

  private

    def set_sale
      @sale = Current.family.sales.find(params[:id])
    end

    def sale_params
      params.require(:sale).permit(
        :client_name, :currency, :payment_method, :invoice_number, :condition, :notes,
        sale_items_attributes: [ :id, :product_id, :quantity, :unit_price, :_destroy ]
      )
    end
end
