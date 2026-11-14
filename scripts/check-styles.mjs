// Holds a plugin's pages to the console's parts (docs/adr/0013, docs/guide/conventions.md#pages):
//
//   1. every console class a plugin's web sources name (sc-...) is a class of a part in the
//      console's catalogue, node_modules/@skillcdn/console/src/styles/README.md, never a class of
//      one of the console's own pages, which may change in any release;
//   2. every token a stylesheet reads (var(--sc-...)) is one the console defines, in
//      node_modules/@skillcdn/console/src/styles/tokens.css, since a token misspelt reads as
//      nothing and the browser says nothing of it;
//   3. a rule of a plugin's stylesheet places: it lays out an element of the plugin's own, or
//      says where a part is and how much room it has, and gives nothing a look, but for the
//      classes the plugin's src/web/drawn.json still lists, a list that only gets shorter;
//   4. every class of a plugin's stylesheet is named by its sources, so that a rule nothing
//      names is deleted;
//   5. a script sets a style on an element only for a measure it computed, never a look.
//
// What it refuses is said with what to do instead, since whoever reads the refusal is about to
// write the next line. Part of `pnpm check`; `pnpm check:styles` runs it alone. With `--hook` it
// is what an agent's editor runs after a file is written (.claude/settings.json): it reads what
// was written from the standard input, says nothing unless that was a web source of a plugin,
// checks that plugin alone, and ends with 2 on a refusal, which is how such a hook hands its
// words back to the agent. A name a source builds from a stem (`sc-category-${hue}`,
// `pl-hr-kind-${kind}`) keeps every class under that stem named: the check reads names, not
// what the browser draws. It writes nothing: the lists are changed by hand.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const STYLES = "node_modules/@skillcdn/console/src/styles";
const CATALOGUE = `${STYLES}/README.md`;
const TOKENS = `${STYLES}/tokens.css`;
const DRAWN = "src/web/drawn.json";

const hook = process.argv.includes("--hook");
let only;
if (hook) {
  // What the editor wrote, as it says it: a file elsewhere is none of this check's.
  let written;
  try {
    written = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path;
  } catch {
    written = undefined;
  }
  const match =
    typeof written === "string"
      ? /(?:^|\/)plugins\/([a-z][a-z0-9-]*)\/src\/web\/.*\.(?:css|ts|json)$/.exec(
          written.split("\\").join("/"),
        )
      : null;
  if (match === null || /\.test\.ts$/.test(written)) {
    process.exit(0);
  }
  only = match[1];
}

const errors = [];
const fail = (file, message, instead) => errors.push({ file, message, instead });
const read = (file) => readFileSync(path.join(root, file), "utf8");
const exists = (file) => existsSync(path.join(root, file));

function* walk(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* walk(file);
    } else {
      yield file;
    }
  }
}

// The catalogue: a row per part, with the classes that are its own. `sc-button*` is `sc-button`
// and every `sc-button-...`; a name without the star is that class alone.
const parts = [];
{
  const text = read(CATALOGUE);
  const start = text.indexOf("## The catalogue");
  const end = text.indexOf("\n## ", start + 1);
  for (const line of text.slice(start, end === -1 ? undefined : end).split(/\r?\n/)) {
    const row = /^\| `([a-z][a-z0-9-]*)` \| ([^|]+) \|/.exec(line);
    if (row === null) {
      continue;
    }
    const names = [...row[2].matchAll(/`(sc-[a-z0-9-]+\*?)`/g)].map((found) => found[1]);
    parts.push({ part: row[1], names });
  }
  if (parts.length === 0) {
    fail(
      CATALOGUE,
      "lists no part",
      "Install the console again (pnpm install); its package ships the catalogue.",
    );
  }
}

/** The part a class is of, or undefined; a stem is a part's where a part has a class under it. */
function partOf(name, stem) {
  return parts.find(({ names }) =>
    names.some((pattern) => {
      const exact = !pattern.endsWith("*");
      const base = exact ? pattern : pattern.slice(0, -1);
      if (stem) {
        // `sc-category-` from `sc-category-${hue}`: some class of the part begins with it.
        return base.startsWith(name) || (!exact && name.startsWith(`${base}-`));
      }
      return exact ? name === base : name === base || name.startsWith(`${base}-`);
    }),
  );
}

// The tokens: every custom property the console's tokens set, on the root or on a class that
// carries a palette (a category's hue).
const tokens = new Set(
  [...read(TOKENS).matchAll(/(--sc-[a-z0-9-]+)\s*:/g)].map((found) => found[1]),
);

