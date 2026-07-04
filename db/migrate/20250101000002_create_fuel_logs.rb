class CreateFuelLogs < ActiveRecord::Migration[7.2]
  def change
    create_table :fuel_logs, id: :uuid do |t|
      t.references :fleet_vehicle, null: false, foreign_key: true, type: :uuid
      t.decimal :liters, precision: 10, scale: 2, null: false
      t.decimal :cost, precision: 19, scale: 4, null: false
      t.integer :odometer
      t.string :currency, null: false, default: 'pyg'
      t.date :logged_at, null: false
      t.string :notes

      t.timestamps
    end
  end
end
