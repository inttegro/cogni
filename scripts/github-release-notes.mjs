import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releasePackages } from "./release-packages.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const version = manifest.version;

const packageLinks = releasePackages.map(
  ({ name }) =>
    `- [\`${name}@${version}\`](https://www.npmjs.com/package/${name}/v/${version})`,
);

process.stdout.write(
  [
    "## npm packages",
    "",
    `Cogni ${version} publishes the following packages together from one signed repository tag:`,
    "",
    ...packageLinks,
    "",
  ].join("\n"),
);
