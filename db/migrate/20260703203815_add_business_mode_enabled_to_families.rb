class AddBusinessModeEnabledToFamilies < ActiveRecord::Migration[7.2]
  def change
    add_column :families, :business_mode_enabled, :boolean, null: false, default: false
  end
end
