// The contract with other plugins (ADR-0010), held to the code: README.md, "The contract", names
// every event with its data, every call of the api and the option keys of the decisions, and each
// is what the module emits, answers and raises. A change here is a change to what other plugins
// read, and the changeset says so.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { api, commands, EVENTS, queries } from "./index.js";
import { OPTION_KEYS } from "./words.js";

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, "..", "..", "README.md"), "utf8");

/** The text of a section of README.md, from its heading to the next of the same level or above. */
function section(heading: string): string {
  const start = readme.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(`README.md has no section ${heading}`);
  }
  const level = heading.split(" ")[0] ?? "##";
  const rest = readme.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{2,${level.length}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/** The rows of the first table of a section, each as its cells. */
function rows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

/** The words in backticks of a cell, in order. */
function ticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}

describe("the contract", () => {
  it("names every event the module emits, with its data, in the order of the code", () => {
    const table = rows(section("### Events"));
    expect(table.map((row) => ticked(row[0] ?? "")[0])).toEqual(Object.keys(EVENTS));
    for (const row of table) {
      const kind = ticked(row[0] ?? "")[0] as keyof typeof EVENTS;
      expect(ticked(row[1] ?? ""), kind).toEqual([...EVENTS[kind]]);
    }
  });

  it("names every call of the api, each the command or the query it runs", () => {
    const table = rows(section("### Calls"));
    expect(table.map((row) => ticked(row[0] ?? "")[0])).toEqual(Object.keys(api));
    const operations = new Set([...Object.keys(commands), ...Object.keys(queries)]);
    for (const row of table) {
      const name = ticked(row[0] ?? "")[0] ?? "";
      const runs = ticked(row[3] ?? "")[0] ?? "";
      expect(runs, name).toBe(name);
      expect(operations.has(name), name).toBe(true);
    }
  });

  it("names the option keys every decision carries", () => {
    const text = section("### Decisions");
    expect(ticked(text.split("\n").find((line) => line.length > 0) ?? "").slice(0, 2)).toEqual(
      Object.values(OPTION_KEYS),
    );
  });

  it("emits nothing the contract does not name", () => {
    const sources = [
      "leave/commands.ts",
      "leave/hooks.ts",
      "leave/jobs.ts",
      "leave/leavers.ts",
      "announcements.ts",
    ].map((path) => readFileSync(join(here, path), "utf8"));
    for (const source of sources) {
      expect(source).not.toContain("ctx.events.emit(");
    }
  });
});
