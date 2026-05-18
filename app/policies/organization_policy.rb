# frozen_string_literal: true

class OrganizationPolicy < ApplicationPolicy
  def show?
    member?
  end

  def update?
    owner?
  end

  def destroy?
    owner?
  end

  def manage_members?
    owner?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user.super_admin?
        scope.all
      else
        scope.joins(:organization_memberships)
             .where(organization_memberships: { user_id: user.id })
      end
    end
  end

  private

    def member?
      record.organization_memberships.exists?(user_id: user.id)
    end

    def owner?
      record.organization_memberships.exists?(user_id: user.id, role: :owner)
    end
end