/** What a rule of a plugin's may say: how an element lays out what is in it, and where it is. */
const PLACES = new RegExp(
  `^(?:${[
    "display",
    "box-sizing",
    "grid(?:-[a-z-]+)?",
    "flex(?:-[a-z-]+)?",
    "gap",
    "row-gap",
    "column-gap",
    "order",
    "align-[a-z]+",
    "justify-[a-z]+",
    "place-[a-z]+",
    "padding(?:-[a-z-]+)?",
    "margin(?:-[a-z-]+)?",
    "(?:min-|max-)?(?:width|height|inline-size|block-size)",
    "aspect-ratio",
    "position",
    "inset(?:-[a-z-]+)?",
    "top",
    "right",
    "bottom",
    "left",
    "z-index",
    "transform",
    "overflow(?:-[a-z]+)?",
    "overscroll-behavior(?:-[a-z]+)?",
    "scroll-[a-z-]+",
    "scrollbar-gutter",
    "text-align",
    "vertical-align",
    "white-space",
    "word-break",
    "overflow-wrap",
    "text-overflow",
    "text-wrap",
    "hyphens",
    "-webkit-line-clamp",
    "line-clamp",
    "-webkit-box-orient",
    "columns",
    "column-(?:count|width|span|fill)",
    "break-[a-z]+",
    "container(?:-[a-z]+)?",
    "contain",
    "isolation",
    "object-fit",
    "object-position",
    "list-style(?:-[a-z]+)?",
    "table-layout",
    "border-collapse",
    "border-spacing",
    "counter-(?:reset|increment|set)",
    "content",
    "visibility",
    "pointer-events",
    "user-select",
    "touch-action",
    "cursor",
    "resize",
  ].join("|")})$`,
);

/** A look a script may not set on an element: what the stylesheet's parts say. */
const SCRIPT_LOOK =
  /\.style\.(?:color|background\w*|border\w*|outline\w*|font\w*|lineHeight|letterSpacing|textTransform|textDecoration\w*|boxShadow|opacity|filter|transition\w*|animation\w*)\s*=|\.style\.setProperty\(\s*["'`](?:color|background|border|outline|font|line-height|letter-spacing|text-transform|text-decoration|box-shadow|opacity|filter|transition|animation)/;

/** The rules of a stylesheet: each selector with its declarations, at-rules unwrapped. */
function rulesOf(css) {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (string) => string.replace(/[{};]/g, " "));
  const rules = [];
  let depth = 0;
  let from = 0;
  const skipping = [];
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === "{") {
      const prelude = text.slice(from, at).trim();
      const line = text.slice(0, at).split("\n").length;
      if (prelude.startsWith("@")) {
        // @media, @supports and @container hold rules; anything else is a block of its own.
        if (!/^@(?:media|supports|container|layer)\b/.test(prelude)) {
          skipping.push(depth);
          rules.push({ selector: prelude, declarations: [], line, at: true });
        }
        depth += 1;
        from = at + 1;
        continue;
      }
      const close = text.indexOf("}", at);
      if (skipping.length === 0) {
        const declarations = text
          .slice(at + 1, close)
          .split(";")
          .map((declaration) => declaration.trim())
          .filter((declaration) => declaration.includes(":"))
          .map((declaration) => {
            const colon = declaration.indexOf(":");
            return {
              property: declaration.slice(0, colon).trim().toLowerCase(),
              value: declaration.slice(colon + 1).trim(),
            };
          });
        rules.push({ selector: prelude, declarations, line, at: false });
      }
      at = close;
      from = close + 1;
    } else if (char === "}") {
      depth -= 1;
      if (skipping.at(-1) === depth) {
        skipping.pop();
      }
      from = at + 1;
    } else if (char === ";" && depth >= 0 && text.slice(from, at).trim().startsWith("@")) {
      from = at + 1;
    }
  }
  return rules;
}

/** The classes a selector names, and the last of each of its selectors: what the rule is about. */
function subjectsOf(selector) {
  return selector
    .split(",")
    .map((one) => [...one.matchAll(/(?<![\d.\w-])\.(-?[A-Za-z_][\w-]*)/g)].map((found) => found[1]))
    .filter((classes) => classes.length > 0)
    .map((classes) => ({ classes, subject: classes.at(-1) }));
}

const instead = {
  look: (key) =>
    `A look is a part of the console's. Find the part in ${CATALOGUE} (37 parts, each with what it is for) and put its class on the element beside the plugin's, whose rule keeps only where the part is. If no part does it, say which came closest and why, and propose the part to the console; never add the class to plugins/${key}/${DRAWN} to get past this.`,
  part: `Use a class of a part the catalogue lists (${CATALOGUE}). A class of one of the console's own pages may change or go in any release; if the page has a look no part gives, propose that part to the console.`,
  token: `Take the token's name from ${TOKENS}; a token the console does not define reads as nothing.`,
  dead: "Delete the rule, or name the class where the element is made: a rule nothing names draws nothing.",
  script:
    "Give the element a part's class, or a class of the plugin's that places it; a script sets a style only for a measure it computed, a width or a place.",
};

