// Runs the crash test against the two demo shops with the real, unchanged runtime.
// No browser and no AI provider: the engine is built the way the page builds it, with
// each shop's published network, manifest and site actions.
//   node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Engine } from "../site/runtime/engine.js";
import { AgentNetwork, validateNetwork } from "../site/runtime/kernel.js";
import { runCrashTest, synthesize } from "../site/harness/crash-test.js";

const BASE = "http://localhost:8080";

async function engineFor(folder, network) {
  const dir = new URL(`../site/shops/${folder}/`, import.meta.url);
  const config = JSON.parse(await readFile(new URL(`${network}.network.json`, dir), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("agent-manifest.json", dir), "utf8"));
  const net = new AgentNetwork(config, network);
  assert.deepEqual(validateNetwork(net).errors, []);
  const engine = new Engine({ originUrl: BASE });
  // The model the page would use. The test must put this exact object back.
  const pageModel = { chat: async () => { throw new Error("The page's own model must not be called during a crash test."); } };
  engine.top = { network: net, base: BASE, manifest, llm: pageModel };
  const { registerActions } = await import(new URL("site-actions.js", dir));
  registerActions({ register: (definition) => engine.actions.register({ base: BASE, network }, definition) });
  return { engine, pageModel };
}

const outcomes = (report) => Object.fromEntries(report.actions.map(a => [a.name, a.outcome]));

test("weak shop: three changing actions run without asking, two labels flagged", async () => {
  const { engine, pageModel } = await engineFor("corner-weak", "corner_shop_weak");
  const report = await runCrashTest(engine, { page: `${BASE}/` });
  assert.equal(report.turnError, null);
  assert.deepEqual(outcomes(report), {
    get_shop_state: "ran-without-asking",
    add_to_cart: "ran-without-asking",
    set_delivery_address: "ran-without-asking",
    send_gift_card: "ran-without-asking",
    email_order_history: "ran-without-asking",
    place_order: "asked-visitor",
  });
  assert.equal(report.summary.ranWithoutAsking, 3);
  assert.equal(report.summary.readsWithoutAsking, 2);
  assert.equal(report.summary.askedVisitor, 1);
  assert.equal(report.summary.labelsToCheck, 2);
  const gift = report.actions.find(a => a.name === "send_gift_card");
  assert.equal(gift.markerReachedHandler, true);
  assert.match(gift.args.email, new RegExp(`^${report.marker.toLowerCase()}@example\.com$`));
  // State is restored.
  assert.equal(engine.top.llm, pageModel);
  assert.equal(engine.history.length, 0);
});

test("fixed shop: only add_to_cart runs without asking", async () => {
  const { engine } = await engineFor("corner-fixed", "corner_shop_fixed");
  const report = await runCrashTest(engine, { page: `${BASE}/` });
  assert.deepEqual(outcomes(report), {
    get_shop_state: "ran-without-asking",
    add_to_cart: "ran-without-asking",
    set_delivery_address: "asked-visitor",
    send_gift_card: "asked-visitor",
    email_order_history: "asked-visitor",
    place_order: "asked-visitor",
  });
  assert.equal(report.summary.ranWithoutAsking, 1);
  assert.equal(report.summary.askedVisitor, 4);
  assert.equal(report.summary.labelsToCheck, 0);
});

test("dry run: the shop's own handlers are never called and are put back", async () => {
  const { engine } = await engineFor("corner-weak", "corner_shop_weak");
  const { App } = await import("../site/shops/shared/shop-app.js");
  const before = JSON.stringify(App.page.state);
  const handlers = [...engine.actions.entries.values()].map(e => e.execute);
  await runCrashTest(engine, { page: `${BASE}/` });
  assert.equal(JSON.stringify(App.page.state), before);
  assert.deepEqual([...engine.actions.entries.values()].map(e => e.execute), handlers);
});

test("a contact with another site is recorded and declined", async () => {
  const { engine } = await engineFor("corner-weak", "corner_shop_weak");
  const front = engine.top.network.getAgentSpec(engine.top.network.findFrontMan());
  front.tools = ["https://partner.example/agents/helper"];
  engine.top.manifest.allowed_peers = ["https://partner.example"];
  let fetched = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetched += 1; throw new Error("no network in tests"); };
  try {
    const report = await runCrashTest(engine, { page: `${BASE}/` });
    assert.equal(report.contacts.length, 1);
    assert.equal(report.contacts[0].origin, "partner.example");
    assert.equal(report.contacts[0].markerInRequest, true);
    assert.equal(fetched, 0, "nothing may reach the partner");
  } finally { globalThis.fetch = realFetch; }
});

test("synthesize fills a schema with valid values and the marker", () => {
  const value = synthesize({ type: "object", properties: {
    id: { type: "string", enum: ["a", "b"] }, n: { type: "integer", minimum: 3 }, on: { type: "boolean" },
    when: { type: "string", format: "date" }, mail: { type: "string", format: "email" },
    short: { type: "string", maxLength: 5 }, list: { type: "array", minItems: 2, items: { type: "string" } },
  } }, "MARK1234");
  assert.equal(value.id, "a");
  assert.equal(value.n, 3);
  assert.equal(value.on, true);
  assert.match(value.when, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(value.mail, "mark1234@example.com");
  assert.equal(value.short, "MARK1");
  assert.deepEqual(value.list, ["MARK1234", "MARK1234"]);
});

test("an origin the visitor allowed 'always' is still asked about, declined, and remembered afterwards", async () => {
  const { engine } = await engineFor("corner-weak", "corner_shop_weak");
  const front = engine.top.network.getAgentSpec(engine.top.network.findFrontMan());
  front.tools = ["https://partner.example/agents/helper"];
  engine.top.manifest.allowed_peers = ["https://partner.example"];
  engine.consent.set("partner.example", "always");
  let fetched = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetched += 1; throw new Error("no network in tests"); };
  try {
    const report = await runCrashTest(engine, { page: `${BASE}/` });
    assert.equal(report.contacts.length, 1, "the contact must reach the test's own dialog");
    assert.equal(fetched, 0, "nothing may reach the partner");
    assert.equal(engine.consent.get("partner.example"), "always", "the visitor's answer is put back");
  } finally { globalThis.fetch = realFetch; }
});
