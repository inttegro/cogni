import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releasePackages } from "./release-packages.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const rootManifest = await readJson(path.join(repositoryRoot, "package.json"));
const expectedVersion = rootManifest.version;
const failures = [];

if (!/^0\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion)) {
  failures.push(
    `workspace version ${JSON.stringify(expectedVersion)} is not a 0.x release`,
  );
}

for (const releasePackage of releasePackages) {
  const packageRoot = path.join(repositoryRoot, releasePackage.workspace);
  const manifest = await readJson(path.join(packageRoot, "package.json"));

  if (manifest.name !== releasePackage.name) {
    failures.push(`${releasePackage.workspace} is named ${manifest.name}`);
  }
  if (manifest.version !== expectedVersion) {
    failures.push(
      `${manifest.name} is ${manifest.version}; expected ${expectedVersion}`,
    );
  }
  if (manifest.license !== "MIT") {
    failures.push(`${manifest.name} must declare the MIT license`);
  }
  if (
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig?.provenance !== true
  ) {
    failures.push(`${manifest.name} must publish publicly with provenance`);
  }

  for (const section of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, version] of Object.entries(manifest[section] ?? {})) {
      if (dependency.startsWith("@inttegro/cogni-") && version !== expectedVersion) {
        failures.push(
          `${manifest.name} ${section}.${dependency} is ${version}; expected ${expectedVersion}`,
        );
      }
    }
  }

  for (const exported of exportTargets(manifest.exports)) {
    await access(path.join(packageRoot, exported)).catch(() => {
      failures.push(`${manifest.name} export target ${exported} does not exist`);
    });
  }
}

const changelog = await readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${expectedVersion}]`)) {
  failures.push(`CHANGELOG.md has no ${expectedVersion} release section`);
}

for (const required of [
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "RELEASING.md",
]) {
  await access(path.join(repositoryRoot, required)).catch(() => {
    failures.push(`missing required release file ${required}`);
  });
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const expectedTag = `v${expectedVersion}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    failures.push(
      `release tag ${process.env.GITHUB_REF_NAME} does not match ${expectedTag}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Cogni release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Cogni ${expectedVersion} release graph verified across ${releasePackages.length} packages.`,
  );
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function exportTargets(exports) {
  const targets = [];

  function visit(value) {
    if (typeof value === "string") {
      if (value.startsWith("./")) targets.push(value.slice(2));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const child of Object.values(value)) visit(child);
  }

  visit(exports);
  return [...new Set(targets)];
}
