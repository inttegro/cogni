import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = path.join(root, "dist");
const shared = path.join(dist, "shared");

await rm(dist, { recursive: true, force: true });
await mkdir(shared, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    devtools: "src/devtools.ts",
    panel: "src/panel.ts",
  },
  outdir: shared,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome121", "firefox121"],
  minify: false,
  sourcemap: true,
  legalComments: "none",
  loader: { ".woff2": "dataurl" },
});
await cp(path.join(root, "static"), shared, { recursive: true });
await cp(
  path.resolve(root, "../../packages/devtools/INTER-LICENSE.txt"),
  path.join(shared, "INTER-LICENSE.txt"),
);

for (const browser of ["chromium", "firefox"]) {
  const destination = path.join(dist, browser);
  await cp(shared, destination, { recursive: true });
  await writeFile(
    path.join(destination, "manifest.json"),
    `${JSON.stringify(manifest(browser), null, 2)}\n`,
  );
}

await rm(shared, { recursive: true, force: true });
console.log("Built Cogni DevTools for Chromium and Firefox.");

function manifest(browser) {
  const base = {
    manifest_version: 3,
    name: "Cogni DevTools",
    version: "0.1.0",
    description: "Inspect predictive loading decisions, work, and reuse.",
    devtools_page: "devtools.html",
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content.js"],
        run_at: "document_start",
      },
    ],
  };
  if (browser === "chromium") {
    return {
      ...base,
      minimum_chrome_version: "121",
      background: { service_worker: "background.js" },
    };
  }
  return {
    ...base,
    browser_specific_settings: {
      gecko: {
        id: "cogni-devtools@inttegro.com",
        strict_min_version: "142.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    background: { scripts: ["background.js"] },
  };
}
