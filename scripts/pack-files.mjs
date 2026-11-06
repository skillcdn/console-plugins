// What a published plugin carries beside its code while every file has one source in the
// repository: the license. `prepack` copies it next to what is packed, and `postpack` takes the
// copy out again; .gitignore keeps it out of git meanwhile. Package scripts run in the plugin's
// directory, two levels below the root.
import { cpSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

/** What is copied from the repository's root, and where it lands in the package. */
const COPIES = [["LICENSE.md", "LICENSE.md"]];

const action = process.argv[2];
if (action === "copy") {
  for (const [from, to] of COPIES) {
    cpSync(resolve("..", "..", from), to);
  }
} else if (action === "remove") {
  for (const [, made] of COPIES) {
    rmSync(made, { force: true });
  }
} else {
  process.stderr.write("usage: node ../../scripts/pack-files.mjs copy|remove\n");
  process.exit(64);
}
