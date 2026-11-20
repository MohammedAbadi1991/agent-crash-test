// panel.js — show a crash-test report. renderReport() fills any element; showOverlay()
// puts the report in a dialog on top of the page under test. Styles live in a shadow
// root, so the page's stylesheet and the report do not affect each other.

const STYLE = `
:host { all: initial; }
.report { font: 15px/1.5 system-ui, sans-serif; color: #1c2024; outline: none; }
h2 { font-size: 20px; margin: 0 0 4px; }
h3 { font-size: 15px; margin: 20px 0 6px; }
p { margin: 6px 0; }
.sub { color: #5b6470; font-size: 13px; }
.verdict { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 14px 0; }
.stat { border: 1px solid #d5dae0; border-radius: 8px; padding: 10px 12px; background: #fff; }
.stat b { display: block; font-size: 26px; line-height: 1.1; }
.stat.warn { border-color: #b3541e; background: #fdf3ea; }
.stat.good { border-color: #2f6f4f; background: #eef7f1; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e3e7eb; vertical-align: top; }
th { font-weight: 600; color: #3d4650; }
code { font: 13px ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.badge { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.badge.warn { background: #b3541e; color: #fff; }
.badge.good { background: #2f6f4f; color: #fff; }
.badge.plain { background: #e3e7eb; color: #2a3138; }
.hint { color: #8a3d10; font-size: 13px; margin-top: 3px; }
.args { color: #5b6470; font-size: 12px; margin-top: 3px; }
ul { margin: 6px 0; padding-left: 20px; }
.actions-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
button { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid #1c2024; background: #1c2024; color: #fff; cursor: pointer; }
button.quiet { background: #fff; color: #1c2024; }
dialog { font: 15px/1.5 system-ui, sans-serif; border: 1px solid #9aa3ad; border-radius: 12px; padding: 22px; width: min(860px, 92vw); max-height: 88vh; overflow: auto; }
dialog::backdrop { background: rgba(20, 24, 28, 0.45); }
`;

const OUTCOME = {
  "ran-without-asking": { text: "Runs without asking", tone: "warn" },
  "asked-visitor": { text: "Asks the visitor first", tone: "good" },
  "rejected": { text: "Refused by the runtime", tone: "plain" },
  "not-a-tool": { text: "Not a model tool", tone: "plain" },
  "not-offered": { text: "Not offered to the model", tone: "plain" },
};

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value; else node[key] = value;
  }
  node.append(...children.filter(child => child !== null && child !== undefined));
  return node;
}

function stat(count, label, tone) {
  return el("div", { class: `stat ${tone}` }, el("b", {}, String(count)), label);
}

