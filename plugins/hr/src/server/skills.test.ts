// What the skills and the README name of the plugin is what the plugin takes: a command that exists,
// its flags, the words of an enum. An agent runs these lines as they are written, and `console-plugin
// check` reads a skill's format and never its commands. What a line means is still read by hand.
import { readdirSync, readFileSync } from "node:fs";
import type { ArgDescription } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

const package_ = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, package_), "utf8");

const skills = readdirSync(new URL("skills/", package_)).map((name) => `skills/${name}/SKILL.md`);
const documents = [...skills, "SKILLCDN.md", "README.md"];

/** The words of `console plugin <key>` that are the console's and not this plugin's. */
const THE_CONSOLES = new Set([
  "<command>",
  "capabilities",
  "disable",
  "enable",
  "grant",
  "help",
  "records",
  "revoke",
  "secret",
  "settings",
  "skill",
  "skills",
]);
/** The flags the command keeps for itself, wherever they stand. */
const ITS_OWN_FLAGS = new Set(["account", "file", "json", "project", "run", "url"]);

const operations = new Map<string, { readonly args: Readonly<Record<string, ArgDescription>> }>(
  Object.entries({ ...plugin.commands, ...plugin.queries }),
);

function linesIn(text: string): string[] {
  return [...text.matchAll(/`console plugin hr ([^`]*)`/g)].map(
    (match) => match[1]?.replaceAll("\\|", "|") ?? "",
  );
}

/** What a line names that the plugin does not take. */
function faultsOf(line: string): string[] {
  const [name = ""] = line.split(/\s+/);
  if (THE_CONSOLES.has(name)) {
    return [];
  }
  const operation = operations.get(name);
  if (operation === undefined) {
    return [`no command or query ${name}`];
  }
  const faults: string[] = [];
  for (const match of line.matchAll(/--([a-z][a-z-]*)(?:[ =]([^\s[\]]+))?/g)) {
    const flag = match[1] ?? "";
    if (ITS_OWN_FLAGS.has(flag)) {
      continue;
    }
    const arg = operation.args[flag];
    if (arg === undefined) {
      faults.push(`${name} has no --${flag}`);
      continue;
    }
    const words = (match[2] ?? "").split("|");
    if (arg.type === "enum" && !words.some((word) => word.startsWith("<"))) {
      for (const word of words) {
        if (!(arg.options ?? []).includes(word)) {
          faults.push(`--${flag} of ${name} takes no ${word}`);
        }
      }
    }
  }
  return faults;
}

describe("what the documents name", () => {
  it.each(documents)("%s names only what the plugin takes", (path) => {
    expect(linesIn(read(path)).flatMap(faultsOf)).toEqual([]);
  });

  it("finds the lines it holds", () => {
    expect(linesIn(read("skills/hr/SKILL.md")).length).toBeGreaterThan(10);
    expect(faultsOf("request 2026-01-01 --nothing")).toEqual(["request has no --nothing"]);
    expect(faultsOf("adjust alice --kind gift")).toEqual(["--kind of adjust takes no gift"]);
    expect(faultsOf("nothing")).toEqual(["no command or query nothing"]);
  });

  it("leaves no command or query to the help alone", () => {
    const named = new Set(
      skills.flatMap((path) => linesIn(read(path))).map((line) => line.split(/\s+/)[0]),
    );
    expect([...operations.keys()].filter((name) => !named.has(name))).toEqual([]);
  });
});

describe("what an agent reads first", () => {
  it("keeps every about to a line short enough to read for each of them", () => {
    const long = [...operations].filter(
      ([, operation]) => ((operation as { about?: string }).about ?? "").length > 90,
    );
    expect(long.map(([name]) => name)).toEqual([]);
  });
});
