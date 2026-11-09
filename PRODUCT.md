# Product

<!-- impeccable:product-schema 1 -->

What a design session needs to know about the pages of this repository's plugins: who they are for and what they must not break. The plugins themselves are described in [README.md](README.md), each one's design in its own `plugins/<key>/README.md`, and the rules for pages in [docs/guide/conventions.md](docs/guide/conventions.md#pages). This file links to those rules rather than repeating them. Where they differ, the conventions and the console's contract win.

## Platform

web

## Users

The people of an organization that runs a SkillCDN Console, at work, inside the console's tabs:

- **Members** (everyone): request leave, see their balance, see who is out today, and read what HR announced.
- **Managers**: answer their people's requests, which arrive as decisions, and record leave for them.
- **The holders of a plugin's own role** (HR, the messenger's keeper): configure the area (policies, kinds of leave, holidays, approval steps, routes, the connection to a messenger) and keep an eye on it.
- **Administrators**: enable a plugin, consent to its capabilities, set its settings and secrets on the console's own pages, and then visit the plugin's setup pages to check that everything is in place.

Each person has an agent that does the same work from the command line (`console plugin <key> ...`). A page and a command reach the same server code, so whatever a page shows, an agent can also do.

## Product Purpose

Each plugin takes over one whole area of an organization's work, as a company names the function (HR first, then CRM and finance), together with `messenger`, which carries what every area tells people out to the messengers they already use and brings their answers back. The pages exist so that a person can see where things stand and decide. The plugin, or the person's agent, does the rest. A page succeeds when a person finds what is waiting on them, understands it, and acts in a few seconds, without having to learn the plugin.

## Positioning

People decide and agents work. A plugin never computes an answer that belongs to a person: it raises a decision and waits, and its pages show the decision, the reason, and the line that produced every figure (a balance comes with its ledger). What a person may do, their agent may do through the same command. The pages are one way into an area; the command line is the other way in, and it is just as complete.

## Operating Context

- A page or a widget runs in a sandboxed frame inside the console. It talks to the console through the frame alone (`command`, `query`, `records`, `navigate`, ...). Widgets sit on the console's front page in the cells they declare.
- The console sends the person's language, the workspace's first day of the week and its time zone (`UTC` when nobody set one), and the frame's size.
- A plugin is rebuilt against the console it runs on; the console's plugin API changes with every release before 1.0.
- Pages are tried by a person on a console on this machine ([docs/guide/local-console.md](docs/guide/local-console.md)). The preview copies the plugin's built files when it starts, so it has no hot reload: after a change, build the plugin and start the preview again.

## Capabilities and Constraints

- **The look is the console's.** The plugins have no visual world of their own. A page is built from the console's `sc-` classes and `--sc-*` tokens: a head (`sc-page-head`), panes (`sc-panel`), the view switch (`sc-subtabs`), facts, avatars, progress bars and empty states. A plugin's own classes start with `pl-<key>-` and style only its own elements, never one of the console's by descendant selector. A plugin's design work happens inside that system and must look at home next to the console's own pages.
- **Two languages from the first commit**: English and Korean. Every word comes from `src/web/words.ts`. Dates and figures go through `Intl`. Korean labels run differently in length than English, so layouts must hold both.
- **The frame's limits** ([AGENTS.md, Gotchas](AGENTS.md#gotchas)): no `alert`, `confirm` or `prompt` (a page asks its questions in the page itself), no clipboard, no `localStorage`, no network, no cookies. A link to the web opens only from the press's own handler. Text is rendered with `textContent`, never as HTML. A frame's policy does not apply a `style` attribute.
- **Widgets** fill the cells they are given at every declared size, and show less rather than scroll. Widgets add no padding of their own.
- **Pages refresh** on the console's events for what their plugin changed. All logic stays in the server module.
- Undecided: the next plugins (`crm`, `finance`) and their pages are proposed in [docs/roadmap.md](docs/roadmap.md) and decided at each one's design checkpoint, not here.

## Evidence on Hand

- The pages that exist: `hr` (overview, announcements, leave, calendar, approvals, people, setup; widgets for announcements, balance, today and approvals) in `plugins/hr/src/web`, and `messenger` (connection, routes, people, activity) in `plugins/messenger/src/web`. `plugins/hello` is the smallest example.
- Every fixture and example is invented. This repository is public: no real organization, person, customer, console address or screenshot of a real workspace goes into a design, a mock or a commit.

## Product Principles

1. A person decides; a page shows what waits on them first and makes the decision easy to make well.
2. Every figure shows where it came from.
3. A page and the command line do the same thing, so a page never holds logic of its own.
4. At home in the console: a plugin's page should look like part of the console, not like a product dropped into a frame.
5. Both languages, every time.
