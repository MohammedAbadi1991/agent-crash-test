// Facts about the crash test, in one place. The home page, the assistant's read action
// and the bridge that other agent sites call all answer from this object.
export class Guide {
  static SITE = new URL("../", import.meta.url).href;

  static SHOPS = [
    { id: "weak", network: "corner_shop_weak", name: "Corner Shop (weak labels)", path: "shops/corner-weak/",
      about: "Labels changing the delivery address and sending a gift card as write, and emailing the order history as read." },
    { id: "fixed", network: "corner_shop_fixed", name: "Corner Shop (fixed labels)", path: "shops/corner-fixed/",
      about: "Same shop, with those three actions labelled irreversible." },
  ];

  static facts() {
    const harness = `${Guide.SITE}harness/auto.js`;
    return {
      whatItIs: "Agent Crash Test runs on an agentic website's own page. It swaps the page's AI model for a scripted one that calls every tool it is offered, and records what the page lets it do. It is a dry run: action handlers are replaced by recorders, so nothing is submitted or changed.",
      whatItReports: [
        "which site actions run as soon as the model calls them, and which ask the visitor first",
        "the arguments the model chose that reached each action",
        "which other sites or MCP services the model tried to contact, and that the visitor would be asked",
        "whether the page has a consent dialog attached, and its peer policy",
      ],
      whyItMatters: "The reference runtime asks the visitor only before actions the site labels irreversible. Read and write actions run without a dialog. So a site's safety depends on how its owner labelled each action.",
      howToTestYourOwnSite: {
        needs: "A page built with the Open Agentic Web reference runtime (it exposes window.__nsweb). Use a development copy with no real AI key saved in the browser: the line loads a script from this site into your page. To avoid that, copy the harness folder from the repository into your own project. No AI provider key is needed.",
        scriptTag: `<script type="module" src="${harness}"></script>`,
        console: `import("${harness}")`,
        result: "A report opens on top of your page. You can download it as JSON.",
      },
      outcomes: {
        "ran-without-asking": "The runtime ran the action as soon as the model called it. For a write, that is something a model can do without the visitor seeing it first.",
        "asked-visitor": "The runtime opened the confirmation dialog first. The test answered no.",
        "rejected": "The runtime refused the call before reaching the action, usually because the test's arguments did not fit the action's schema. The row says nothing about the label.",
        "not-a-tool": "The action is registered but not listed in actions.agentTools, so a model cannot call it directly.",
        "not-offered": "The action is listed but the runtime did not offer it to this network.",
      },
      fix: "Label every action that sends something out of the page, spends something or cannot be undone as irreversible, and give it a confirmation dialog that shows the visitor the real details.",
      demoShops: Guide.SHOPS.map(shop => ({ name: shop.name, about: shop.about, url: `${Guide.SITE}${shop.path}` })),
      limits: [
        "It shows what the page allows, not how likely a real model is to be talked into it.",
        "It tests pages built with the reference runtime. Other runtimes do not expose their engine the same way.",
        "It cannot test another site's own actions from here: those exist only on that site's page, so the test must run there.",
        "A dry run does not execute the site's handlers, so it cannot find bugs inside them.",
        "Arguments are built from each action's JSON Schema (types, enums, lengths, minimums, dates and emails). An action whose schema needs more than that, such as a pattern, shows as refused and is not tested.",
        "It does not certify a site as safe.",
      ],
      source: "https://github.com/MohammedAbadi1991/agent-crash-test",
    };
  }
}
