require "test_helper"

class StatementImportTest < ActiveSupport::TestCase
  def setup
    @family = families(:dylan_family)
    @user = users(:family_admin)
  end

  test "valid import requires family and user" do
    imp = StatementImport.new(family: @family, user: @user, status: :pending)
    # Model exists and responds to status
    assert imp.respond_to?(:pending?)
    assert imp.respond_to?(:processing?)
    assert imp.respond_to?(:review?)
    assert imp.valid?
  end

  test "pending? predicate works" do
    imp = StatementImport.new(family: @family, user: @user, status: :pending)
    assert imp.pending?
    assert_not imp.processing?
  end

  test "has transactions_for_review method" do
    imp = StatementImport.new(family: @family, user: @user, raw_transactions: [])
    assert imp.respond_to?(:transactions_for_review)
  end
end
