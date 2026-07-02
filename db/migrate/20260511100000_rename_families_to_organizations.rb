class RenameFamiliesToOrganizations < ActiveRecord::Migration[7.2]
  def change
    # Rename the primary families table
    rename_table :families, :organizations

    # Rename family_id FK column in all tables that directly reference families
    # (rename_table does NOT rename FK columns automatically)

    # Tables with family_id referencing families (exhaustive list from schema.rb)
    [
      :accounts,
      :binance_items,
      :budgets,
      :categories,
      :coinbase_items,
      :coinstats_items,
      :enable_banking_items,
      :family_documents,
      :family_exports,
      :family_merchant_associations,
      :imports,
      :indexa_capital_items,
      :invitations,
      :llm_usages,
      :lunchflow_items,
      :merchants,
      :mercury_items,
      :plaid_items,
      :recurring_transactions,
      :rules,
      :simplefin_items,
      :snaptrade_items,
      :sophtron_items,
      :subscriptions,
      :tags,
      :users
    ].each do |table|
      rename_column table, :family_id, :organization_id
    end
  end
end
