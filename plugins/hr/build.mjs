// Builds the plugin as the console installs it: the server module, one ESM file with everything
// it runs bundled in; the web bundle, self-contained, with what a page imports when it is opened
// split off beside it, so that a widget does not carry the editor; and its stylesheet, with what it
// imports pulled in. The tests build the same way before checking the package.
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** Builds the plugin whose root is `root` into its `dist/`. */
export async function buildPlugin(root) {
  // The split files are named by what they hold, so that the last build's would stay behind.
  rmSync(join(root, "dist/web"), { recursive: true, force: true });
  await build({
    entryPoints: [join(root, "src/server/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile: join(root, "dist/server/index.js"),
    logLevel: "warning",
  });
  await build({
    entryPoints: [join(root, "src/web/index.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    splitting: true,
    outdir: join(root, "dist/web"),
    chunkNames: "chunks/[name]-[hash]",
    minify: true,
    logLevel: "warning",
  });
  await build({
    entryPoints: [join(root, "src/web/index.css")],
    bundle: true,
    outfile: join(root, "dist/web/index.css"),
    logLevel: "warning",
  });
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === here) {
  await buildPlugin(dirname(here));
}
