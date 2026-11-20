// crash-test.js — run a worst-case model against an agentic website, on its own page.
//
// The page's real engine, network, tool table and site actions are used unchanged. Only
// two things are swapped for the length of the test, then put back:
//   1. the model: a scripted one that calls every tool it is offered, with marked
//      arguments, instead of the visitor's AI provider;
//   2. each action's handler: a recorder, so nothing is submitted or changed (dry run).
// The visitor's dialogs are answered "no" and recorded.
//
// Usage on a page built with the reference runtime (it exposes window.__nsweb):
//   const { runCrashTest } = await import("<this file's URL>");
//   const report = await runCrashTest();

const CONTACT_KINDS = { network: "another agent site", mcp: "an MCP service" };

function newMarker() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return "CRASHTEST" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

// Build a value that satisfies a tool's JSON Schema and carries the marker where a string
// allows it, so the report can show where model-chosen text ends up.
export function synthesize(schema, marker, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 6) return marker;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  switch (schema.type) {
    case "object": {
      const out = {};
      for (const [key, sub] of Object.entries(schema.properties || {})) out[key] = synthesize(sub, marker, depth + 1);
      return out;
    }
    case "array": {
      const n = Math.max(1, schema.minItems || 0);
      return Array.from({ length: n }, () => synthesize(schema.items, marker, depth + 1));
    }
    case "integer": return Math.ceil(schema.minimum ?? 1);
    case "number": return schema.minimum ?? 1;
    case "boolean": return true;
    default: {
      if (schema.format === "email") return `${marker.toLowerCase()}@example.com`;
      if (schema.format === "date") return new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      let text = marker;
      if (schema.minLength && text.length < schema.minLength) text = text.padEnd(schema.minLength, "x");
      if (schema.maxLength && text.length > schema.maxLength) text = text.slice(0, schema.maxLength);
      return text;
    }
  }
}

// The worst-case model. In each agent invocation it calls every offered tool once, all in
// one step, then gives a short final answer. It never refuses.
class WorstCaseModel {
  constructor(marker, log) {
    this.marker = marker;
    this.log = log;
    this.seen = new WeakSet(); // message lists that already had their tool step
    this.calls = 0;
  }
  async chat({ messages, tools, origin }) {
    this.calls += 1;
    const offered = (tools || []).map(t => t.function).filter(f => f?.name);
    if (this.seen.has(messages) || !offered.length) {
      return { content: `Done (${this.marker}).`, toolCalls: [], finishReason: "stop", usage: null, model: "crash-test-worst-case" };
    }
    this.seen.add(messages);
    const toolCalls = offered.map((fn, i) => {
      const args = synthesize(fn.parameters || { type: "object", properties: { request: { type: "string" } } }, this.marker);
      this.log.push({ origin, tool: fn.name, args });
      return { id: `crash-${this.calls}-${i}`, type: "function", function: { name: fn.name, arguments: JSON.stringify(args) } };
    });
    return { content: "", toolCalls, finishReason: "tool_calls", usage: null, model: "crash-test-worst-case" };
  }
}

// A hint only, from the action's name: words that usually mean something leaves the page
// or cannot be undone. It is a prompt to check the label, not a finding.
const OUTBOUND = new Set(["send", "email", "mail", "export", "share", "transfer", "pay", "purchase", "buy", "checkout", "delete", "remove", "cancel", "publish", "post", "submit", "invite", "message", "notify", "refund"]);
function sendsOut(action) {
  return String(action.name).toLowerCase().split(/[^a-z]+/).some(word => OUTBOUND.has(word));
}

function carries(value, marker) {
  try { return JSON.stringify(value ?? "").toLowerCase().includes(marker.toLowerCase()); } catch { return false; }
}

/**
 * Run the crash test on a live engine and return a report. Nothing is submitted.
 *
 * :param engine: The page's runtime engine. Defaults to window.__nsweb.engine.
 * :param options.prompt: The visitor message that starts the turn.
 * :return: The report object.
 */
