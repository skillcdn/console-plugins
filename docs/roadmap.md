# Roadmap

What exists, what is being built, what comes next. Update this file in the same change that starts, finishes or drops an item; the organization's own tracking of the work stays on its board, never here. One plugin at a time, each written as the console's skill `building-a-plugin` writes one: the design first, shown to the person; then the code and its tests; the pages looked at on a console of this machine; the release; and the install handed to the deployment as a task.

## Done

- **The shape (2026-11-06).** The repository laid out so that the first plugin can be written: the working agreement ([AGENTS.md](../AGENTS.md)), the shape and its decisions ([repository.md](repository.md), [ADR-0001](adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md) to [ADR-0004](adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)), the toolchain, the checks and CI, the release workflow, the guide, and `hello` (`plugins/hello/`), the console's template adapted to the conventions here, built and tested as the smoke test.
- **Console 0.4.3 (2026-11-06).** The catalog on 0.4.3, which brought what the first plugin asked of the console: an option's key answered back to the hook, the people events delivered to a plugin that reads the directory, the console's preview taking a built plugin of another checkout, `init` taking the package, the repository and the languages.

## Next: the first plugins

Each becomes a directory under `plugins/`, in this order. A plugin is a whole area of the organization's work, named as a company names the function, so that it takes over what that function does by hand; the features of an area are its commands, pages and skills, added one at a time. What each does is written here as the proposal the design checkpoint starts from, decided with the person before any code; the design table in the plugin's README is what lands.

| Plugin | Name | Tab | Board | What it does, as proposed | Status |
|---|---|---|---|---|---|
| `hr` | HR (인사) | People | required: a project for the people's matters, made from the manifest's defaults or chosen | Leave first, built 2026-11-06 ([plugins/hr/README.md](../plugins/hr/README.md), "The design"): requests from an agent or the page, the approval a decision for the approver, a hook moving the record on the answer, balances from a policy (presets for Korea by hire date and by fiscal year, two US shapes, a flat number, by hand) over a ledger of every change, holidays from built-in calendars, who sees what as settings, hooks that hear a decision answered and people leaving or coming back, a daily job with tasks for HR, six pages and two widgets, two skills. Then attendance (working days, absences, check-in and check-out) and the people's records in the same plugin; the volume of attendance is read against the records' quota at its design checkpoint (a day as one record, or a schema of its own). | in progress: leave built and tested against console 0.4.3; the pages are being looked at on the console's preview; the first version is published once the person has seen them |
| `crm` | CRM (고객 관리) | Customers | optional | Customers, contacts and deals as records with search; the follow-ups as tasks on the board project; a pipeline page and a widget of what is due. | planned |
| `finance` | Finance (재무) | Money | required | Expenses, invoices and budgets as records; approvals as decisions; a monthly close as a job writing a page; the figures from aggregates over the records, a schema of its own (`storage:sql`) only where the design shows the figures need it. | planned |

## Open points of `hr`

Decided with the person before they are built; none blocks the first version.

- Leave in units smaller than a half day (Korea's rule from 2027-06-10, half days at least, up to five days a year under the draft decree) and hours for part-time schedules: a `unit` on the kind of leave, or hours on the request.
- Attendance's rate of 80%, which decides the year's 15 days in Korea: known once attendance is a feature; until then HR adjusts.
- Sick leave accrued by hours worked, as US state laws have it: the same dependency on attendance.
- Approval by more than one person in turn, a blackout span nobody takes leave in, a file on a request (a medical certificate; the `files` capability), a document on the board at year end with the figures for payroll.
- The settlement at termination compared with the hire-date basis, which Korea's fiscal-year practice asks for: a query that shows both counts, HR still writing the adjustment.
- The records' quota (100,000 per plugin) against the ledger: a line per grant, use and expiry per person per year is small; attendance is the feature that will decide between a day as one record and `storage:sql`.

## Later

- A shared package under `packages/`, when two plugins need the same code ([repository.md](repository.md)).
- The second pass over the contract: what the first plugins ask of the console is proposed in the console's repository and adopted here by version, never worked around here.
- The example written again from the console's template when a release changes it.

## Not planned

- A plugin that keeps state outside the console: records, or a schema of its own by consent, as the contract has it.
- Installing a plugin otherwise than as a release of a deployment: no store here, nothing installed at runtime.
