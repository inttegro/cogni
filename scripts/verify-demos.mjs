import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { demoDirectories, releasePackages } from "./release-packages.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "cogni-demos-"));
const packDirectory = path.join(temporaryRoot, "packages");
const packageTarballs = new Map();
let succeeded = false;

try {
  await mkdir(packDirectory, { recursive: true });

  for (const releasePackage of releasePackages) {
    const output = run(
      "npm",
      [
        "pack",
        "--workspace",
        releasePackage.name,
        "--pack-destination",
        packDirectory,
        "--json",
      ],
      repositoryRoot,
      true,
    );
    const result = JSON.parse(output);
    const filename = result[0]?.filename;
    if (!filename)
      throw new Error(`npm pack returned no file for ${releasePackage.name}`);
    packageTarballs.set(releasePackage.name, path.join(packDirectory, filename));
  }

  for (const demo of demoDirectories) {
    const source = path.join(repositoryRoot, "demos", demo);
    const destination = path.join(temporaryRoot, "demos", demo);
    await cp(source, destination, {
      recursive: true,
      filter: (entry) => !isGeneratedPath(path.relative(source, entry)),
    });

    const manifestPath = path.join(destination, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    replaceCogniVersions(manifest.dependencies);
    replaceCogniVersions(manifest.devDependencies);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(`\nBuilding demos/${demo} from packed Cogni artifacts...`);
    run(
      "npm",
      ["install", "--no-audit", "--no-fund", "--package-lock=false"],
      destination,
    );
    run("npm", ["run", "build"], destination);
  }

  succeeded = true;
  console.log(
    `\nVerified ${demoDirectories.length} standalone demos from npm tarballs.`,
  );
} finally {
  if (succeeded) {
    await rm(temporaryRoot, { recursive: true, force: true });
  } else {
    console.error(`Demo verification workspace preserved at ${temporaryRoot}`);
  }
}

function replaceCogniVersions(dependencies = {}) {
  for (const dependency of Object.keys(dependencies)) {
    if (!dependency.startsWith("@inttegro/cogni-")) continue;
    const tarball = packageTarballs.get(dependency);
    if (!tarball) throw new Error(`no packed artifact found for ${dependency}`);
    dependencies[dependency] = `file:${tarball}`;
  }
}

function isGeneratedPath(relativePath) {
  const first = relativePath.split(path.sep)[0];
  return ["node_modules", "dist", ".next", ".astro"].includes(first);
}

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return result.stdout ?? "";
}
