# Releasing Cogni

Cogni packages share one version and are published together from a signed `v<version>` tag. A merge
does not publish anything.

## Repository setup

Before publishing:

1. Make the GitHub repository public and enable private vulnerability reporting.
2. Protect `master` and require the CI workflow.
3. Create a protected GitHub environment named `npm`.
4. Confirm that every package name in `scripts/release-packages.mjs` is available to the scope.

npm requires a package to exist before it can receive a trusted-publisher configuration. Bootstrap
the first release with a granular token that can publish packages and bypass 2FA, store it only as
the `NPM_TOKEN` secret in the `npm` environment, and give it the shortest practical expiration.

Before the next release, configure `.github/workflows/release.yml` as a GitHub trusted publisher for
each package. Do this within two days of that release because npm expires a new, unvalidated trusted
publisher after two days. Once an OIDC publish succeeds, remove `NPM_TOKEN` from the environment and
revoke the bootstrap token.

Ordinary checks may run on another CI provider, including Cloudflare Workers Builds. Keep the
release-only GitHub Actions workflow while GitHub is the canonical repository because npm uses that
identity to issue provenance for the published artifacts.

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
   git tag -s v0.1.0 -m "cogni v0.1.0"
   git push origin master v0.1.0
   ```

The tag starts `.github/workflows/release.yml`. The workflow reruns all checks, builds the demos from
fresh tarballs, publishes packages in dependency order with npm provenance, and creates one GitHub
release for the repository tag. The GitHub release combines generated commit notes with links to
every npm package in that version. A rerun skips package versions that were already published,
allowing recovery from a partial registry failure, and leaves an existing GitHub release unchanged.

Cogni uses a fixed-version monorepo: all public packages share a version and one signed tag. GitHub
therefore shows one release per Cogni version rather than one release per npm package.

## Verify publication

After the workflow succeeds, verify each package version and provenance on npm, inspect the generated
GitHub release, install the packages in a new directory, and build at least one demo without workspace
links. A successful workflow is publication evidence; it is not evidence that a host application
deployed the release or reused predicted work in production.
