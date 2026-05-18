class AddSaasFieldsToOrganizations < ActiveRecord::Migration[8.1]
  def change
    add_column :organizations, :slug, :string
    add_column :organizations, :country, :string, default: "PY", null: false
    add_column :organizations, :plan, :integer, default: 0, null: false

    add_index :organizations, :slug, unique: true

    reversible do |dir|
      dir.up do
        execute <<~SQL
          UPDATE organizations
          SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || id
        SQL
      end
    end

    change_column_null :organizations, :slug, false
  end
end
