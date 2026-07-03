require "test_helper"

# Throwaway controller defined at file scope (not nested in the test class)
# so Rails' `"dummy_business_mode_test#index"` route resolves to it directly,
# matching the standard Rails convention for controller-name -> constant lookup.
class DummyBusinessModeTestController < ApplicationController
  include RequireBusinessMode

  def index
    render plain: "ok"
  end
end

class RequireBusinessModeTest < ActionDispatch::IntegrationTest
  setup do
    Rails.application.routes.draw do
      get "/dummy_business_mode_test", to: "dummy_business_mode_test#index"
    end
  end

  teardown do
    Rails.application.reload_routes!
  end

  test "redirects to root when family has business mode disabled" do
    sign_in users(:family_admin)
    users(:family_admin).family.update!(business_mode_enabled: false)

    get "/dummy_business_mode_test"

    assert_redirected_to root_path
  end

  test "allows the request through when business mode is enabled" do
    sign_in users(:family_admin)
    users(:family_admin).family.update!(business_mode_enabled: true)

    get "/dummy_business_mode_test"

    assert_response :success
    assert_equal "ok", response.body
  end
end
