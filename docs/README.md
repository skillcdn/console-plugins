# Documents

What this repository keeps of itself, beside the plugins: how it is shaped, what is planned, why things are as they are, and how a plugin is added here. SkillCDN serves this directory with the plugins' skills (`SKILLCDN.md` at the root declares it), so that an agent asked to add or change a plugin here reads these pages through the connection as well as in the checkout. The contract of a plugin itself is the console's, [docs/specs/plugins.md](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md) of `skillcdn/console`, shipped in `node_modules/@skillcdn/console/docs/specs/plugins.md`; nothing of it is repeated here.

| Document | What it is |
|---|---|
| [repository.md](repository.md) | The shape of the repository: one package per plugin, what is shared between them and what is not, how a plugin ships and is run while it is written, what the checks hold |
| [roadmap.md](roadmap.md) | What exists, what is being built, what comes next: the plugins, one at a time |
| [adr/](adr/README.md) | The decisions with lasting consequences, one short file each |
| [guide/](guide/README.md) | For whoever adds or changes a plugin here: the steps, the conventions on top of the contract, a console on this machine, releasing |
