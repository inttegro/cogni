import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { releasePackages } from "./release-packages.mjs";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF_TYPE !== "tag") {
  throw new Error(
    "releases may only be published by the tagged GitHub Actions workflow",
  );
}

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const version = manifest.version;
const expectedTag = `v${version}`;

if (process.env.GITHUB_REF_NAME !== expectedTag) {
  throw new Error(
    `release tag ${process.env.GITHUB_REF_NAME} does not match ${expectedTag}`,
  );
}

for (const releasePackage of releasePackages) {
  const specifier = `${releasePackage.name}@${version}`;
  const lookup = spawnSync("npm", ["view", specifier, "version", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  if (lookup.status === 0) {
    console.log(`${specifier} is already published; skipping.`);
    continue;
  }
  if (!lookup.stderr.includes("E404")) {
    process.stderr.write(lookup.stderr);
    throw new Error(`could not determine whether ${specifier} is published`);
  }

  run("npm", [
    "publish",
    "--workspace",
    releasePackage.name,
    "--access",
    "public",
    "--provenance",
  ]);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}
