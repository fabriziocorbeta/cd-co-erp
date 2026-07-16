class CreatePurchaseOrders < ActiveRecord::Migration[7.2]
  def change
    create_table :purchase_orders, id: :uuid do |t|
      t.references :family, null: false, foreign_key: true, type: :uuid
      t.integer :order_number, null: false
      t.string :supplier_name
      t.string :status, null: false, default: 'draft'
      t.string :currency, null: false, default: 'pyg'
      t.date :expected_date
      t.text :notes

      t.timestamps
    end

    add_index :purchase_orders, [ :family_id, :order_number ], unique: true
  end
end
