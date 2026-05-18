require "test_helper"

class OrganizationTest < ActiveSupport::TestCase
  test "organization has slug" do
    org = Organization.new(name: "Test Org", slug: "test-org", country: "PY", plan: :free)
    assert org.valid?
  end

  test "slug is unique" do
    # Requires Organization model — will pass after Task 3
    skip "Model rename in Task 3"
  end
end
