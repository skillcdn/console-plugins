# ADR-0001: This repository holds the reference plugins and proposes a shape for a repository of several

- Status: Accepted
- Date: 2026-11-06

## Context

The console decided that a plugin is one npm package, that plugins live in repositories of their own, one or many to a repository as their authors choose, and that the console's repository ships the contract, the authoring command, an example and a skill, and no plugin ([ADR-0049](https://github.com/skillcdn/console/blob/main/docs/adr/0049-a-plugin-is-an-npm-package-installed-into-the-image-and-enabled-by-an-administrator.md) of the console). Its skill `building-a-plugin` writes a repository per plugin by default. The organization behind the console will write several plugins for its own console, publish them for anyone's, and add more over time; it wants them kept together, and wants others to be able to start from them, as they start from the reference console and the reference pack. What such a repository is, and what it is not, needed deciding before the first plugin.

## Decision

1. **This repository holds the reference plugins of the SkillCDN Console:** examples that follow the contract and are meant for real use, packaged so that anyone can install them into a console or start a plugin from them. It is to the console what `skillcdn/console` is to SkillCDN and `skillcdn/skills` to the SkillCDN Format: a reference, and not a second standard.
2. **It proposes a shape for a repository that keeps several plugins:** one workspace per plugin, each a complete package as the contract lays one out, with one toolchain, one check and one release workflow around them ([ADR-0002](0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md), [ADR-0003](0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)). The shape is a proposal: a plugin in a repository of its own, as the skill writes one, owes it nothing, and a fork keeps what fits.
3. **The contract stays in the console's repository.** The manifest, `ctx`, the capabilities, the bounds and the refusals are `docs/specs/plugins.md` of `skillcdn/console`, which `@skillcdn/console` ships; this repository defines nothing of it and repeats none of it, and links it where a reader needs it. What a plugin here needs of the contract is proposed there, as a task on the console's board where the organization has one, released there and adopted here by version, never copied here and never linked from the console's workspace.
4. **What it asks on top is written down and checked.** The conventions beyond the contract (the naming, the languages, the design in the README, the tests, the dependencies) are one page of the guide, and `scripts/check-plugins.mjs` holds what is mechanical, so that a fork inherits the checks with the shape.

## Consequences

- A team starting a plugin reads one repository with a worked example, a check that tells it what the console would refuse, and a release workflow; a team with one plugin may ignore the shape.
- Every change to what a plugin may do goes through the console first, which is slower than a workaround here and keeps the plugins honest to the contract they will meet in a deployment.
- The repository is public and holds the organization's plugins, so what the organization does with them (its board, its people, its deployment) is never in it; fixtures and examples are invented.
- Rejected: the plugins inside the console's repository (every console would carry every plugin, and the console decided against it); a repository per plugin for the organization's own (the same toolchain and checks copied as many times, drifting apart); a shape declared as the standard (the contract leaves the choice to authors, and this repository is a reference, not a rule).
