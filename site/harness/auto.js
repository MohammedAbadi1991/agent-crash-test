// auto.js — run the crash test on the current page and show the report on top of it.
// Load it on your own agentic site while developing:
//   <script type="module" src="https://<this site>/harness/auto.js"></script>
// or once from the browser console:
//   import("https://<this site>/harness/auto.js")
import { runCrashTest } from "./crash-test.js";
import { showOverlay } from "./panel.js";

const STORE = "agent-crash-test:reports";

/** Wait until the page's runtime has booted and loaded its network. */
export async function waitForEngine(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const engine = globalThis.__nsweb?.engine;
    if (engine?.top?.network) return engine;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("No agent runtime found on this page. The crash test needs a page built with the Open Agentic Web reference runtime, which exposes window.__nsweb.");
}

/** Keep the latest report per network in this origin's storage, for the home page. */
export function remember(report) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || "{}");
    all[report.network] = report;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* storage may be blocked; the report is still shown */ }
}

export function recall() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}

/** Run the test on this page, remember the report and show it. */
export async function crashTestThisPage({ show = true } = {}) {
  const engine = await waitForEngine();
  const report = await runCrashTest(engine);
  remember(report);
  if (show) showOverlay(report);
  return report;
}

// Loaded directly by a script tag, a bookmark or the console: run at once. A page that
// wants to call the functions itself imports this file with ?manual in the URL.
if (!new URL(import.meta.url).searchParams.has("manual")) {
  crashTestThisPage().catch((error) => {
    console.error("Agent Crash Test:", error);
    alert(`Agent Crash Test could not run: ${error.message}`);
  });
}
