class AddAccountAndEntryToFuelLogs < ActiveRecord::Migration[7.2]
  def up
    FuelLog.delete_all

    remove_column :fuel_logs, :currency

    add_column :fuel_logs, :account_id, :uuid, null: false
    add_column :fuel_logs, :entry_id, :uuid, null: true

    add_foreign_key :fuel_logs, :accounts, column: :account_id
    add_foreign_key :fuel_logs, :entries, column: :entry_id

    add_index :fuel_logs, :account_id
    add_index :fuel_logs, :entry_id
  end

  def down
    remove_index :fuel_logs, :account_id
    remove_index :fuel_logs, :entry_id

    remove_foreign_key :fuel_logs, :entries
    remove_foreign_key :fuel_logs, :accounts

    remove_column :fuel_logs, :entry_id
    remove_column :fuel_logs, :account_id

    add_column :fuel_logs, :currency, :string, default: "pyg", null: false
  end
end
