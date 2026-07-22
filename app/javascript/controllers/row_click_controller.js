import { Controller } from "@hotwired/stimulus";

// Connects to data-controller="row-click"
// CSP-safe replacement for inline onclick="window.location=...' on table rows.
export default class extends Controller {
  static values = { url: String };

  visit() {
    Turbo.visit(this.urlValue);
  }
}
