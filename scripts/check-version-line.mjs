// The version of a published plugin is the console's line with a patch of its own (ADR-0005):
// its major and minor are those of the one @skillcdn/console every plugin is built against, as
// the catalog of pnpm-workspace.yaml declares it and the lockfile resolves it; lines are adopted
// in order, one `minor` changeset each, so a plugin one line behind is allowed while that
// changeset is pending; within a line every release is a `patch`. Part of `pnpm check`. Reads the catalog, the lockfile, the plugins' manifests
// and the pending changesets; no network. A private plugin is never versioned and is not held to the line.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const CONSOLE = "@skillcdn/console";
const SCOPE = "@skillcdn/console-plugin-";
const RANK = { patch: 1, minor: 2, major: 3 };

const read = (file) => readFileSync(path.join(root, file), "utf8");
const problems = [];

/** `major.minor` of a version, or of the lowest version a range admits (`^0.4.3`). */
function lineOf(spec) {
  const match = /(\d+)\.(\d+)\.\d+/.exec(spec);
  return match === null ? undefined : `${match[1]}.${match[2]}`;
}

function partsOf(line) {
  const [major, minor] = line.split(".").map(Number);
  return { major, minor };
}

// 1. The line: what the catalog declares of the console.
const catalogRange = /^ {2}"?@skillcdn\/console"?:\s*(\S+)\s*$/m.exec(
  read("pnpm-workspace.yaml"),
)?.[1];
const line = catalogRange === undefined ? undefined : lineOf(catalogRange);
if (line === undefined) {
  problems.push(`pnpm-workspace.yaml: the catalog does not name ${CONSOLE} at a version`);
}

// 2. The lockfile: one version of the console, on that line.
const resolved = new Set(
  [...read("pnpm-lock.yaml").matchAll(/^ {2}'?@skillcdn\/console@(\d+\.\d+\.\d+)/gm)].map(
    (match) => match[1],
  ),
);
if (resolved.size === 0) {
  problems.push(`pnpm-lock.yaml: resolves no ${CONSOLE}; run pnpm install`);
} else if (resolved.size > 1) {
  problems.push(
    `pnpm-lock.yaml: resolves ${CONSOLE} to ${[...resolved].join(", ")}; every plugin takes one version, from the catalog`,
  );
}
for (const version of resolved) {
  if (line !== undefined && lineOf(version) !== line) {
    problems.push(
      `pnpm-lock.yaml: resolves ${CONSOLE} ${version}, off the catalog's line ${line}; run pnpm install after moving the catalog`,
    );
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

// 4. Each plugin's version against the line.
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
  const version = String(pkg.version);
  const name = typeof pkg.name === "string" ? pkg.name : `${SCOPE}${key}`;
  const asked = pending.get(name);
  if (pkg.private === true) {
    // Never versioned (changesets leave a private package alone), whatever number the template wrote.
    report.push(`${key} private`);
    continue;
  }
  if (line === undefined) {
    continue;
  }
  if (asked?.bump === "major") {
    problems.push(
      `.changeset/${asked.file}: asks a major of ${name}; never while the major is 0, and a plugin's 1.0.0 waits for the console's`,
    );
  }
  const own = lineOf(version);
  const wanted = partsOf(line);
  const has = own === undefined ? undefined : partsOf(own);
  if (own === line) {
    if (asked?.bump === "minor") {
      problems.push(
        `.changeset/${asked.file}: asks a minor of ${name}, which is on the console's line ${line} already; within a line every release is a patch`,
      );
    }
    report.push(`${key} ${version}`);
  } else if (has !== undefined && has.major === wanted.major && has.minor === wanted.minor - 1) {
    if (asked?.bump !== "minor") {
      problems.push(
        `${file}: is ${version}, one line behind the console's ${line}, with no minor changeset pending to move it`,
      );
    }
    report.push(`${key} ${version}, moving to ${line}.0`);
  } else {
    problems.push(
      `${file}: is ${version}, not on the console's line ${line}; a published plugin is ${line}.<patch>, or the previous line's .0 beside a minor changeset`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `version line: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`,
  );
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.exit(1);
}
process.stdout.write(
  `version line: ${CONSOLE} ${[...resolved].join("")} on the line ${line}; plugins: ${report.join(", ")}\n`,
);
