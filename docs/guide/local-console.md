# A console on this machine

The tests prove a plugin's logic and the package; a console that runs it is how the pages are looked at and the whole is worked as an agent and a person would, phase 4 of the console's skill [building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md). Nothing here is needed for `pnpm check`; what could not run is reported as not run, and the plugin is proven on the deployment's console after the install.

Two ways, both from a checkout of [`skillcdn/console`](https://github.com/skillcdn/console) at the catalog's version or later, with Docker for its database: the console's own preview, with nobody's identity provider, which is enough to look at the pages and try the commands; and the console run as a deployment runs it, with a provider of your own, which is the whole.

## The quick way: the console's preview, with the plugin installed

The console's checkout, installed and built as its README's "Install" says (`pnpm install`, `docker compose -f deploy/compose.dev.yaml up -d`, `pnpm build`), runs a console on this machine with its fixtures' people, who sign in from the browser at the addresses it prints, and a database of its own that goes when it ends. It takes a built plugin of another checkout, laid out as the image lays one out (`package.json`, `console-plugin.json`, `dist/`), installed beside its fixtures and not enabled:

```sh
pnpm turbo run build --filter @skillcdn/console-plugin-<key>        # here: dist/ of the plugin
cd <the console's checkout>
pnpm dev:plugins -- --plugin <this repository>/plugins/<key>         # as often as there are plugins to look at; --port <n> for another port
```

It prints where it listens and the addresses that sign a person in: `alice`, an administrator, and `bob` and `carol`, members. As `alice`, the Settings page lists the plugin as installed, with any reason it failed to load, and enabling it is the consent to each capability, the board project made from the manifest's defaults or chosen, the projects it is on and the settings; then the roles, granted to the fixture's people. After a change to the plugin, build it again and start the preview again: it copies what the plugin ships when it starts. The console's command is not signed in to this console; what an agent would do is done through the pages, or with `console login --url <the address printed>` approved on its pages.

## The whole: the console as a deployment runs it

### What the console reads

A console reads its plugins from the directory `PLUGINS_DIR` names: a `package.json` listing them as dependencies and `node_modules/<name>/` holding what each ships ([deploy/README.md of the console, "Plugins in the image"](https://github.com/skillcdn/console/blob/main/deploy/README.md#plugins-in-the-image)). From this repository's root:

```sh
pnpm plugins-dir            # builds every plugin, then writes .plugins-dir/ with what each ships, and prints PLUGINS_DIR=<path>
```

`.plugins-dir/` is a copy of the built packages, as the image holds them, not a link: after a change to a plugin, `pnpm plugins-dir` again and a restart of the console's api is the new version. It is ignored by git.

### The console

The console's checkout, run as its README's "Install" says, with `PLUGINS_DIR` set before the api starts:

```sh
git clone https://github.com/skillcdn/console.git && cd console
pnpm install
docker compose -f deploy/compose.dev.yaml up -d       # PostgreSQL, and a bucket with the S3 API
pnpm build                                            # the server, and the default UI into web/dist
cp .env.example .env
```

In `.env`: `PLUGINS_DIR` as `pnpm plugins-dir` printed it; `WEB_ROOT` so that the default UI is served; and signing in, which the console's pages need and the tests do not: a GitHub OAuth app of your own registered for `http://127.0.0.1:11199` with `http://127.0.0.1:11199/auth/gh/callback` as its callback, its client id and secret, `AUTH_SECRET`, `PUBLIC_URL=http://127.0.0.1:11199` and `ADMINS` with your login (`apps/console/README.md` and `deploy/README.md`, "Signing in", of the console). Then:

```sh
pnpm --filter @skillcdn/console-app run start migrate
pnpm --filter @skillcdn/console-app run dev           # the api, restarting on change: http://127.0.0.1:11199
```

The compose database's user owns the database, so `storage:sql` is available locally.

### Enabling and working the plugin

Signed in as the administrator, the Settings page lists the plugins installed, each with any reason it failed to load; enabling one is the consent to each capability, the board project made from the manifest's defaults or chosen, the projects it is on and the settings. An agent does the same with `console plugin <key> enable --consent <capability>,... --board new|<key> [--projects all|<key>,...] [--set <setting>=<value>]...`, signed in to the local console with `console login --url http://127.0.0.1:11199` and approved on its pages; a secret is read from standard input by `console plugin <key> secret <name>`, and a role is granted with `console plugin <key> grant <role> --person <login>|--project <key>|--everyone`.

Then the tabs appear where the manifest put them and the plugin is worked as an agent works it: `console plugin <key>` lists the commands, `console plugin <key> <command> ...` runs one, a decision raised is answered on the pages, a hook runs, a job runs at its time (the worker runs inside the api locally with `WORKER_IN_PROCESS`), and the pages are looked at in a browser, in English and in Korean (the person's language is chosen on their menu). What is seen is shown to the person at the checkpoint.
