class CreateSales < ActiveRecord::Migration[7.2]
  def change
    create_table :sales, id: :uuid do |t|
      t.references :family, null: false, foreign_key: true, type: :uuid
      t.integer :sale_number, null: false
      t.string :client_name
      t.string :status, null: false, default: "draft"
      t.string :currency, null: false, default: "pyg"
      t.string :payment_method
      t.string :invoice_number
      t.string :condition
      t.text :notes

      t.timestamps
    end

    add_index :sales, [ :family_id, :sale_number ], unique: true
  end
end