/** Build the report as a DOM fragment (no styles; callers add them). */
export function reportBody(report) {
  const s = report.summary;
  const body = el("div", { class: "report", tabIndex: -1 });
  body.append(
    el("h2", {}, s.ranWithoutAsking
      ? `${s.ranWithoutAsking} action${s.ranWithoutAsking === 1 ? "" : "s"} that change${s.ranWithoutAsking === 1 ? "s" : ""} something can run without asking the visitor`
      : "No action that changes something can run without asking the visitor"),
    el("p", { class: "sub" }, `Network ${report.network} at ${report.base}. A model that agrees to everything was offered every tool once. Dry run: nothing was submitted or changed. ${s.modelCalls} scripted model calls, ${report.durationMs} ms, no AI provider used.`),
    el("div", { class: "verdict" },
      stat(s.ranWithoutAsking, "writes that run without asking", s.ranWithoutAsking ? "warn" : "good"),
      stat(s.askedVisitor, "actions that ask the visitor first", "good"),
      stat(s.readsWithoutAsking, "reads that run without asking", "plain"),
      stat(s.labelsToCheck ?? 0, "labels worth a second look", s.labelsToCheck ? "warn" : "plain"),
      stat(s.contactsRequested, "requests to contact another site", "plain")),
  );
  if (report.turnError) body.append(el("p", { class: "hint" }, `The turn stopped with an error: ${report.turnError}`));

  const rows = report.actions.map((a) => {
    const outcome = a.outcome === "ran-without-asking" && a.effect === "read"
      ? { text: "Runs without asking (read)", tone: "plain" } : OUTCOME[a.outcome];
    const detail = el("td", {}, el("code", {}, a.name));
    if (a.args && Object.keys(a.args).length) detail.append(el("div", { class: "args" }, "Model sent: ", el("code", {}, JSON.stringify(a.args))));
    if (a.error) detail.append(el("div", { class: "args" }, `Runtime said: ${a.error}`));
    if (a.hint && a.outcome === "ran-without-asking") detail.append(el("div", { class: "hint" }, a.hint));
    return el("tr", {}, detail, el("td", {}, a.effect), el("td", {}, el("span", { class: `badge ${outcome.tone}` }, outcome.text)));
  });
  body.append(el("h3", {}, "Site actions"),
    report.actions.length
      ? el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Action"), el("th", {}, "Site's label"), el("th", {}, "With a model that says yes"))), el("tbody", {}, ...rows))
      : el("p", {}, "This page registers no site actions."));

  body.append(el("h3", {}, "Other sites and services"));
  if (report.contacts.length) {
    body.append(el("ul", {}, ...report.contacts.map(c => el("li", {},
      `The model tried to contact ${c.what} at `, el("code", {}, c.origin), `. The visitor would be asked first${c.markerInRequest ? ", and the request carried model-chosen text" : ""}.`))));
  } else {
    body.append(el("p", {}, "The model was offered no tool that contacts another site."));
  }
  const site = report.site;
  body.append(el("ul", {},
    el("li", {}, site.consentDialogAttached ? "The page has a consent dialog attached." : "The page has no consent dialog attached, so the runtime would allow every contact by default."),
    el("li", {}, site.peerPolicy === "open" ? "Peer policy is open: agents may contact any site that is not on the deny list." : `Peer policy is closed: ${site.allowedPeers.length} allowed origin${site.allowedPeers.length === 1 ? "" : "s"}.`),
    ...report.limitsHit.map(reason => el("li", {}, `Limit reached: ${reason}.`))));

  body.append(el("h3", {}, "How to read this"),
    el("ul", {},
      el("li", {}, "The reference runtime asks the visitor only before actions labelled irreversible. Read and write actions run as soon as the model calls them."),
      el("li", {}, "So each row marked \"Runs without asking\" is something a model can do with arguments it chose, if text on a page, in a tool result or from a partner site talks it into it."),
      el("li", {}, "The test shows what the page allows. It does not show how likely your model is to be talked into it.")));
  return body;
}

/** Render a report into a container element. */
export function renderReport(report, container) {
  const host = el("div");
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", { textContent: STYLE }), reportBody(report));
  container.replaceChildren(host);
  return host;
}

function download(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = el("a", { href: URL.createObjectURL(blob), download: `crash-test-${report.network}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Show the report in a dialog on top of the current page. */
export function showOverlay(report) {
  document.getElementById("agent-crash-test-overlay")?.remove();
  const host = el("div", { id: "agent-crash-test-overlay" });
  const root = host.attachShadow({ mode: "open" });
  const dialog = el("dialog", {});
  const close = el("button", { class: "quiet", textContent: "Close" });
  const save = el("button", { textContent: "Download the report (JSON)" });
  close.addEventListener("click", () => dialog.close());
  save.addEventListener("click", () => download(report));
  dialog.addEventListener("close", () => host.remove());
  dialog.append(reportBody(report), el("div", { class: "actions-row" }, save, close));
  root.append(el("style", { textContent: STYLE }), dialog);
  document.body.append(host);
  dialog.showModal();
  // Start at the top of the report, not on the buttons at its end.
  dialog.querySelector(".report").focus({ preventScroll: true });
  dialog.scrollTop = 0;
  return host;
}
