class ProductsController < ApplicationController
  include RequireBusinessMode

  before_action :set_product, only: %i[show edit update destroy]

  def index
    @products = Current.family.products.order(name: :asc)
  end

  def show
  end

  def new
    @product = Current.family.products.new
  end

  def create
    @product = Current.family.products.new(product_params.except(:initial_stock))

    initial_stock = product_params[:initial_stock].to_i

    Product.transaction do
      if @product.save
        if initial_stock > 0
          @product.stock_movements.create!(
            reason: "entrada",
            quantity_delta: initial_stock
          )
        end
        redirect_to @product, notice: "Product was successfully created."
      else
        render :new, status: :unprocessable_entity
      end
    end
  rescue ActiveRecord::RecordInvalid
    render :new, status: :unprocessable_entity
  end

  def edit
  end

  def update
    if @product.update(product_params.except(:initial_stock))
      redirect_to @product, notice: "Product was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @product.destroy!
    redirect_to products_url, notice: "Product was successfully destroyed."
  end

  private

    def set_product
      @product = Current.family.products.find(params[:id])
    end

    def product_params
      params.require(:product).permit(
        :name, :sku, :category, :supplier, :buy_price, :sell_price,
        :currency, :min_stock, :initial_stock
      )
    end
end
