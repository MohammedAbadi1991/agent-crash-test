// Wires the "Run the crash test on this page" button on the demo shops.
// A page opened with ?crashtest in its address runs the test as soon as it has loaded.
import { crashTestThisPage } from "../../harness/auto.js?manual";

const button = document.getElementById("crash-run");
const status = document.getElementById("crash-status");

async function run() {
  status.textContent = "Running…";
  try {
    const report = await crashTestThisPage();
    const n = report.summary.ranWithoutAsking;
    const checks = report.summary.labelsToCheck;
    status.textContent = `Done: ${n} action${n === 1 ? "" : "s"} that change${n === 1 ? "s" : ""} something can run without asking, ${checks} label${checks === 1 ? "" : "s"} worth a second look.`;
  } catch (error) {
    status.textContent = error.message;
  }
}

button?.addEventListener("click", run);
if (new URLSearchParams(location.search).has("crashtest")) run();
