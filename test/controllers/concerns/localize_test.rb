require "test_helper"

class LocalizeTest < ActionDispatch::IntegrationTest
  test "uses Accept-Language top locale on login when supported" do
    get new_session_url, headers: { "Accept-Language" => "es-PY,es;q=0.9" }
    assert_response :success
    assert_select "button", text: /Iniciar sesión/i
  end

  test "falls back to English when Accept-Language is unsupported" do
    get new_session_url, headers: { "Accept-Language" => "ru-RU,ru;q=0.9" }
    assert_response :success
    assert_select "button", text: /Log in/i
  end

  test "uses Accept-Language for onboarding when user locale is not set" do
    sign_in users(:family_admin)

    get preferences_onboarding_url, headers: { "Accept-Language" => "es-ES,es;q=0.9" }
    assert_response :success
    assert_select "h1", text: /Configura tus preferencias/i
  end

  test "falls back to family locale when Accept-Language is unsupported" do
    sign_in users(:family_admin)

    get preferences_onboarding_url, headers: { "Accept-Language" => "ru-RU,ru;q=0.9" }
    assert_response :success
    assert_select "h1", text: /Configure your preferences/i
  end

  test "respects user locale override even when Accept-Language differs" do
    user = users(:family_admin)
    user.update!(locale: "es")
    sign_in user

    get preferences_onboarding_url, headers: { "Accept-Language" => "en-US,en;q=0.9" }
    assert_response :success
    assert_select "h1", text: /Configura tus preferencias/i
  end

  test "switches locale when locale param is provided" do
    sign_in users(:family_admin)

    get preferences_onboarding_url(locale: "es")
    assert_response :success
    assert_select "h1", text: /Configura tus preferencias/i
  end

  test "ignores invalid locale param and uses family locale" do
    sign_in users(:family_admin)

    get preferences_onboarding_url(locale: "invalid_locale")
    assert_response :success
    assert_select "h1", text: /Configure your preferences/i
  end
end
