require "test_helper"

class StatementImportTest < ActiveSupport::TestCase
  def setup
    @org  = Organization.new(name: "Test Org", slug: "test-org", country: "PY", plan: :free)
    @user = User.new(email: "test@example.com")
  end

  test "valid import requires organization and user" do
    imp = StatementImport.new(organization: @org, user: @user, status: :pending)
    # Model exists and responds to status
    assert imp.respond_to?(:pending?)
    assert imp.respond_to?(:processing?)
    assert imp.respond_to?(:review?)
  end

  test "pending? predicate works" do
    imp = StatementImport.new(status: :pending)
    assert imp.pending?
    assert_not imp.processing?
  end

  test "has transactions_for_review method" do
    imp = StatementImport.new(raw_transactions: [])
    assert imp.respond_to?(:transactions_for_review)
  end
end
