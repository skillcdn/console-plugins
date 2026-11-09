// What only this repository knows of its plugins, beyond what `console-plugin check` holds a
// plugin to and `skillcdn check` holds the skills to (docs/guide/conventions.md):
//   1. every directory under plugins/ is a complete plugin: the manifest, the package, the README,
//      the skills with their manifest, the server module, the tests and the build;
//   2. the manifest parses as the console parses it, its key is its directory's, its pluginApi
//      the one the installed console serves, and every word for people is in every language the
//      repository speaks (en and ko);
//   3. the package is @skillcdn/console-plugin-<key>, MIT, ESM, with no runtime dependencies
//      (everything it imports is bundled), the shared tools taken from the catalog, `files` that
//      ship what runs, the scripts every plugin has, and its repository directory;
//   4. the skills' manifest and every skill carry a Korean translation, and name this plugin's
//      commands and the console's own, never another's;
//   5. the stylesheet's classes carry the plugin's prefix, pl-<key>-, and it writes no colour of
//      its own: every colour is a console token or comes with one of its classes (PRODUCT.md);
//   6. every link a Markdown file of the repository makes to a file of the repository resolves;
//   7. every plugin is listed in the root README's table and in the roadmap.
// Dependency-free but for the console's own manifest parser, which the root installs. Part of
// `pnpm check`. A changed meaning is not caught here: a change to a plugin re-reads its README
// and its skills by hand (AGENTS.md, documentation protocol).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { CURRENT_PLUGIN_API, parsePluginManifest } from "@skillcdn/console/plugin";

