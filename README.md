# Cogni

Cogni is an open-source predictive loading system for applications that should
feel immediate without doing unbounded speculative work.

This repository is organized as an npm workspace with two independently
publishable runtimes:

- [`client/`](./client/) contains the frontend coordinator, browser admission
  policy, and backend protocol client. Its npm package is
  `@inttegro/cogni-client`.
- [`server/`](./server/) contains the Node.js implementation of the Cogni
  backend transport. Its npm package is `@inttegro/cogni-server`.

The language-neutral backend contract remains in [`protocol/`](./protocol/).
Other backend languages implement that contract without importing either npm
package.

Merx is the reference migration. Its behavior-to-package map and adapter
boundary are documented in
[`docs/merx-parity.md`](./docs/merx-parity.md).

## Package naming

npm package names have the form `@scope/name`; they cannot contain a second
package-name slash. Consequently, `@inttegro/cogni/client` and
`@inttegro/cogni/server` could only be subpath exports of one published package,
not independently publishable packages. Cogni uses the independent package
names `@inttegro/cogni-client` and `@inttegro/cogni-server` so applications can
install and ship only the runtime they use.

## Development

```sh
npm install
npm run check
```

The repository is under active extraction and neither package has been
published. See [CHARTER.md](./CHARTER.md) for the project boundaries and release
standard.
