class CreatePurchaseOrderItems < ActiveRecord::Migration[7.2]
  def change
    create_table :purchase_order_items, id: :uuid do |t|
      t.references :purchase_order, null: false, foreign_key: true, type: :uuid
      t.references :product, null: false, foreign_key: true, type: :uuid
      t.integer :quantity, null: false
      t.decimal :unit_cost, precision: 19, scale: 4, null: false

      t.timestamps
    end
  end
end
