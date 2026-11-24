---
title: Demos
description: Build Cogni against the real package boundary, not a workspace shortcut.
---

Cogni's demos are deliberately small, but they are not pseudocode. Each is a standalone application
that uses the same public exports an npm consumer receives.

| Demo                                                                                   | What it proves                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [React](https://github.com/inttegro/cogni/tree/master/demos/react)                     | A custom navigator can reuse `useRouteIntent` safely.     |
| [React Router](https://github.com/inttegro/cogni/tree/master/demos/react-router)       | Lazy route modules are loaded through `PredictiveLink`.   |
| [TanStack Router](https://github.com/inttegro/cogni/tree/master/demos/tanstack-router) | Predictions settle through `router.preloadRoute()`.       |
| [Next.js](https://github.com/inttegro/cogni/tree/master/demos/next)                    | App Router prediction uses the published adapter surface. |
| [Astro](https://github.com/inttegro/cogni/tree/master/demos/astro)                     | Delegated intent survives client-side route swaps.        |
| [Node server](https://github.com/inttegro/cogni/tree/master/demos/server)              | Registered resources stay behind host-selected routes.    |

## Why the demos are outside the workspace

Workspace symlinks are useful during development, but they can hide a missing export or undeclared
dependency. Cogni's release check builds the packages, creates npm tarballs, copies each demo into a
clean temporary directory, replaces Cogni versions with those tarballs, and installs from scratch.

```sh
npm run verify:demos
```

The check must pass for every supported integration before a release can publish. A demo build proves
that package boundaries and framework compilation work. It does not, by itself, prove production
latency improvement or prediction reuse.
