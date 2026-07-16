class CreateFleetVehicles < ActiveRecord::Migration[7.2]
  def change
    create_table :fleet_vehicles, id: :uuid do |t|
      t.references :family, null: false, foreign_key: true, type: :uuid
      t.string :plate, null: false
      t.string :brand, null: false
      t.string :model, null: false
      t.integer :year
      t.string :status, null: false, default: 'active'
      t.text :notes

      t.timestamps
    end
    add_index :fleet_vehicles, [ :family_id, :plate ], unique: true
  end
end
