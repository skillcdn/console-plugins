# Roadmap

What exists, what is being built and what comes next, at a glance. This page says that a thing is there or is not yet; the document each line links says what it is.

## How this page is kept

- **An entry is one to three sentences**, in the terms of whoever uses the thing: a person in the console's tabs, an agent working a plugin for them, the administrator who enables one, the deployment that installs one, the author who writes one. How it works, why it was decided and what was tried belong to the document the entry links, a plugin's README, a page of the [guide](guide/README.md) or an [ADR](adr/README.md), and are not repeated here.
- **Three states.** *In progress* is being built or proven now. *Next* is agreed and not started, and says what it waits for where it waits. *Undecided* is an idea nobody has committed to. What is finished moves into the line of its area under [What exists](#what-exists); what is dropped is deleted.
- **No history.** No dates, no order of events, no figures. Git history is the record, each plugin's `CHANGELOG.md` says what a release changed, and the ADRs say why.
- **Updated with the change** that starts, finishes or drops an item. The organization's own tasks stay on its board, never here; this page stays coarse.

## In progress

| Item | Where it stands |
|---|---|
| **The pages folded into the console's parts** | A plugin's look is the console's parts, and a class of the plugin's only places them ([ADR-0013](adr/0013-a-plugins-look-is-the-consoles-parts-and-a-plugins-class-places-them.md)). Left: what `hr` and `messenger` still draw, listed in each one's `src/web/drawn.json`, folded at each page's next design pass, with a part proposed to the console where it has none. |
| **The messenger on a real Slack workspace** | What can only be seen by pressing in Slack is measured on the first console Slack reaches that runs the plugin. Left: what the messenger's README lists as not measured yet, from an edited message keeping its name and picture to a second workspace installing the app ([What the deployment must provide](../plugins/messenger/README.md#what-the-deployment-must-provide)). |

## Next

| Item | What it is |
|---|---|
| **Attendance in `hr`** | Working days, absences, check-in and check-out, then the people's records, in the same plugin: a day as one record or a schema of its own is decided at its design checkpoint, by its volume against the records' quota ([hr's README](../plugins/hr/README.md#not-yet)). |
| **`crm`** | CRM (고객 관리), under Customers: customers, contacts and deals as records with search, the follow-ups as tasks on an optional board project, a pipeline page and a widget of what is due. Designed with the person before any code. |
| **`finance`** | Finance (재무), under Money: expenses, invoices and budgets as records, approvals as decisions, a monthly close as a job that writes a page, the figures from the records, and a schema of its own (`storage:sql`) only where the design shows the figures need one. |
| **HR's editor on the console's icons** | The eight tools of the announcement editor drawn from the console's icon pack (`@skillcdn/console/icons`), all at once so that one bar keeps one look. Waits for the pack's glyphs of a numbered list, a quote, undo and redo. |

## Undecided

- **For `hr`:** leave by the hour, which Korea allows from 2027-06-10, and hours for part-time schedules; the attendance rate that decides Korea's fifteen days, and sick leave accrued by hours worked, both once attendance is there; a span nobody takes leave in; a file on a request, such as a medical certificate; a year-end page for payroll; a leaver's settlement shown on both bases, hire date and fiscal year.
- **For `messenger`:** a slash command beside the shortcut, only if a real workspace refuses the shortcut's name; a route that takes the request at submission as well as the thread; what a member is told on the app's Home tab; an Enterprise Grid organization installing once for all its workspaces; a route narrowed to a team of the console's; a form for a manager's acts; asking again for the role it needs of `hr`; a messenger that signs with RS256 or wants a webhook per channel, which asks the console for more ([ADR-0014](adr/0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md), [ADR-0015](adr/0015-what-a-person-is-told-of-their-own-work-is-theirs-to-choose-on-the-console-and-through-their-agent.md)).
- **A shared package** under `packages/`, when two plugins need the same code ([repository.md](repository.md)).

## What exists

Built, tested in this repository, and published where it says so. Each plugin is built for console 0.6 ([ADR-0006](adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)).

| Area | What works | Where it is said |
|---|---|---|
| **`hr`: leave** | A person, or their agent, requests leave and cancels it; their manager in the console approves it, with whatever steps an organization adds, and records leave for their people; balances come from a policy, Korea's by hire date or by fiscal year, the US's, a flat number or by hand, over a ledger of every change; each kind keeps its own rules of notice, late requests, approval and cancelling; holidays come from built-in calendars; HR keeps it all on its own page, and a daily job leaves HR its tasks. Published, with its contract for other plugins. | [hr's README](../plugins/hr/README.md), [the contract](../plugins/hr/README.md#the-contract) |
| **`hr`: announcements** | HR, or HR's agent, drafts, publishes, pins and takes down what it tells everyone, in Markdown with pictures, on a page and a widget. | [hr's README](../plugins/hr/README.md#the-design) |
| **`messenger`** | Every message a plugin has for people leaves the console through it, Slack first: one app installed in each workspace that takes it, people matched by email, the console told whose each account is where an administrator lets it ([ADR-0021](adr/0021-the-messenger-tells-the-console-whose-an-account-is-from-a-link-the-matching-wrote-and-nothing-else.md)), what the console tells each member of sent on to them, each choosing which of it reaches them in Slack, routes for each plugin's events; for `hr`, a shortcut whose form requests and cancels leave, and the approval threaded with whoever decides, answered there or on the board alike. Published. | [messenger's README](../plugins/messenger/README.md), [ADR-0008](adr/0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md) to [ADR-0018](adr/0018-the-messenger-has-no-page-on-a-project-and-the-workspace-each-is-told-in-is-said-on-its-connection-page.md) |
| **`hello`** | The plugin `console-plugin init` writes, adapted to the conventions here: the worked example a new plugin starts from, and the smoke test of the toolchain. Never published. | [hello's README](../plugins/hello/README.md) |
| **Two languages** | Every plugin speaks English and Korean from its first commit, each text in the language of whoever reads it, and its Korean writes a particle in the form its word takes. | [conventions](guide/conventions.md#languages), [ADR-0004](adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md) |
| **The shape** | One directory and one npm package per plugin, one toolchain, one check and one release workflow; nothing shared at runtime, and nothing of the console's contract copied. | [repository.md](repository.md), [ADR-0001](adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md) to [ADR-0003](adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md) |
| **The checks** | `pnpm check` holds every plugin to what a console would refuse and to what this repository asks: its shape, its two languages, its pages built from the console's parts, the licenses of what it bundles, its versions against the console's line, and the skills and documents as SkillCDN serves them. | [repository.md](repository.md#what-the-checks-hold), [conventions](guide/conventions.md) |
| **Releasing** | Each plugin versioned on its own from its changesets and published by the release workflow through trusted publishing, with provenance; a new plugin's first publish is run by an agent, the maintainer giving only what proves who they are. | [releasing](guide/releasing.md), [ADR-0007](adr/0007-a-plugin-is-named-on-the-registry-by-hand-and-its-first-version-is-the-workflows.md), [ADR-0012](adr/0012-an-agent-runs-a-plugins-first-publish-and-the-maintainer-gives-only-what-proves-who-they-are.md) |
| **A console on this machine** | A plugin's pages and commands tried on the console's preview, with an invented organization's work and nobody's identity provider, and a deployment's own pages looked at through `console serve`. | [a console on this machine](guide/local-console.md) |
| **The pack** | The plugins' skills and these documents served by SkillCDN, with a page that says which skill a request leads to. | [start.md](start.md), [`SKILLCDN.md`](../SKILLCDN.md) |

## Not planned

- A plugin that keeps state outside the console: records, or a schema of its own by consent, as the contract has it.
- Installing a plugin otherwise than as a release of a deployment: no store here, nothing installed at runtime.
