class GoalPledgesController < ApplicationController
  before_action :set_goal
  before_action :set_pledge, only: %i[renew destroy]
  rescue_from ActiveRecord::RecordNotFound, with: :record_not_found

  def new
    account = preselected_account
    @pledge = @goal.goal_pledges.new(
      currency: @goal.currency,
      account: account,
      kind: account&.default_pledge_kind || "transfer",
      amount: params[:amount].presence
    )
  end

  def create
    @pledge = @goal.goal_pledges.new(pledge_params)
    @pledge.account = lookup_account(params.dig(:goal_pledge, :account_id))
    @pledge.kind = @pledge.account&.default_pledge_kind || "transfer"
    @pledge.currency = @goal.currency

    if @pledge.save
      redirect_to goal_path(@goal), notice: t(".success")
    else
      render :new, status: :unprocessable_entity
    end
  end

  def renew
    @pledge.extend!
    redirect_to goal_path(@goal), notice: t(".success")
  rescue GoalPledge::NotOpenError
    redirect_to goal_path(@goal), alert: t(".not_open")
  end

  def destroy
    @pledge.cancel!
    redirect_to goal_path(@goal), notice: t(".success")
  rescue GoalPledge::NotOpenError
    redirect_to goal_path(@goal), alert: t(".not_open")
  end

  private
    def set_goal
      @goal = Current.family.goals
                            .includes(:open_pledges, linked_accounts: :account_providers)
                            .find(params[:goal_id])
    end

    def set_pledge
      @pledge = @goal.goal_pledges.find(params[:id])
    end

    def pledge_params
      params.require(:goal_pledge).permit(:amount)
    end

    def lookup_account(id)
      return nil if id.blank?
      @goal.linked_accounts.find_by(id: id)
    end

    def preselected_account
      requested = params[:account_id].presence && @goal.linked_accounts.find_by(id: params[:account_id])
      requested || @goal.linked_accounts.first
    end

    def record_not_found
      redirect_to goals_path, alert: t("goals.errors.not_found")
    end
end
