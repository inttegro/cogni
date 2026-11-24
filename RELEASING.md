# Releasing Cogni

Cogni packages share one version and are published together from a signed `v<version>` tag. A merge
does not publish anything.

## One-time repository setup

Before the first public release:

1. Make the GitHub repository public and enable private vulnerability reporting.
2. Protect `master` and require the CI workflow.
3. Create a protected GitHub environment named `npm`.
4. Give the GitHub Actions release workflow trusted-publisher access to the `@inttegro` npm scope.
5. Confirm that every package name in `scripts/release-packages.mjs` is available to the scope.

These are external administrative actions. They are intentionally not automated by repository code.

## Prepare a release

1. Set the same version in the root and all package manifests.
2. Set every internal Cogni dependency to that exact version.
3. Move the changelog section from `Unreleased` to the release date.
4. Run the complete local gate:

   ```sh
   npm ci
   npm run release:check
   ```

5. Review every `npm pack --dry-run` file list and commit the release preparation.
6. Create and push a signed tag matching the package version:

   ```sh
   git tag -s v0.1.0 -m "Cogni v0.1.0"
   git push origin master v0.1.0
   ```

The tag starts `.github/workflows/release.yml`. The workflow reruns all checks, builds the demos from
fresh tarballs, and publishes packages in dependency order with npm provenance. A rerun skips package
versions that were already published, allowing recovery from a partial registry failure.

## Verify publication

After the workflow succeeds, verify each package version and provenance on npm, install the packages
in a new directory, and build at least one demo without workspace links. Then create the GitHub
release from the changelog. A successful workflow is publication evidence; it is not evidence that a
host application deployed the release or reused predicted work in production.
