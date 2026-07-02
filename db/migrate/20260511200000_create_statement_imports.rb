class CreateStatementImports < ActiveRecord::Migration[7.2]
  def change
    create_table :statement_imports do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :user,         null: false, foreign_key: true
      t.integer    :status,       null: false, default: 0
      t.string     :bank_name
      t.integer    :parsed_count,   default: 0
      t.integer    :imported_count, default: 0
      t.jsonb      :raw_transactions, default: []
      t.text       :error_message
      t.timestamps
    end
  end
end
