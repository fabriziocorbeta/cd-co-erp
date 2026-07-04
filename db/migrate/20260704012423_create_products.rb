class CreateProducts < ActiveRecord::Migration[7.2]
  def change
    create_table :products, id: :uuid do |t|
      t.references :family, null: false, foreign_key: true, type: :uuid
      t.string :name, null: false
      t.string :sku
      t.string :category
      t.string :supplier
      t.decimal :buy_price, precision: 19, scale: 4, default: "0.0"
      t.decimal :sell_price, precision: 19, scale: 4, default: "0.0"
      t.string :currency, null: false, default: "pyg"
      t.integer :stock, null: false, default: 0
      t.integer :min_stock, null: false, default: 0
      t.text :description

      t.timestamps
    end
    add_index :products, [:family_id, :sku], unique: true, where: "sku IS NOT NULL"
  end
end
