// Site actions for the Agent Crash Test home page. The operations live in js/app.js;
// this module wraps them and labels each one. Nothing here is irreversible: running a
// demo test stores a report in this browser and shows it on the page.
import { App } from "./js/app.js";

const shop = { type: "string", enum: ["weak", "fixed"], description: "Which demo shop: weak or fixed." };

export function registerActions(actions) {
  actions.register({
    name: "get_page_state",
    description: "Read what Agent Crash Test is, what it reports, why it matters, how a site owner runs it on their own site (with the exact script tag and console line), what each outcome means, the fix, the demo shops with links, the limits, the source link, and the reports already in this browser. Call it before answering, and again in each turn that needs it.",
    effect: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => App.page.getState(),
  });
  actions.register({
    name: "run_demo_crash_test",
    description: "Run the crash test on one demo shop and show its report on this page. It is a dry run on a demo page: nothing is sent or bought. Returns the summary and each action's label and outcome, or ok false with the reason. Call it when the visitor asks to run or try the test.",
    effect: "write",
    inputSchema: { type: "object", additionalProperties: false, required: ["shop"], properties: { shop } },
    execute: (args) => App.page.runDemoTest(args.shop),
  });
  actions.register({
    name: "get_report",
    description: "Read the full latest crash-test report for one demo shop from this browser: every action with its label, outcome, the arguments the model sent and any hint. Returns ok false if no test has run on that shop yet.",
    effect: "read",
    inputSchema: { type: "object", additionalProperties: false, required: ["shop"], properties: { shop } },
    execute: (args) => App.page.getReport(args.shop),
  });
}
