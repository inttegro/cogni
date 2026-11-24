import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const local = process.argv.includes("--local");
const configs = [
  "packages/client/api-extractor.json",
  "packages/client/api-extractor.browser.json",
  "packages/client/api-extractor.chrome-ai.json",
  "packages/client/api-extractor.protocol.json",
  "packages/server/api-extractor.json",
  "packages/react/api-extractor.json",
  "packages/react-router/api-extractor.json",
  "packages/tanstack-router/api-extractor.json",
  "packages/next/api-extractor.json",
  "packages/astro/api-extractor.json",
  "packages/astro/api-extractor.client.json",
];

for (const config of configs) {
  const args = ["run", "--config", config];
  if (local) args.push("--local");
  const result = spawnSync("api-extractor", args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`api-extractor failed for ${config}`);
  }
}
