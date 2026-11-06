# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public issue, discussion or pull request for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository: **Security → Report a vulnerability**. Include what you found, how to reproduce it, and the impact you expect. We will acknowledge the report, keep you informed while we investigate, and credit you when the fix ships unless you prefer otherwise.

If the issue is in the console itself, the host that runs plugins, the frames or the routes, rather than in a plugin here, report it to [`skillcdn/console`](https://github.com/skillcdn/console/security) the same way; if it is in SkillCDN, to [`skillcdn/skillcdn`](https://github.com/skillcdn/skillcdn/security). If it affects one installation rather than the code, tell whoever operates that installation.

## Scope

In scope:

- The code in this repository, and the packages published from it (`@skillcdn/console-plugin-*`).

Things we especially want to hear about:

- A plugin that reaches further than the capabilities its manifest declares, or lets a person see or change what their roles do not allow.
- A secret's value reaching plugin code, a log, a record, a page or a command's answer.
- Anything a person or an agent wrote (a record, an argument, a comment) that a plugin's page renders as HTML, or that a plugin takes as an instruction.
- A plugin that answers or computes a decision a person should make, or acts in a person's name.
- A dependency bundled into a plugin that is not what it says it is.

Out of scope: the console, SkillCDN and the services a plugin talks to over `ctx.fetch`, which have their own programs.
