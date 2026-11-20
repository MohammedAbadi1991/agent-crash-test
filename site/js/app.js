// The home page's own behaviour. The page's buttons and the assistant's site actions
// both call the methods of App.page, so they always do the same thing.
import { Guide } from "./guide.js";
import { runCrashTest } from "../harness/crash-test.js";
import { renderReport } from "../harness/panel.js";
import { recall, remember } from "../harness/auto.js?manual";

class HomePage {
  shop(id) { return Guide.SHOPS.find(shop => shop.id === id) || null; }

  summaries() {
    const reports = recall();
    return Guide.SHOPS.filter(shop => reports[shop.network]).map((shop) => {
      const report = reports[shop.network];
      return { shop: shop.id, name: shop.name, when: report.when, ...report.summary };
    });
  }

  getState() {
    return { ...Guide.facts(), reportsInThisBrowser: this.summaries() };
  }

  getReport(id) {
    const shop = this.shop(id);
    if (!shop) return { ok: false, reason: "Unknown demo shop. Use weak or fixed." };
    const report = recall()[shop.network];
    if (!report) return { ok: false, reason: `No crash test has run on the ${shop.id} shop in this browser yet.` };
    return { ok: true, report };
  }

  // Load the shop in a hidden frame on this origin, wait for its runtime, and run the
  // test with that page's own engine. The frame is removed afterwards.
  async runDemoTest(id) {
    const shop = this.shop(id);
    if (!shop) return { ok: false, reason: "Unknown demo shop. Use weak or fixed." };
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = `${shop.name}, loaded for the crash test`;
    frame.src = new URL(shop.path, Guide.SITE).href;
    document.body.append(frame);
    try {
      const engine = await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = setInterval(() => {
          const found = frame.contentWindow?.__nsweb?.engine;
          if (found?.top?.network) { clearInterval(poll); resolve(found); }
          else if (Date.now() - started > 20000) { clearInterval(poll); reject(new Error("The demo shop did not load its assistant in time.")); }
        }, 150);
      });
      const report = await runCrashTest(engine, { page: frame.src });
      remember(report);
      this.show(shop.id, report);
      return { ok: true, shop: shop.id, name: shop.name, summary: report.summary,
        actions: report.actions.map(a => ({ name: a.name, label: a.effect, outcome: a.outcome, hint: a.hint })) };
    } catch (error) {
      return { ok: false, reason: String(error.message || error) };
    } finally {
      frame.remove();
    }
  }

  show(id, report) {
    const slot = document.getElementById(`report-${id}`);
    if (slot) { renderReport(report, slot); slot.hidden = false; }
  }

  wire() {
    for (const shop of Guide.SHOPS) {
      const button = document.getElementById(`run-${shop.id}`);
      const status = document.getElementById(`status-${shop.id}`);
      button?.addEventListener("click", async () => {
        status.textContent = "Running…";
        const result = await this.runDemoTest(shop.id);
        status.textContent = result.ok
          ? `Done: ${result.summary.ranWithoutAsking} change${result.summary.ranWithoutAsking === 1 ? "" : "s"} without asking, ${result.summary.labelsToCheck} label${result.summary.labelsToCheck === 1 ? "" : "s"} to check.`
          : result.reason;
      });
      const saved = recall()[shop.network];
      if (saved) this.show(shop.id, saved);
    }
    const facts = Guide.facts();
    const tag = document.getElementById("snippet-tag");
    const line = document.getElementById("snippet-console");
    if (tag) tag.textContent = facts.howToTestYourOwnSite.scriptTag;
    if (line) line.textContent = facts.howToTestYourOwnSite.console;
    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        const text = document.getElementById(button.dataset.copy).textContent;
        try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; }
        catch { button.textContent = "Select and copy the text"; }
      });
    }
  }
}

export class App {
  static page = new HomePage();
}

if (typeof document !== "undefined") App.page.wire();
