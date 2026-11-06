## What and why

<!-- One or two sentences. Link the issue or the roadmap item. -->

## Checklist

- [ ] `pnpm check` passes locally
- [ ] Tests cover the change: one per row of the plugin's design, what it does and what it refuses
- [ ] Docs updated per the table in `AGENTS.md`, "Documentation protocol" (the plugin's README and skills, the roadmap, the guide)
- [ ] A change to a published plugin carries a changeset; a change to the shape of its records raises `dataVersion` with an `upgrades` entry
- [ ] Every capability in the manifest has a row of the design that needs it, and the sentence an administrator reads for it is true of the code
- [ ] A secret is a `secret` setting the console puts in or verifies; the plugin never reads its value
- [ ] Everything a person wrote is shown as text, never rendered as HTML; the bundle's classes are prefixed `pl-<key>-`
- [ ] No secrets, account identifiers, internal hostnames, the organization's own work, pricing or production tuning values in the diff

<!-- Delete lines that do not apply. -->
