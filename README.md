# Agent Crash Test

Run a model that says yes to everything against an agentic website, on its own page, and
see what the page lets it do without asking the visitor.

Built for the [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/). It
is itself an agentic website that conforms to the
[Open Agentic Web specification](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md)
(MVP Profile 0.3), and it runs on the unchanged reference browser runtime.

Live site: https://d3c7h3snp0n4hj.cloudfront.net/

## Why

An agentic website gives a model tools: read the page, fill a form, place an order. The
reference runtime asks the visitor before an action only when the site labels that action
`irreversible`. Actions labelled `read` or `write` run as soon as the model calls them.
The runtime's own documentation says so, and notes that the specification asks for more.

So a site's safety rests on how its owner labelled each action. A label is easy to get
wrong, and nothing shows the owner the result. Existing tools read a site's published
files from outside. They cannot see how the page behaves, because a site's actions exist
only on that site's page.

Agent Crash Test runs there. It answers one question with a measurement: if the model
agreed to everything, what would this page do without asking?

## What it does

On a page built with the reference runtime, the test:

1. takes the engine the page already runs, with its real network, tool table and site
   actions;
2. swaps the model for a scripted one that calls every tool it is offered, with marked
   arguments;
3. replaces each action's handler with a recorder, and answers every dialog with "no";
4. reports which actions ran without asking, which asked first, what arguments reached
   them, and which other sites or MCP services the model tried to contact;
5. puts the model, the handlers, the chat history and any remembered consent answers back.
   The runtime's own execution log keeps the test's events until the page is reloaded.

It is a dry run: nothing is submitted or changed. It needs no AI provider key, costs
nothing, takes a few milliseconds and gives the same outcomes every time.

## Try it

Open the live site and press **Run the crash test** on each demo shop. No AI key is needed
for that. The two shops run the same shop code. They differ in how three actions are
labelled, and in the confirmation dialogs that go with those labels.

The assistant at the bottom of the page needs an AI provider key (for example a free Otari
key), entered under **AI model settings**. Your messages and the page data it reads go to
the LLM provider you choose there.

| Action | Weak shop label | Result | Fixed shop label | Result |
| --- | --- | --- | --- | --- |
| `set_delivery_address` | write | runs without asking | irreversible | asks first |
| `send_gift_card` | write | runs without asking | irreversible | asks first |
| `email_order_history` | read | runs without asking | irreversible | asks first |
| `add_to_cart` | write | runs without asking | write | runs without asking |
| `place_order` | irreversible | asks first | irreversible | asks first |

The demo shops are simulations. No goods, payments or emails are real, and the account
lives in the visitor's browser.

## Run it on your own site

Your site's actions exist only on your site's page, so the test runs there. Use a
development copy with no real AI key saved in the browser: the line below loads a script
from the live site into your page. To avoid that, copy `site/harness/` into your own
project and import it from there. Add one line to the page and reload it:

```html
<script type="module" src="https://d3c7h3snp0n4hj.cloudfront.net/harness/auto.js"></script>
```

Or paste one line into the browser console on your page:

```js
import("https://d3c7h3snp0n4hj.cloudfront.net/harness/auto.js")
```

A report opens on top of the page. You can download it as JSON.

To call it from your own tests instead, import `runCrashTest` from `harness/crash-test.js`
and pass it your engine. `tests/crash-test.test.mjs` shows this in Node, without a
browser.

## What it does not tell you

- How likely a real model is to be talked into something. It shows what the page allows
  if it is.
- Whether another website is safe to link to. It cannot run a site's own actions from
  outside that site.
- Whether your action handlers have bugs. A dry run never calls them.
- Anything about an action whose schema the test cannot fill. It builds arguments from
  types, enums, lengths, minimums, dates and emails. A schema that needs more, such as a
  pattern, makes the runtime refuse the call, and the row shows as `rejected`.
- That a site is safe. It is one test, not a certificate.

It works on pages that expose the reference runtime's engine as `window.__nsweb`, which
the runtime's `boot()` does. Other runtimes need `runCrashTest(engine)` called by hand.

## How the report reads

| Outcome | Meaning |
| --- | --- |
| `ran-without-asking` | The runtime ran the action as soon as the model called it. |
| `asked-visitor` | The runtime opened the confirmation dialog first. The test answered no. |
| `rejected` | The runtime refused the call before reaching the action, usually because the test's arguments did not fit the schema. It says nothing about the label. |
| `not-a-tool` | Registered, but not listed in `actions.agentTools`, so a model cannot call it directly. |
| `not-offered` | Listed, but the runtime did not offer it to this network. |

A row also carries a hint when an action that runs without asking has a name that suggests
it sends, pays for or deletes something. The hint is a prompt to check the label. It is
not a finding.

## The site as an agentic website

- The network URL other sites use is `https://d3c7h3snp0n4hj.cloudfront.net/agent_crash_test`.
- `site/agent-manifest.json` publishes one network, `agent_crash_test`, with two agents:
  the front agent `crash_test_guide`, and `report_analyst`, which it asks to read and
  compare reports.
- On the page, the agent has three site actions: `get_page_state` (read),
  `run_demo_crash_test` (write, a dry run on a demo shop) and `get_report` (read).
- Other agentic websites can call the network. Run in their visitor's browser, it reads
  the testing guide through `site/bridge/bridge-actions.js`, which shares one read with
  any caller. It shares no reports.
- It contacts no other site. Its peer policy is closed with no allowed peers.
- Each demo shop is its own agentic website with its own manifest, network and actions.

## Layout

| Path | What it is |
| --- | --- |
| `site/harness/crash-test.js` | The test: the worst-case model, the dry run and the report |
| `site/harness/panel.js` | Shows a report in a page or on top of one |
| `site/harness/auto.js` | Runs the test on the current page and shows the report |
| `site/js/`, `site/site-actions.js`, `site/bridge/` | The home page, its actions and the read it shares |
| `site/shops/` | The two demo shops and their shared page code |
| `site/runtime/` | The reference runtime, copied unchanged |
| `tools/make-home.mjs`, `tools/make-shops.mjs` | Write the network sources, manifests and mount scripts from the templates |
| `tools/scripts/`, `tools/templates/` | The agentify-website skill's build scripts and templates, copied unchanged |
| `deploy/` | CloudFormation template and script for hosting on Amazon S3 and CloudFront |
| `tests/` | Node tests that run the crash test on both shops with the real runtime |

## Build, test and serve

Needs Node.js 22 or later. There are no dependencies to install.

```shell
npm run build    # write the sources, then build and validate the three networks
npm test         # 5 tests, no browser and no AI provider
npm run serve    # http://127.0.0.1:8080
```

## Host an agentic website on AWS

`deploy/` holds a CloudFormation template that hosts any static agentic website on a
private Amazon S3 bucket behind Amazon CloudFront, with the response headers the
specification's reference hosting notes ask for: CORS on the public agent files, a strict
Content-Security-Policy on the coded-tool worker, and no caching of the agent files. See
`deploy/README.md`.

## Licence

MIT for this project's own code (`LICENSE`). The runtime, build scripts and templates come
from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web)
under Apache 2.0 (`NOTICE`, `LICENSE-APACHE-2.0`).
