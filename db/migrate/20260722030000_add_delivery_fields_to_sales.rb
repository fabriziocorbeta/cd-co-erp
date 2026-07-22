class AddDeliveryFieldsToSales < ActiveRecord::Migration[7.2]
  def change
    add_column :sales, :delivery_address, :text
    add_column :sales, :delivery_date, :date
  end
end
