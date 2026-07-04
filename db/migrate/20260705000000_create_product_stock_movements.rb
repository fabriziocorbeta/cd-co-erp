class CreateProductStockMovements < ActiveRecord::Migration[7.2]
  def change
    create_table :product_stock_movements, id: :uuid do |t|
      t.references :product, null: false, foreign_key: true, type: :uuid
      t.integer :quantity_delta, null: false
      t.string :reason, null: false
      t.string :note

      t.timestamps
    end
  end
end
