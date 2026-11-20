// Writes the home site's network source, manifest, mount script and link map from the
// agentify-website templates in tools/templates.
//   node tools/make-home.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site");
const read = async (name) => (await readFile(path.join(root, "tools", "templates", name), "utf8")).replaceAll("\r\n", "\n");

const NETWORK = "agent_crash_test";
const FRONT = "crash_test_guide";
const SAMPLES = [
  "What does the crash test tell me that reading my network file does not?",
  "Run the crash test on the weak demo shop and explain the result.",
  "Now run it on the fixed shop. What changed, and why?",
  "How do I run it on my own site?",
  "Can you certify my site as safe?",
];

function replacer(text) {
  const state = { text };
  state.replace = (from, to) => {
    if (!state.text.includes(from)) throw new Error(`Template changed: ${from.slice(0, 50)}`);
    state.text = state.text.split(from).join(to);
  };
  return state;
}

async function hocon() {
  const template = await read("network.hocon");
  const t = replacer(`# Agent Crash Test assistant. Written by tools/make-home.mjs; edit that file.\n` + template.slice(template.indexOf("\n{\n") + 1));
  t.replace(`"TODO: one sentence on what visitors can do with this assistant."`, `"Explains Agent Crash Test, runs it on two demo shops, reads the reports and tells a site owner how to test and fix their own agentic website."`);
  t.replace(`"TODO: a question answered from the site's data",
            "TODO: a request that changes page state, such as adding an item",
            "TODO: a request that ends in a confirmed action, such as placing an order",
            "TODO: a request the site cannot do, to check the agent says so"`, SAMPLES.map(q => JSON.stringify(q)).join(",\n            "));
  t.text = t.text.replace(/\n    # Partner sites only\. The name the consent card[\s\S]*?"link_labels": \{[\s\S]*?\},\n/, "\n");
  t.text = t.text.replace(/\n            # Partner sites only\. Delete it[\s\S]*?"partner_rules": """[\s\S]*?""",\n/, "\n");
  t.replace(`"<Site name>"`, `"Agent Crash Test"`);
  t.replace(`Never invent prices, availability, times, IDs, order numbers or statuses.`, `Never invent results, counts, action names, outcomes, commands or URLs.`);
  t.replace(`Offer only what your tools can do. For anything you have no tool for, such as a basket, a booking or an order, say it is done on this site's own page.`, `Offer only what your tools can do.`);
  t.replace(`TODO: list what this site cannot do (for example coupons, tracking, refunds). Leave out limits the site's functions enforce, such as a longest stay: the site refuses those with its own message. List a feature even when the page offers another way, such as a partner, but leave that way out: the next line reads it from the page.`,
    `This site cannot test another website from here, certify a site as safe, judge how likely a real model is to be fooled, or fix a site for its owner. The limits in website_get_page_state say why.`);
  t.replace(`When the visitor asks for something this site cannot do, say so plainly. Then give what the page offers instead, such as a partner's link or a phone number, from website_<read_action>.`,
    `When the visitor asks for something this site cannot do, say so plainly. Then give what it offers instead, such as the steps to run the test on their own page, from website_get_page_state.`);
  t.replace(`"<front_agent_name>"`, JSON.stringify(FRONT));
  t.replace(`"TODO: what this assistant does for a visitor, in one sentence."`, `"Explains Agent Crash Test and its reports, runs it on the demo shops, and tells a site owner how to test and fix their own agentic website."`);
  t.replace(`TODO: one sentence on who you help and with what, naming the kinds of things the site offers.`, `You help people who build agentic websites understand what their page lets a model do without asking the visitor, using the crash test, its reports and the two demo shops.`);
  t.replace(`- TODO: name the specialist agent for each job it owns, or delete this line.\n`,
    `- For what the test is, how to run it, what an outcome means or how to fix a site, read website_get_page_state and answer from it. Give the script tag or console line exactly as it appears there.
- To run the test on a demo shop, call website_run_demo_crash_test when it is offered. It shows the report on the page. Then explain the result in a few lines: which actions ran without asking, which asked first, and which labels to check.
- To explain a report in depth or compare the two shops, ask report_analyst. Tell it which shop or shops, and what the visitor wants to know. It cannot see this chat. Pass on its findings.
- If website_run_demo_crash_test is not among your tools, another site called you: say the demo runs on the Agent Crash Test page and give its link.
- Keep answers short: a few lines, or one small Markdown table for a list of actions. Do not call render_cruse for a report or a comparison; the page already shows each report.
- Name actions exactly as the tools return them. An outcome of ran-without-asking for a read is normal; for a write it is what the owner should look at.\n`);
  t.replace(`- TODO: for each partner site, say what to ask it, such as "For bike rentals, ask <partner_tool> what it offers and how to book." Delete this line if the site calls no partner sites.\n`, ``);
  t.replace(`{partner_rules}\n`, ``);
  // The front agent delegates report reading to the specialist.
  t.replace(`{cruse_rules}
""",
            # Partner sites only: each partner's exact network URL, as in link_labels.
            "tools": []`, `{cruse_rules}
""",
            "tools": ["report_analyst"]`);
  t.replace(`"<specialist_name>"`, `"report_analyst"`);
  t.replace(`"TODO: the one job this specialist does, so the front agent knows when to call it."`, `"Reads the stored crash-test report of one or both demo shops and returns the findings: which actions ran without asking, which asked first, which labels to check, and the fix. Call it to explain a report in depth or to compare the two shops."`);
  t.replace(`You help the {site_name} assistant with TODO.`, `You help the {site_name} assistant read crash-test reports.`);
  t.replace(`- TODO: which website_* tools are this agent's job. Their descriptions say when to call them.`, `- Call website_get_report for each shop the request names (weak, fixed, or both). If a report is missing, say so and say the test must be run on that shop first. Do not call website_run_demo_crash_test yourself.
- For each report, list every action with its label and outcome, then the actions with a hint. When comparing, say which actions changed outcome between the shops and that only their labels differ.
- For what an outcome means or how to fix a label, read website_get_page_state.
- Never call render_cruse: your answer is read by the assistant, not shown. Answer in at most twelve short lines of plain text.`);
  t.text = t.text.replace(/\n            # Partner sites only: each partner's exact network URL, as in link_labels\./, "");
  return t.text;
}

async function manifest() {
  const doc = JSON.parse((await read("agent-manifest.json")).replaceAll("<protocol_name>", "nsdeploy").replaceAll("<network_name>", NETWORK).replaceAll("<front_agent_name>", FRONT));
  doc.brand = "Agent Crash Test";
  doc.networks[0].description = "Ask what your agentic website lets a model do without asking the visitor, run the crash test on a demo shop, and learn how to test your own site.";
  doc.networks[0].tags = ["agentified-website", "trust-and-safety", "testing", "infrastructure"];
  doc.networks[0].sample_queries = SAMPLES;
  doc.peer_policy.note = "Local agent and page-local actions only. It contacts no other site.";
  doc.theme.primary = "#1c2024";
  doc.actions.agentTools = ["get_page_state", "run_demo_crash_test", "get_report"];
  return JSON.stringify(doc, null, 2) + "\n";
}

async function siteJs() {
  const t = replacer(await read("site.js"));
  t.replace(`import { App } from "./script.js";`, `import { App } from "./js/app.js";`);
  t.replace(/static GREETING = "TODO[^\n]*";/.exec(t.text)[0], `static GREETING = "I can explain the crash test, run it on the two demo shops, and tell you how to run it on your own site.";`);
  t.replace(/static DIALOGS = \{[\s\S]*?\n  \};/.exec(t.text)[0], `static DIALOGS = {};`);
  // This page has no irreversible action, so the dialog needs no details.
  t.replace(/static reviewDetails\(action, args\) \{[\s\S]*?\n    return \{\};\n  \}/.exec(t.text)[0], `static reviewDetails(action, args) {\n    return {};\n  }`);
  // Drop the template's notes to its author; they are not about this site.
  t.text = t.text.split("\n").filter(line => !/^\s*\/\/.*TODO/.test(line)).join("\n");
  return `// Written by tools/make-home.mjs from tools/templates/site.js; edit that script.\n` + t.text;
}

await writeFile(path.join(out, `${NETWORK}.hocon`), await hocon());
await writeFile(path.join(out, "agent-manifest.json"), await manifest());
await writeFile(path.join(out, "site.js"), await siteJs());
await writeFile(path.join(out, "links.json"), (await read("links.json")).replace("<network_name>", NETWORK));
console.log("wrote home");
