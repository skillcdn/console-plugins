# Roadmap

What exists, what is being built, what comes next. Update this file in the same change that starts, finishes or drops an item; the organization's own tracking of the work stays on its board, never here. One plugin at a time, each written as the console's skill `building-a-plugin` writes one: the design first, shown to the person; then the code and its tests; the pages looked at on a console of this machine; the release; and the install handed to the deployment as a task.

## Done

- **The shape (2026-11-06).** The repository laid out so that the first plugin can be written: the working agreement ([AGENTS.md](../AGENTS.md)), the shape and its decisions ([repository.md](repository.md), [ADR-0001](adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md) to [ADR-0004](adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)), the toolchain, the checks and CI, the release workflow, the guide, and `hello` (`plugins/hello/`), the console's template adapted to the conventions here, built and tested as the smoke test.

## Next: the first plugins

Each becomes a directory under `plugins/`, in this order. A plugin is a whole area of the organization's work, named as a company names the function, so that it takes over what that function does by hand; the features of an area are its commands, pages and skills, added one at a time. What each does is written here as the proposal the design checkpoint starts from, decided with the person before any code; the design table in the plugin's README is what lands.

| Plugin | Name | Tab | Board | What it does, as proposed | Status |
|---|---|---|---|---|---|
| `hr` | HR (인사) | People | required: a project for the people's matters, made from the manifest's defaults or chosen | Leave first: requests from an agent or from the page; the approval a decision addressed to the approver a setting names, the record moving on the answer through a hook; balances per person from a yearly allowance and the year's accrual as a job; a page for one's own leave, one for the approver, a balance widget. Then attendance (working days, absences, check-in and check-out) and the people's records in the same plugin; the volume of attendance is read against the records' quota at the design checkpoint (a day as one record, or a schema of its own). | planned, next |
| `crm` | CRM (고객 관리) | Customers | optional | Customers, contacts and deals as records with search; the follow-ups as tasks on the board project; a pipeline page and a widget of what is due. | planned |
| `finance` | Finance (재무) | Money | required | Expenses, invoices and budgets as records; approvals as decisions; a monthly close as a job writing a page; the figures from aggregates over the records, a schema of its own (`storage:sql`) only where the design shows the figures need it. | planned |

## Later

- A shared package under `packages/`, when two plugins need the same code ([repository.md](repository.md)).
- The second pass over the contract: what the first plugins ask of the console is proposed in the console's repository and adopted here by version, never worked around here.
- The example written again from the console's template when a release changes it.

## Not planned

- A plugin that keeps state outside the console: records, or a schema of its own by consent, as the contract has it.
- Installing a plugin otherwise than as a release of a deployment: no store here, nothing installed at runtime.
