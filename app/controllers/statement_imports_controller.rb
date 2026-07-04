class StatementImportsController < ApplicationController
  before_action :set_import, only: %i[show confirm reject]

  def new
    @import = StatementImport.new
    @banks = [ "Itaú Paraguay", "Banco Continental", "Visión Banco", "GNB Paraguay", "Otro" ]
  end

  def create
    @import = StatementImport.new(
      family:    Current.family,
      user:      Current.user,
      bank_name: params.dig(:statement_import, :bank_name),
      status:    :pending
    )
    @import.source_file.attach(params.dig(:statement_import, :source_file))

    if @import.save
      StatementParseJob.perform_later(@import.id)
      redirect_to @import, notice: "Extracto enviado para procesamiento."
    else
      @banks = [ "Itaú Paraguay", "Banco Continental", "Visión Banco", "GNB Paraguay", "Otro" ]
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @transactions = @import.review? ? @import.transactions_for_review : []
  end

  def confirm
    return redirect_to @import unless @import.review?

    account = Current.family.accounts.find_by(id: params[:account_id])
    return redirect_to @import, alert: "Cuenta no encontrada." unless account

    builder = StatementParser::TransactionBuilder.new(account)
    @import.transactions_for_review.each { |t| builder.build_and_save!(t) }
    @import.update!(status: :completed, imported_count: @import.parsed_count)

    redirect_to accounts_path, notice: "#{@import.imported_count} transacciones importadas."
  end

  def reject
    return redirect_to @import unless @import.review?

    @import.update!(status: :failed, error_message: "Rechazado por el usuario")
    redirect_to new_statement_import_path, notice: "Importación descartada."
  end

  private

    def set_import
      @import = Current.family.statement_imports.find(params[:id])
    end
end
