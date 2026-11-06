// Each plugin is versioned on its own and declares the consoles it runs on (ADR-0006). Part of
// `pnpm check`: the catalog of pnpm-workspace.yaml and the lockfile agree on one @skillcdn/console;
// a published plugin's version is a semver and no changeset asks a major while its major is 0;
// and where a manifest declares `console`, a semver range in the shape `requires` has, the
// catalog's console satisfies it. Reads the catalog, the lockfile, the plugins' manifests and
// the pending changesets; no network. A private plugin is never versioned, but its range is read.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const CONSOLE = "@skillcdn/console";
const SCOPE = "@skillcdn/console-plugin-";
const RANK = { patch: 1, minor: 2, major: 3 };

const read = (file) => readFileSync(path.join(root, file), "utf8");
const problems = [];

/** The three numbers of a version, or undefined where it is not one. */
function versionOf(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim());
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Whether a version satisfies a range: comparator sets joined by `||`, each a run of `>=`, `>`,
 * `<=`, `<`, `=`, `^`, `~` or a bare version, and `*`; the subset `requires` is written in.
 * Throws on anything else, so that a range nobody can read is a problem, not a pass.
 */
function satisfies(version, range) {
  return String(range)
    .split("||")
    .some((set) =>
      set
        .trim()
        .split(/\s+/)
        .filter((part) => part.length > 0)
        .every((part) => comparator(version, part)),
    );
}

function comparator(version, part) {
  if (part === "*") {
    return true;
  }
  const match = /^(>=|<=|>|<|=|\^|~)?v?(\d+)\.(\d+)\.(\d+)$/.exec(part);
  if (match === null) {
    throw new Error(`"${part}" is not a comparator this check reads`);
  }
  const base = [Number(match[2]), Number(match[3]), Number(match[4])];
  const at = compare(version, base);
  switch (match[1] ?? "=") {
    case ">=":
      return at >= 0;
    case ">":
      return at > 0;
    case "<=":
      return at <= 0;
    case "<":
      return at < 0;
    case "=":
      return at === 0;
    case "~":
      return at >= 0 && compare(version, [base[0], base[1] + 1, 0]) < 0;
    default: {
      // ^: up to the next number that is not zero, as the registry's tools read it.
      const upper =
        base[0] > 0 ? [base[0] + 1, 0, 0] : base[1] > 0 ? [0, base[1] + 1, 0] : [0, 0, base[2] + 1];
      return at >= 0 && compare(version, upper) < 0;
    }
  }
}

// 1. The catalog's range of the console.
const catalogRange = /^ {2}"?@skillcdn\/console"?:\s*(\S+)\s*$/m.exec(
  read("pnpm-workspace.yaml"),
)?.[1];
if (catalogRange === undefined) {
  problems.push(`pnpm-workspace.yaml: the catalog does not name ${CONSOLE} at a version`);
}

// 2. The lockfile: one version of the console, inside that range.
const resolved = [
  ...new Set(
    [...read("pnpm-lock.yaml").matchAll(/^ {2}'?@skillcdn\/console@(\d+\.\d+\.\d+)/gm)].map(
      (match) => match[1],
    ),
  ),
];
if (resolved.length === 0) {
  problems.push(`pnpm-lock.yaml: resolves no ${CONSOLE}; run pnpm install`);
} else if (resolved.length > 1) {
  problems.push(
    `pnpm-lock.yaml: resolves ${CONSOLE} to ${resolved.join(", ")}; every plugin takes one version, from the catalog`,
  );
}
const consoleVersion = resolved.length === 1 ? versionOf(resolved[0]) : undefined;
if (consoleVersion !== undefined && catalogRange !== undefined) {
  try {
    if (!satisfies(consoleVersion, catalogRange)) {
      problems.push(
        `pnpm-lock.yaml: resolves ${CONSOLE} ${resolved[0]}, outside the catalog's ${catalogRange}; run pnpm install after moving the catalog`,
      );
    }
  } catch (error) {
    problems.push(`pnpm-workspace.yaml: the catalog's ${catalogRange}: ${error.message}`);
  }
}

// 3. The pending changesets: the highest bump each plugin is asked.
const pending = new Map();
for (const name of readdirSync(path.join(root, ".changeset"))) {
  if (!name.endsWith(".md") || name === "README.md") {
    continue;
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(`.changeset/${name}`));
  if (front === null) {
    problems.push(`.changeset/${name}: has no front-matter`);
    continue;
  }
  for (const match of front[1].matchAll(
    /^"?(@skillcdn\/console-plugin-[a-z0-9-]+)"?:\s*(major|minor|patch)\s*$/gm,
  )) {
    const [, pkg, bump] = match;
    const current = pending.get(pkg);
    if (current === undefined || RANK[bump] > RANK[current.bump]) {
      pending.set(pkg, { bump, file: name });
    }
  }
}

// 4. Each plugin: its version, the bump asked of it, and the consoles it declares.
const report = [];
const plugins = readdirSync(path.join(root, "plugins"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const key of plugins) {
  const file = `plugins/${key}/package.json`;
  if (!existsSync(path.join(root, file))) {
    continue;
  }
  const pkg = JSON.parse(read(file));
  const name = typeof pkg.name === "string" ? pkg.name : `${SCOPE}${key}`;
  const version = versionOf(pkg.version);
  const asked = pending.get(name);
  const words = [pkg.private === true ? `${key} private` : `${key} ${String(pkg.version)}`];

  if (pkg.private !== true) {
    // Never versioned while private (changesets leave a private package alone); held once published.
    if (version === undefined) {
      problems.push(`${file}: the version "${String(pkg.version)}" is not a semver`);
    } else if (version[0] === 0 && asked?.bump === "major") {
      problems.push(
        `.changeset/${asked.file}: asks a major of ${name}, whose major is 0; a breaking change is a minor until the plugin is declared stable, which waits for the console's 1.0`,
      );
    }
  }

  const manifestFile = `plugins/${key}/console-plugin.json`;
  if (existsSync(path.join(root, manifestFile))) {
    const manifest = JSON.parse(read(manifestFile));
    if (manifest.console === undefined) {
      words.push("no console range declared yet");
    } else if (typeof manifest.console !== "string") {
      problems.push(`${manifestFile}: "console" is a semver range as a string`);
    } else if (consoleVersion !== undefined) {
      try {
        if (!satisfies(consoleVersion, manifest.console)) {
          problems.push(
            `${manifestFile}: declares console ${manifest.console}, which the catalog's ${CONSOLE} ${resolved[0]} does not satisfy; every plugin is built against a console it declares`,
          );
        }
        words.push(`console ${manifest.console}`);
      } catch (error) {
        problems.push(`${manifestFile}: "console" ${manifest.console}: ${error.message}`);
      }
    }
  }
  report.push(words.join(", "));
}

if (problems.length > 0) {
  process.stderr.write(`versions: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}
process.stdout.write(
  `versions: ${CONSOLE} ${resolved.join("")} from the catalog's ${catalogRange}; plugins: ${report.join("; ")}\n`,
);
