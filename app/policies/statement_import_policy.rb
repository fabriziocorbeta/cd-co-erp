class StatementImportPolicy < ApplicationPolicy
  def show?    = org_member?
  def confirm? = org_member?
  def reject?  = org_member?

  private

  def org_member?
    record.organization.organization_memberships.exists?(user_id: user.id)
  end
end
