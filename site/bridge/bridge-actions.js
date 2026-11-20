// The one read this site shares with other agent sites. When another site's assistant
// calls the agent_crash_test network, that network runs in the caller's browser and can
// read the testing guide through this bridge. It shares no page state and no reports.
import { Guide } from "../js/guide.js";

export function registerActions(actions) {
  actions.register({
    // The same name as the page's own read, so the network's instructions fit both.
    name: "get_page_state",
    description: "Read what Agent Crash Test is, what it reports, why it matters, how a site owner runs it on their own site (with the exact script tag and console line), what each outcome means, the fix, the demo shops with links, the limits and the source link. Reports stay in the visitor's browser on the Agent Crash Test site and are not shared here.",
    effect: "read",
    availability: "bridge",
    callerOrigins: ["*"],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => Guide.facts(),
  });
}
