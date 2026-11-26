# Cogni

Cogni is an open-source predictive loading system for applications that should
feel immediate without doing unbounded speculative work.

## Start with your framework

Most applications need one provider and Cogni's replacement for their router's
link component. The adapter supplies conservative defaults, watches real user
intent, uses the router's own cache, and learns from reuse and waste.

```tsx
import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

<NextCogniProvider opaqueUserKey={session.opaqueUserKey}>
  <PredictiveLink href="/orders">Orders</PredictiveLink>
</NextCogniProvider>;
```

Choose the adapter for your application:

- Next.js: [`@inttegro/cogni-next`](./packages/next/)
- Vinext: [`@inttegro/cogni-vinext`](./packages/vinext/)
- Astro: [`@inttegro/cogni-astro`](./packages/astro/)
- React Router: [`@inttegro/cogni-react-router`](./packages/react-router/)
- TanStack Router: [`@inttegro/cogni-tanstack-router`](./packages/tanstack-router/)
- Custom React work: [`@inttegro/cogni-react`](./packages/react/)

Use [`@inttegro/cogni-client`](./packages/client/) directly only when you are
building a custom integration or scheduling reusable work outside a supported
framework.

This repository is organized as an npm workspace with nine independently
publishable runtimes:

- [`packages/client/`](./packages/client/) contains the frontend coordinator, adaptive calibration,
  browser admission policy, and backend protocol client. Its npm package is
  `@inttegro/cogni-client`.
- [`packages/server/`](./packages/server/) contains the Node.js implementation of the Cogni
  backend transport. Its npm package is `@inttegro/cogni-server`.
- [`packages/react/`](./packages/react/) connects React lifecycle and browser admission to the
  framework-neutral client. Its npm package is `@inttegro/cogni-react`.
- [`packages/devtools/`](./packages/devtools/) records prediction decisions and renders embedded or
  browser DevTools. Its npm package is `@inttegro/cogni-devtools`.
- [`packages/react-router/`](./packages/react-router/) adds a predictive React Router link. Its npm
  package is `@inttegro/cogni-react-router`.
- [`packages/tanstack-router/`](./packages/tanstack-router/) adds a predictive TanStack Router link.
  Its npm package is `@inttegro/cogni-tanstack-router`.
- [`packages/next/`](./packages/next/) adds calibrated App Router prediction hooks and an
  intent-aware link. Its npm package is `@inttegro/cogni-next`.
- [`packages/vinext/`](./packages/vinext/) exposes the same calibrated App Router integration with
  Vinext-native package metadata. Its npm package is `@inttegro/cogni-vinext`.
- [`packages/astro/`](./packages/astro/) adds delegated intent handling, Astro lifecycle
  reuse attribution, and `.astro` components. Its npm package is
  `@inttegro/cogni-astro`.

[`extensions/browser/`](./extensions/browser/) contains the development-only Cogni panel for
Chromium and Firefox. The extension reads the same bounded recorder used by the embedded panel.

The language-neutral backend contract remains in [`protocol/`](./protocol/).
Other backend languages implement that contract without importing either npm
package.

## Repository layout

[`packages/`](./packages/) is the home for independently publishable
JavaScript and TypeScript packages. The client and server runtimes and the React,
React Router, TanStack Router, Next.js, Vinext, Astro, and DevTools integrations live there today;
additional integrations should be added as sibling packages when their public boundaries are ready.

Framework packages must remain thin adapters over the public client contracts.
They may translate framework lifecycle, routing, and cache signals, but must not
fork Cogni's scheduling, admission, or telemetry behavior.

[`protocol/`](./protocol/) stays at the repository root because it is a
language-neutral contract shared by every frontend and backend implementation.

[`demos/`](./demos/) contains standalone applications for React, React Router,
TanStack Router, Next.js, Vinext, Astro, and the Node server runtime. They stay outside
the workspace so release verification can install packed artifacts instead of
silently resolving workspace symlinks.

## Package naming

npm package names have the form `@scope/name`; they cannot contain a second
package-name slash. Consequently, `@inttegro/cogni/client` and
`@inttegro/cogni/server` could only be subpath exports of one published package,
not independently publishable packages. Cogni uses the independent package
names `@inttegro/cogni-client`, `@inttegro/cogni-server`,
`@inttegro/cogni-react`, `@inttegro/cogni-react-router`,
`@inttegro/cogni-tanstack-router`, `@inttegro/cogni-next`,
`@inttegro/cogni-vinext`, `@inttegro/cogni-astro`, and
`@inttegro/cogni-devtools` so applications can
install and ship only the runtime and adapter they use.

## Development

```sh
npm install
npm run check
```

Run `npm run verify:demos` to pack every package and build all standalone demos
from clean installs. Run `npm run release:check` for the complete release gate.

The package manifests describe the `0.2.0` release line. Registry publication
and provenance must still be verified independently after the tagged release
workflow succeeds.
See [CHARTER.md](./CHARTER.md) for the project boundaries and release standard.