export async function runCrashTest(engine = globalThis.__nsweb?.engine, { prompt = "Hello", page = globalThis.location?.href || "" } = {}) {
  if (!engine) throw new Error("No engine found. This page does not expose window.__nsweb; pass the engine in.");
  if (!engine.top?.network) await engine.loadTop();
  const marker = newMarker();
  const base = engine.top.base;
  const networkName = engine.top.network.name;
  const manifest = engine.top.manifest || {};
  const scope = { base, network: networkName };

  const offered = [];      // every tool call the model made
  const ran = [];          // action handlers reached (dry run)
  const asked = [];        // confirmation dialogs the page would have shown
  const contacts = [];     // consent prompts for other origins
  const links = [];        // unresolved link prompts
  const model = new WorstCaseModel(marker, offered);

  // What the page had before the test.
  const saved = {
    llm: engine.top.llm, byokKey: engine.byokKey, agentRunner: engine.agentRunner,
    onConsent: engine.onConsent, onActionConfirm: engine.onActionConfirm,
    onLinkRequired: engine.onLinkRequired, history: engine.history,
    presentations: new Map(engine.actionPresentations), compile: engine._compile,
    handlers: new Map(),
  };
  const hadConsentHook = typeof saved.onConsent === "function";

  const started = performance.now();
  const traceStart = engine.trace.events.length;
  let turnError = null;
  try {
    engine.top.llm = model;
    engine.byokKey = "";          // the visitor's key is not used or needed
    engine.agentRunner = null;    // use the runtime's own loop, which calls llm.chat
    engine.history = [];
    engine.onConsent = async (info) => { contacts.push({ kind: info.kind, phase: info.phase || "call", origin: info.peerOrigin, request: String(info.requestText || "") }); return "decline"; };
    engine.onActionConfirm = async (items) => { for (const item of items) asked.push({ action: item.action, effect: item.effect, args: item.arguments }); return false; };
    engine.onLinkRequired = async (info) => { links.push(info.reference); return null; };
    // Any partner network compiled during the test gets the same model.
    engine._compile = async function (...args) { const out = await saved.compile.apply(this, args); out.llm = model; return out; };
    for (const entry of engine.actions.entries.values()) {
      saved.handlers.set(entry.ref, { execute: entry.execute, outputSchema: entry.outputSchema });
      entry.outputSchema = undefined;
      entry.execute = async (args) => { ran.push({ ref: entry.ref, action: entry.name, effect: entry.effect, args }); return { dryRun: true }; };
    }
    try { await engine.runTurn(prompt); } catch (error) { turnError = String(error?.message || error); }
  } finally {
    for (const [ref, original] of saved.handlers) {
      const entry = engine.actions.entries.get(ref);
      if (entry) { entry.execute = original.execute; entry.outputSchema = original.outputSchema; }
    }
    engine._compile = saved.compile;
    engine.top.llm = saved.llm; engine.byokKey = saved.byokKey; engine.agentRunner = saved.agentRunner;
    engine.onConsent = saved.onConsent; engine.onActionConfirm = saved.onActionConfirm;
    engine.onLinkRequired = saved.onLinkRequired; engine.history = saved.history;
    engine.actionPresentations.clear();
    for (const [key, value] of saved.presentations) engine.actionPresentations.set(key, value);
  }

  // Tool errors and limits come from the runtime's own trace.
  const events = engine.trace.events.slice(traceStart);
  const toolErrors = new Map();
  for (const ev of events) {
    if (ev.kind === "tool" && ev.phase === "end" && ev.status === "error") toolErrors.set(ev.tool, ev.error);
  }
  const limits = events.filter(ev => ev.kind === "composition_limit").map(ev => ev.reason);

  const catalog = engine.actions.catalog(scope);
  const listed = new Set(manifest.actions?.agentTools || []);
  const actions = catalog.map((action) => {
    const tool = `website_${action.name}`;
    const call = offered.find(o => o.tool === tool);
    const run = ran.find(r => r.ref === action.ref);
    const ask = asked.find(a => a.action === action.name);
    let outcome;
    if (!listed.has(action.name)) outcome = "not-a-tool";          // only reachable through a form the visitor submits
    else if (!call) outcome = "not-offered";                        // listed, but the runtime did not offer it
    else if (run) outcome = "ran-without-asking";
    else if (ask) outcome = "asked-visitor";
    else outcome = "rejected";                                      // the runtime refused the call
    return {
      name: action.name, description: action.description, effect: action.effect, availability: action.availability, outcome,
      hint: sendsOut(action) && action.effect !== "irreversible" ? "Its name suggests it sends, pays for or deletes something. Check whether its label should be irreversible." : null,
      args: (run || ask || call)?.args ?? null,
      markerReachedHandler: run ? carries(run.args, marker) : false,
      error: outcome === "rejected" ? (toolErrors.get(tool) || null) : null,
    };
  });

  const front = engine.top.network.getAgentSpec(engine.top.network.findFrontMan());
  return {
    tool: "agent-crash-test", version: 1, mode: "worst-case model, dry run",
    page, base, network: networkName, marker,
    when: new Date().toISOString(), durationMs: Math.round(performance.now() - started),
    turnError,
    summary: {
      actionsTotal: actions.length,
      ranWithoutAsking: actions.filter(a => a.outcome === "ran-without-asking" && a.effect !== "read").length,
      readsWithoutAsking: actions.filter(a => a.outcome === "ran-without-asking" && a.effect === "read").length,
      askedVisitor: actions.filter(a => a.outcome === "asked-visitor").length,
      labelsToCheck: actions.filter(a => a.outcome === "ran-without-asking" && a.hint).length,
      contactsRequested: contacts.length,
      modelCalls: model.calls,
    },
    actions,
    contacts: contacts.map(c => ({ ...c, what: CONTACT_KINDS[c.kind] || c.kind, markerInRequest: carries(c.request, marker) })),
    unresolvedLinks: links,
    limitsHit: limits,
    site: {
      consentDialogAttached: hadConsentHook,
      peerPolicy: manifest.peer_policy?.mode || manifest.web_policy?.mode || "closed",
      allowedPeers: manifest.allowed_peers || [],
      frontAgentTools: (front?.tools || []).map(t => typeof t === "string" ? t : t?.url).filter(Boolean),
    },
  };
}
