# Cogni

Cogni is an open-source predictive loading system for applications that should
feel immediate without doing unbounded speculative work.

This repository is organized as an npm workspace with seven independently
publishable runtimes:

- [`packages/client/`](./packages/client/) contains the frontend coordinator, browser admission
  policy, and backend protocol client. Its npm package is
  `@inttegro/cogni-client`.
- [`packages/server/`](./packages/server/) contains the Node.js implementation of the Cogni
  backend transport. Its npm package is `@inttegro/cogni-server`.
- [`packages/react/`](./packages/react/) connects React lifecycle and browser admission to the
  framework-neutral client. Its npm package is `@inttegro/cogni-react`.
- [`packages/react-router/`](./packages/react-router/) adds a predictive React Router link. Its npm
  package is `@inttegro/cogni-react-router`.
- [`packages/tanstack-router/`](./packages/tanstack-router/) adds a predictive TanStack Router link.
  Its npm package is `@inttegro/cogni-tanstack-router`.
- [`packages/next/`](./packages/next/) adds calibrated App Router prediction hooks and an
  intent-aware link. Its npm package is `@inttegro/cogni-next`.
- [`packages/astro/`](./packages/astro/) adds delegated intent handling, Astro lifecycle
  reuse attribution, and `.astro` components. Its npm package is
  `@inttegro/cogni-astro`.

The language-neutral backend contract remains in [`protocol/`](./protocol/).
Other backend languages implement that contract without importing either npm
package.

## Repository layout

[`packages/`](./packages/) is the home for independently publishable
JavaScript and TypeScript packages. The client and server runtimes and the React,
React Router, TanStack Router, Next.js, and Astro adapters live there today; additional integrations should be
added as sibling packages when their public boundaries are ready.

Framework packages must remain thin adapters over the public client contracts.
They may translate framework lifecycle, routing, and cache signals, but must not
fork Cogni's scheduling, admission, or telemetry behavior.

[`protocol/`](./protocol/) stays at the repository root because it is a
language-neutral contract shared by every frontend and backend implementation.

## Package naming

npm package names have the form `@scope/name`; they cannot contain a second
package-name slash. Consequently, `@inttegro/cogni/client` and
`@inttegro/cogni/server` could only be subpath exports of one published package,
not independently publishable packages. Cogni uses the independent package
names `@inttegro/cogni-client`, `@inttegro/cogni-server`,
`@inttegro/cogni-react`, `@inttegro/cogni-react-router`,
`@inttegro/cogni-tanstack-router`, `@inttegro/cogni-next`, and
`@inttegro/cogni-astro` so applications can install and ship only the runtime
and adapter they use.

## Development

```sh
npm install
npm run check
```

The repository is under active extraction and no package has been published.
See [CHARTER.md](./CHARTER.md) for the project boundaries and release standard.
