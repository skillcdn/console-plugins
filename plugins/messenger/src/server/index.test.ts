// The module as the console loads it, held to its design: every command, query, endpoint, hook
// and job the default export defines is a row of README.md's table, each needs a capability the
// manifest declares, and the manifest asks nothing the module does not use. The rows themselves
// are proven in the test files beside this one.
import { readFileSync } from "node:fs";
import { describePlugin, descriptionProblems, parsePluginManifest } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

const package_ = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, package_), "utf8");
const readme = read("README.md");
const design = readme.slice(readme.indexOf("## The design"), readme.indexOf("## Where things are"));
const parsed = parsePluginManifest(JSON.parse(read("console-plugin.json")));

describe("the module", () => {
  it("is what the manifest declares, as the console reads both", () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(descriptionProblems(describePlugin(plugin), parsed.manifest)).toEqual([]);
  });

  it("names in the design every command, query, endpoint, hook and job it defines", () => {
    const named = [
      ...Object.keys(plugin.commands),
      ...Object.keys(plugin.queries),
      ...Object.keys(plugin.endpoints),
      ...Object.keys(plugin.jobs),
      ...Object.keys(plugin.on).filter((hook) => hook.startsWith("console:")),
    ];
    expect(named.filter((name) => !design.includes(`\`${name}\``))).toEqual([]);
    expect(design).toContain("`plugin:hr:leave-requested`");
  });

  it("hears every leave event of HR's contract, and the lifecycle of HR", () => {
    expect(Object.keys(plugin.on).sort()).toEqual(
      [
        "console:person.deactivated",
        "console:person.email_changed",
        "console:person.reactivated",
        "console:plugin.disabled",
        "console:plugin.enabled",
        "console:plugin.upgraded",
        "plugin:hr:leave-advanced",
        "plugin:hr:leave-approved",
        "plugin:hr:leave-cancelled",
        "plugin:hr:leave-cancelling",
        "plugin:hr:leave-kept",
        "plugin:hr:leave-rejected",
        "plugin:hr:leave-requested",
        "plugin:hr:leave-returned",
      ].sort(),
    );
  });

  it("asks nothing of the console the design has no row for", () => {
    if (!parsed.ok) {
      return;
    }
    const asked = [...parsed.manifest.capabilities, ...parsed.manifest.optionalCapabilities];
    expect(asked.filter((capability) => !design.includes(`\`${capability}\``))).toEqual([]);
    expect(parsed.manifest.board.needs).toBe("none");
    expect(Object.keys(parsed.manifest.roles)).toEqual(["messenger"]);
    expect(parsed.manifest.defaultRole).toBe(undefined);
  });
});