const root = path.resolve(import.meta.dirname, "..");
/** The languages every word for people is written in (docs/adr/0004). */
const LANGUAGES = ["en", "ko"];
const SCOPE = "@skillcdn/console-plugin-";
const SHIPPED = ["dist", "skills", "SKILLCDN.md", "console-plugin.json"];
const SCRIPTS = ["build", "typecheck", "test", "check", "clean", "prepack", "postpack"];
const REQUIRED_FILES = [
  "console-plugin.json",
  "package.json",
  "README.md",
  "SKILLCDN.md",
  "build.mjs",
  "tsconfig.json",
  "src/server/index.ts",
  "src/server/index.test.ts",
  "src/check.test.ts",
];

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const read = (file) => readFileSync(path.join(root, file), "utf8");
const exists = (file) => existsSync(path.join(root, file));
const isDirectory = (file) => exists(file) && statSync(path.join(root, file)).isDirectory();
const readJson = (file) => {
  try {
    return JSON.parse(read(file));
  } catch (error) {
    fail(file, `is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

/** The front-matter as a flat map of its top-level scalar keys, and its raw lines for deeper looks. */
function frontMatter(file, text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (match === null) {
    fail(file, "has no front-matter");
    return { scalars: {}, lines: [] };
  }
  const scalars = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const key = /^([a-z]+): (.*)$/.exec(line);
    if (key !== null) {
      scalars[key[1]] = key[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return { scalars, lines };
}

/** True when `lines` hold `path` as nested YAML keys, each indented two spaces deeper than the last. */
function hasNestedKey(lines, keyPath) {
  let depth = 0;
  let index = 0;
  for (const key of keyPath) {
    const indent = " ".repeat(depth * 2);
    const pattern = new RegExp(`^${indent}${key}:`);
    let found = -1;
    for (let at = index; at < lines.length; at += 1) {
      const line = lines[at];
      if (depth > 0 && line.length > 0 && !line.startsWith(" ".repeat(depth * 2))) {
        break;
      }
      if (pattern.test(line)) {
        found = at;
        break;
      }
    }
    if (found === -1) {
      return false;
    }
    index = found + 1;
    depth += 1;
  }
  return true;
}

/** Every localized map in a manifest, as `[path, map]`: an object whose keys are language tags and whose values are strings. */
function localizedMaps(value, at = "") {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => localizedMaps(item, `${at}[${index}]`));
  }
  const entries = Object.entries(value);
  if (
    entries.length > 0 &&
    entries.every(
      ([key, item]) => /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(key) && typeof item === "string",
    ) &&
    "en" in value
  ) {
    return [[at, value]];
  }
  return entries.flatMap(([key, item]) =>
    localizedMaps(item, at.length === 0 ? key : `${at}.${key}`),
  );
}

/** A class selector: a dot not after a digit or another dot (0.5em is a number), then a name. */
const CLASS_SELECTOR = /(?<![\d.])\.(-?[A-Za-z_][\w-]*)/g;
function classesIn(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, '""');
  const found = new Set();
  for (const match of withoutComments.matchAll(CLASS_SELECTOR)) {
    if (match[1] !== undefined && !/^\d/.test(match[1])) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/** A colour written out, as a hex value or a colour function, where a token would give it. */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;

/** The lines of a stylesheet that write a colour out, by number, comments aside. */
function colourLines(css) {
  const lines = css
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .split("\n");
  return lines.flatMap((line, index) => (COLOUR_LITERAL.test(line) ? [index + 1] : []));
}

function* walk(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* walk(file);
    } else {
      yield file;
    }
  }
}

// The catalog of pnpm-workspace.yaml: the tools every plugin takes at one version.
const catalog = new Set();
{
  const lines = read("pnpm-workspace.yaml").split(/\r?\n/);
  let inCatalog = false;
  for (const line of lines) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog) {
      const entry = /^ {2}"?([^":]+)"?: /.exec(line);
      if (entry !== null) {
        catalog.add(entry[1]);
      } else if (!/^\s*(#.*)?$/.test(line)) {
        inCatalog = false;
      }
    }
  }
  if (!catalog.has("@skillcdn/console")) {
    fail(
      "pnpm-workspace.yaml",
      "the catalog does not name @skillcdn/console, the one version every plugin is built against",
    );
  }
}

// The commands the console's command line has, from the help the installed package ships.
const commands = new Set(["help", "version"]);
{
  const help = read("node_modules/@skillcdn/console/src/cli/help.ts");
  for (const match of help.matchAll(/^ {2}"?([a-z][a-z-]*)"?: \{$/gm)) {
    commands.add(match[1]);
  }
  if (commands.size < 10) {
    fail("node_modules/@skillcdn/console/src/cli/help.ts", "the table of commands was not found");
  }
}

const readme = read("README.md");
const roadmap = read("docs/roadmap.md");

const plugins = readdirSync(path.join(root, "plugins"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (plugins.length === 0) {
  fail("plugins", "holds no plugin");
}

for (const key of plugins) {
  const dir = `plugins/${key}`;
  for (const file of REQUIRED_FILES) {
    if (!exists(`${dir}/${file}`)) {
      fail(`${dir}/${file}`, "is missing");
    }
  }

  // 2. The manifest.
  const manifestJson = exists(`${dir}/console-plugin.json`)
    ? readJson(`${dir}/console-plugin.json`)
    : undefined;
  if (manifestJson !== undefined) {
    const parsed = parsePluginManifest(manifestJson);
    if (!parsed.ok) {
      for (const problem of parsed.problems) {
        fail(`${dir}/console-plugin.json`, problem);
      }
    } else {
      const manifest = parsed.manifest;
      if (manifest.key !== key) {
        fail(
          `${dir}/console-plugin.json`,
          `has the key ${manifest.key}, not ${key} as its directory is`,
        );
      }
      if (manifest.pluginApi !== CURRENT_PLUGIN_API) {
        fail(
          `${dir}/console-plugin.json`,
          `is written against pluginApi ${manifest.pluginApi}; the installed console serves ${CURRENT_PLUGIN_API}`,
        );
      }
      if (manifest.server !== "dist/server/index.js") {
        fail(
          `${dir}/console-plugin.json`,
          `names ${manifest.server} as its server module; every plugin here builds to dist/server/index.js`,
        );
      }
      if (manifest.skills !== "skills") {
        fail(
          `${dir}/console-plugin.json`,
          "keeps its skills elsewhere than skills/; every plugin here ships them there",
        );
      }
      for (const [at, map] of localizedMaps(manifestJson)) {
        const missing = LANGUAGES.filter(
          (language) => typeof map[language] !== "string" || map[language].length === 0,
        );
        if (missing.length > 0) {
          fail(
            `${dir}/console-plugin.json`,
            `${at} lacks ${missing.join(", ")}: every word for people is in ${LANGUAGES.join(" and ")}`,
          );
        }
      }
    }
  }

  // 3. The package.
  const pkg = exists(`${dir}/package.json`) ? readJson(`${dir}/package.json`) : undefined;
  if (pkg !== undefined) {
    const file = `${dir}/package.json`;
    if (pkg.name !== `${SCOPE}${key}`) {
      fail(file, `is named ${pkg.name}; a plugin here is ${SCOPE}<key>`);
    }
    if (pkg.license !== "MIT") {
      fail(file, `is under ${pkg.license}; the plugins are MIT`);
    }
    if (pkg.type !== "module") {
      fail(file, "is not an ES module");
    }
    if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version))) {
      fail(file, `has the version ${pkg.version}, which is not major.minor.patch`);
    }
    if (pkg.private !== true && pkg.publishConfig?.access !== "public") {
      fail(
        file,
        "is published without publishConfig.access set to public, which a scoped name needs",
      );
    }
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      if (pkg[field] !== undefined && Object.keys(pkg[field]).length > 0) {
        fail(
          file,
          `declares ${field}; everything a plugin imports is bundled, so it is a devDependency`,
        );
      }
    }
    const dev = pkg.devDependencies ?? {};
    if (dev["@skillcdn/console"] !== "catalog:") {
      fail(file, 'takes @skillcdn/console otherwise than from the catalog ("catalog:")');
    }
    for (const [name, spec] of Object.entries(dev)) {
      if (catalog.has(name) && spec !== "catalog:") {
        fail(file, `pins ${name} to ${spec}; the catalog has it, so it is "catalog:"`);
      }
    }
    for (const shipped of SHIPPED) {
      if (!Array.isArray(pkg.files) || !pkg.files.includes(shipped)) {
        fail(file, `leaves ${shipped} out of files; the package ships what runs`);
      }
    }
    for (const script of SCRIPTS) {
      if (typeof pkg.scripts?.[script] !== "string") {
        fail(file, `has no ${script} script`);
      }
    }
    if (pkg.repository?.directory !== dir) {
      fail(
        file,
        `names ${pkg.repository?.directory ?? "no directory"} as its repository directory, not ${dir}`,
      );
    }
  }

  // 4. The skills and their manifest.
  if (exists(`${dir}/SKILLCDN.md`)) {
    const text = read(`${dir}/SKILLCDN.md`);
    const { scalars, lines } = frontMatter(`${dir}/SKILLCDN.md`, text);
    if (scalars.license !== "MIT") {
      fail(`${dir}/SKILLCDN.md`, "does not say license: MIT");
    }
    for (const language of LANGUAGES.filter((tag) => tag !== "en")) {
      if (!hasNestedKey(lines, ["translations", language])) {
        fail(`${dir}/SKILLCDN.md`, `has no translations.${language}`);
      }
    }
    if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n+# /.test(text)) {
      fail(`${dir}/SKILLCDN.md`, "does not start its body with a level-one heading");
    }
  }
  const skillDirs = isDirectory(`${dir}/skills`)
    ? readdirSync(path.join(root, dir, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  if (skillDirs.length === 0) {
    fail(
      `${dir}/skills`,
      "holds no skill; a plugin ships at least one, for the agents that work it",
    );
  }
  const skillFiles = skillDirs.map((name) => `${dir}/skills/${name}/SKILL.md`);
  for (const file of skillFiles) {
    if (!exists(file)) {
      fail(file, "is missing: a skill directory holds a SKILL.md");
      continue;
    }
    const text = read(file);
    const { scalars, lines } = frontMatter(file, text);
    const directory = path.basename(path.dirname(file));
    if (scalars.name !== directory) {
      fail(file, `is named ${scalars.name ?? "(nothing)"}, not ${directory} as its directory is`);
    }
    const description = scalars.description ?? "";
    if (description.length === 0 || description.length > 1024) {
      fail(file, `has a description of ${description.length} characters; 1 to 1024 are allowed`);
    }
    for (const language of LANGUAGES.filter((tag) => tag !== "en")) {
      if (!hasNestedKey(lines, ["skillcdn", "translations", language])) {
        fail(file, `has no skillcdn.translations.${language}`);
      }
    }
    if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n+# /.test(text)) {
      fail(file, "does not start its body with a level-one heading");
    }
  }
  for (const file of [`${dir}/SKILLCDN.md`, `${dir}/README.md`, ...skillFiles].filter(exists)) {
    const text = read(file);
    for (const match of text.matchAll(/`console plugin ([a-z][a-z0-9-]*)/g)) {
      if (match[1] !== key && match[1] !== "<key>") {
        fail(
          file,
          `names \`console plugin ${match[1]}\`, another plugin's command; this plugin is ${key}`,
        );
      }
    }
    for (const match of text.matchAll(/`console ([a-z][a-z-]*)/g)) {
      if (match[1] !== "plugin" && !commands.has(match[1])) {
        fail(file, `names \`console ${match[1]}\`, which is not a command of the command line`);
      }
    }
  }

  // 5. The stylesheet's classes.
  if (isDirectory(`${dir}/src/web`)) {
    for (const file of walk(`${dir}/src/web`)) {
      if (!file.endsWith(".css")) {
        continue;
      }
      const css = read(file);
      for (const className of classesIn(css)) {
        if (!className.startsWith(`pl-${key}-`)) {
          fail(file, `styles .${className}; a plugin's classes begin with pl-${key}-`);
        }
      }
      for (const line of colourLines(css)) {
        fail(file, `writes a colour on line ${line}; take it from the console's tokens or classes`);
      }
    }
  }

  // 7. The catalogs.
  if (!readme.includes(`](${dir}/)`)) {
    fail("README.md", `does not list ${dir}/ in its table of plugins`);
  }
  if (!roadmap.includes(`\`${key}\``)) {
    fail("docs/roadmap.md", `does not name \`${key}\``);
  }
}

// 6. The links of every Markdown file to files of the repository.
const markdown = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SKILLCDN.md",
  ...walk("docs"),
  ...walk("plugins"),
].filter((file) => file.endsWith(".md") && exists(file));
let links = 0;
for (const file of markdown) {
  const text = read(file);
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/.test(target) || target.startsWith("#")) {
      continue;
    }
    links += 1;
    const bare = target.replace(/#.*$/, "");
    const resolved = bare.startsWith("/")
      ? path.join(root, bare)
      : path.join(root, path.dirname(file), bare);
    if (!existsSync(resolved)) {
      fail(file, `links to ${target}, which does not exist`);
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`plugins: ${errors.length} problem${errors.length === 1 ? "" : "s"}\n`);
  for (const error of errors) {
    process.stderr.write(`  ${error}\n`);
  }
  process.exit(1);
}
process.stdout.write(
  `plugins: ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} (${plugins.join(", ")}) in the shape this repository asks, speaking ${LANGUAGES.join(" and ")}, naming ${commands.size} commands of the command line; ${links} links in ${markdown.length} Markdown files resolve\n`,
);
