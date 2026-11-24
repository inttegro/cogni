# Cogni demos

Each directory is a standalone application that consumes the public Cogni API:

- [`react/`](./react/) shows how a custom navigation layer can use the React hooks.
- [`react-router/`](./react-router/) connects `PredictiveLink` to lazy route modules.
- [`tanstack-router/`](./tanstack-router/) lets TanStack Router own route preloading.
- [`next/`](./next/) uses the App Router adapter.
- [`astro/`](./astro/) uses the delegated Astro runtime and predictive link component.
- [`server/`](./server/) registers read-only backend resources and host-selected routes.

The demos intentionally stay outside the npm workspace. Release verification packs every Cogni
package, installs those tarballs into clean copies of the demos, and builds each copy:

```sh
npm run verify:demos
```

This catches missing exports, undeclared dependencies, and framework integration failures that
workspace symlinks can hide.
