// What a plugin ships is what its bundles hold: the server module and the web bundle are built
// with everything they import bundled in, and a deployment installs the package into its image.
// So the license that matters is that of every package a bundle pulls in, and nothing else here
// ships: the development tools (TypeScript, Vitest, esbuild, Biome, Turborepo, the changesets, the
// skillcdn command) stay on the machine that builds. This builds each plugin's bundles in memory
// with a metafile, as its build.mjs builds them, reads the package every input file belongs to,
// and holds each to a permissive license: no copyleft and nothing source-available (AGENTS.md,
// Dependencies). The one exception is the main repository's own packages, @skillcdn/*, under its
// license, FSL-1.1-ALv2, should a bundle ever pull one in; @skillcdn/console, which every plugin
// bundles from, is MIT and needs none. Part of `pnpm check`; no network.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import process from "node:process";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");

/** SPDX identifiers that permit bundling and redistribution without conditions we cannot meet. */
const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "CC-BY-4.0",
  "Zlib",
]);

/** The packages allowed under the main repository's license, by the prefix of their name. */
const SKILLCDN_PACKAGES = "@skillcdn/";
const SKILLCDN_LICENSE = "FSL-1.1-ALv2";

/** `(MIT OR Apache-2.0)` is fine when one side is; `MIT AND X` only when both are. */
function allowed(expression) {
  const trimmed = expression.trim().replace(/^\(|\)$/g, "");
  if (/\bOR\b/i.test(trimmed)) return trimmed.split(/\s+OR\s+/i).some(allowed);
  if (/\bAND\b/i.test(trimmed)) return trimmed.split(/\s+AND\s+/i).every(allowed);
  return ALLOWED.has(trimmed);
}

/** The root directory of the package a file belongs to (`.../node_modules/<name>`, scoped or not); none for a file of the plugin's own. */
function packageRootOf(file) {
  const parts = file.split(sep);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1 || parts[at + 1] === undefined) return undefined;
  const scoped = parts[at + 1].startsWith("@");
  return parts.slice(0, at + (scoped ? 3 : 2)).join(sep);
}

/** The bundles a plugin ships, built as build.mjs builds them but kept in memory, and the files each pulled in. */
async function bundledFiles(pluginDir) {
  const inputs = new Set();
  for (const [entry, platform] of [
    ["src/server/index.ts", "node"],
    ["src/web/index.ts", "browser"],
  ]) {
    if (!existsSync(join(pluginDir, entry))) continue;
    const result = await build({
      entryPoints: [join(pluginDir, entry)],
      bundle: true,
      write: false,
      metafile: true,
      platform,
      format: "esm",
      target: platform === "node" ? "node24" : "es2022",
      absWorkingDir: pluginDir,
      logLevel: "silent",
    });
    for (const input of Object.keys(result.metafile.inputs)) {
      inputs.add(resolve(pluginDir, input));
    }
  }
  return inputs;
}

const plugins = readdirSync(join(root, "plugins"), { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(root, "plugins", entry.name, "package.json")),
  )
  .map((entry) => entry.name)
  .sort();

const offenders = [];
const summary = [];
for (const key of plugins) {
  const pluginDir = join(root, "plugins", key);
  const packages = new Map();
  for (const file of await bundledFiles(pluginDir)) {
    const packageRoot = packageRootOf(file);
    if (packageRoot === undefined || packages.has(packageRoot)) continue;
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    packages.set(packageRoot, {
      name: String(manifest.name),
      version: String(manifest.version),
      license: typeof manifest.license === "string" ? manifest.license : "(none declared)",
    });
  }
  for (const found of packages.values()) {
    const own =
      found.name.startsWith(SKILLCDN_PACKAGES) && found.license.trim() === SKILLCDN_LICENSE;
    if (!own && !allowed(found.license)) {
      offenders.push(`${key} bundles ${found.name}@${found.version}: ${found.license}`);
    }
  }
  const names = [...packages.values()].map((found) => `${found.name}@${found.version}`).sort();
  summary.push(
    `${key} bundles ${names.length} package${names.length === 1 ? "" : "s"} (${names.join(", ")})`,
  );
}

if (offenders.length > 0) {
  process.stderr.write("a plugin bundles a package under a license that is not allowed to ship:\n");
  for (const line of offenders) process.stderr.write(`- ${line}\n`);
  process.exit(1);
}
process.stdout.write(`licenses: ${summary.join("; ")}; all under allowed licenses\n`);
