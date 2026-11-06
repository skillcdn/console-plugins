// Writes a plugins directory for a console on this machine, so that the plugins here are looked
// at as a deployment's console shows them (docs/guide/local-console.md): `.plugins-dir/` with a
// package.json that names every plugin and `node_modules/<name>/` holding what each ships, the
// files its `files` list names with its package.json, README and the license, as the image holds
// them once `npm ci` has installed them (the console's deploy/README.md, "Plugins in the image").
// Nothing is linked and nothing runs: the directory is a copy, made again after a rebuild. Run
// after `pnpm build`, which `pnpm plugins-dir` does first. Prints the variable to set.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const target = join(root, ".plugins-dir");
const pluginsDir = join(root, "plugins");

/** What ships beside what `files` names: npm always includes these. */
const ALWAYS = ["package.json", "README.md"];

const plugins = readdirSync(pluginsDir, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(pluginsDir, entry.name, "package.json")),
  )
  .map((entry) => {
    const dir = join(pluginsDir, entry.name);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return {
      key: entry.name,
      dir,
      name: manifest.name,
      version: manifest.version,
      files: manifest.files ?? [],
    };
  });

if (plugins.length === 0) {
  process.stderr.write("no plugin under plugins/ has a package.json\n");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, "node_modules"), { recursive: true });
writeFileSync(
  join(target, "package.json"),
  `${JSON.stringify(
    {
      name: "plugins",
      private: true,
      dependencies: Object.fromEntries(plugins.map((plugin) => [plugin.name, plugin.version])),
    },
    null,
    2,
  )}\n`,
);

const missing = [];
for (const plugin of plugins) {
  const into = join(target, "node_modules", ...plugin.name.split("/"));
  mkdirSync(into, { recursive: true });
  for (const shipped of [...ALWAYS, ...plugin.files]) {
    const from = join(plugin.dir, shipped);
    if (!existsSync(from)) {
      if (shipped === "dist") {
        missing.push(`${plugin.key}: ${shipped} is not built; run pnpm build first`);
      }
      continue;
    }
    cpSync(from, join(into, shipped), { recursive: true, dereference: true });
  }
  cpSync(join(root, "LICENSE.md"), join(into, "LICENSE.md"));
}

if (missing.length > 0) {
  process.stderr.write(`${missing.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} in ${target}: ${plugins.map((plugin) => `${plugin.name}@${plugin.version}`).join(", ")}\n` +
    `PLUGINS_DIR=${target}\n` +
    "Start a console with that in its environment; docs/guide/local-console.md says how.\n",
);
