class AddCarrierToSales < ActiveRecord::Migration[7.2]
  def change
    add_column :sales, :carrier, :string
  end
end
