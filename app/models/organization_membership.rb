class OrganizationMembership < ApplicationRecord
  enum :role, { client: 0, advisor: 1, owner: 2 }

  belongs_to :user
  belongs_to :organization

  validates :role, presence: true
  validates :user_id, uniqueness: { scope: :organization_id }
end
