import { Controller } from "@hotwired/stimulus";
import { addPendingSale } from "services/offline_sales_db";

// Connects to data-controller="offline-sale-form"
export default class extends Controller {
  async submit(event) {
    if (navigator.onLine) return; // let the normal Turbo submit go through

    event.preventDefault();

    const form = this.element;
    const entries = Array.from(new FormData(form).entries());
    entries.push(["client_request_id", crypto.randomUUID()]);

    await addPendingSale(entries);
    await this.registerBackgroundSync();
    this.showQueuedMessage();
  }

  async registerBackgroundSync() {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await registration.sync.register("sale-sync");
      } catch (e) {
        // Background Sync unavailable (e.g. iOS Safari) - the 'online'
        // event fallback registered in application.js handles this case.
      }
    }
  }

  showQueuedMessage() {
    const message = document.createElement("div");
    message.className = "fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50";
    message.textContent = "Venta guardada localmente. Se enviará cuando vuelva la conexión.";
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 4000);
    Turbo.visit("/sales");
  }
}
