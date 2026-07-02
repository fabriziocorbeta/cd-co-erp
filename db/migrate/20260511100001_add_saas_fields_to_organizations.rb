class AddSaasFieldsToOrganizations < ActiveRecord::Migration[7.2]
  def change
    add_column :organizations, :slug, :string
    add_column :organizations, :plan, :integer, default: 0, null: false

    add_index :organizations, :slug, unique: true

    change_column_default :organizations, :country, from: "US", to: "PY"

    reversible do |dir|
      dir.up do
        execute <<~SQL
          UPDATE organizations
          SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || id,
              country = 'PY'
        SQL
      end
    end

    change_column_null :organizations, :slug, false
  end
end
