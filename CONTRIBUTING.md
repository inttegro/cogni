# Contributing to Cogni

Cogni welcomes focused issues and pull requests that preserve its central constraint: predictions
may move safe reads earlier, but they must not change application correctness or authorization.

## Development setup

Use Node.js 24 and npm 11.14 or newer:

```sh
npm ci
npm run check
```

Run the slower clean-package acceptance suite before proposing an adapter or packaging change:

```sh
npm run verify:demos
```

## Change expectations

- Add deterministic tests for scheduling, lifecycle, protocol, or adapter behavior you change.
- Keep host-specific route registries, cache keys, authentication, and domain types out of Cogni.
- Treat predictions as read-only and keep the foreground path correct after cancellation or failure.
- Update documentation and the changelog when public behavior changes.
- Add or update a standalone demo when changing a supported framework integration.
- Do not weaken confidence, network, visibility, concurrency, or deadline gates without evidence.

## Pull requests

Keep pull requests narrow. Explain the behavior, the cache or router seam being reused, and how the
change was verified. Passing tests prove implementation behavior; they do not prove production reuse
or latency improvement, so keep performance claims tied to measured evidence.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