const plugins = readdirSync(path.join(root, "plugins"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && (only === undefined || entry.name === only))
  .map((entry) => entry.name)
  .filter((key) => exists(`plugins/${key}/src/web`));

let drawnCount = 0;
for (const key of plugins) {
  const dir = `plugins/${key}`;
  const web = [...walk(`${dir}/src/web`)];
  const shared = exists(`${dir}/src/shared`) ? [...walk(`${dir}/src/shared`)] : [];
  const sources = [...web, ...shared].filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const sheets = web.filter((file) => file.endsWith(".css"));

  // What the sources name, whole and as stems.
  const named = new Set();
  const stems = new Set();
  for (const file of sources) {
    const text = read(file);
    for (const found of text.matchAll(/(?<![\w-])(sc-[a-z0-9]+(?:-[a-z0-9]+)*)(-?)(\$\{)?/g)) {
      const stem = found[2] === "-" || found[3] !== undefined;
      const name = `${found[1]}${found[2]}`;
      if (partOf(name, stem) === undefined) {
        fail(
          file,
          `names ${name}${stem ? "..." : ""}, which is no part's class in the console's catalogue`,
          instead.part,
        );
      }
    }
    for (const found of text.matchAll(
      new RegExp(`(?<![\\w-])(pl-${key}-[a-z0-9-]*)(\\$\\{)?`, "g"),
    )) {
      if (found[2] !== undefined || found[1].endsWith("-")) {
        stems.add(found[1]);
      } else {
        named.add(found[1]);
      }
    }
    text.split("\n").forEach((line, index) => {
      if (SCRIPT_LOOK.test(line)) {
        fail(`${file}:${index + 1}`, "sets a look on an element from a script", instead.script);
      }
    });
  }
  const isNamed = (name) =>
    named.has(name) || [...stems].some((stem) => name.startsWith(stem) && name !== stem);

  // What still draws, by the plugin's own list.
  const drawnFile = `${dir}/${DRAWN}`;
  let drawn = [];
  if (exists(drawnFile)) {
    try {
      const parsed = JSON.parse(read(drawnFile));
      drawn = Array.isArray(parsed?.drawn) ? parsed.drawn : [];
      if (!Array.isArray(parsed?.drawn)) {
        fail(drawnFile, "has no list `drawn`", 'Write it as { "drawn": ["pl-<key>-...", ...] }.');
      }
    } catch (error) {
      fail(
        drawnFile,
        `is not JSON: ${error instanceof Error ? error.message : String(error)}`,
        "Write it as JSON.",
      );
    }
  }
  drawnCount += drawn.length;
  const listed = new Set(drawn);
  const drawing = new Map();
  const styled = new Map();

  for (const file of sheets) {
    for (const rule of rulesOf(read(file))) {
      if (rule.at) {
        fail(
          `${file}:${rule.line}`,
          `holds ${rule.selector.split(/\s/)[0]}, a look of the plugin's own`,
          instead.look(key),
        );
        continue;
      }
      const subjects = subjectsOf(rule.selector);
      for (const { classes } of subjects) {
        for (const name of classes) {
          if (!styled.has(name)) {
            styled.set(name, `${file}:${rule.line}`);
          }
        }
      }
      for (const { property, value } of rule.declarations) {
        for (const found of value.matchAll(/var\(\s*(--sc-[a-z0-9-]+)/g)) {
          if (!tokens.has(found[1])) {
            fail(
              `${file}:${rule.line}`,
              `reads ${found[1]}, which the console does not define`,
              instead.token,
            );
          }
        }
        if (PLACES.test(property)) {
          continue;
        }
        for (const { subject } of subjects) {
          const said = drawing.get(subject) ?? { line: rule.line, file, properties: new Set() };
          said.properties.add(property);
          drawing.set(subject, said);
        }
      }
    }
  }

  for (const [name, said] of drawing) {
    if (!listed.has(name)) {
      fail(
        `${said.file}:${said.line}`,
        `.${name} gives itself a look (${[...said.properties].slice(0, 4).join(", ")}${said.properties.size > 4 ? ", ..." : ""}); a class of the plugin's places a part of the console's and draws nothing`,
        instead.look(key),
      );
    }
  }
  for (const name of drawn) {
    if (!styled.has(name)) {
      fail(
        drawnFile,
        `lists .${name}, which the stylesheet does not have`,
        "Take it off the list.",
      );
    } else if (!drawing.has(name)) {
      fail(
        drawnFile,
        `lists .${name}, which draws nothing now`,
        "Take it off the list: the list only gets shorter.",
      );
    }
  }
  for (const [name, where] of styled) {
    if (name.startsWith(`pl-${key}-`) && !isNamed(name)) {
      fail(where, `styles .${name}, which no source of the plugin names`, instead.dead);
    }
  }
}

if (errors.length > 0) {
  const out = errors.map(
    ({ file, message, instead: what }) => `  ${file}: ${message}\n    Instead: ${what}`,
  );
  process.stderr.write(
    `styles: ${errors.length} problem${errors.length === 1 ? "" : "s"}\n${out.join("\n")}\n`,
  );
  process.exitCode = hook ? 2 : 1;
} else if (!hook) {
  process.stdout.write(
    `styles: ${plugins.length} plugins' pages built from the console's ${parts.length} parts and ${tokens.size} tokens; ${drawnCount} classes still draw a look of their own\n`,
  );
}
