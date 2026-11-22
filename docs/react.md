---
title: React
description: Give React applications one shared prediction budget and lifecycle.
---

`@inttegro/cogni-react` gives a React tree one scheduler. Most applications should stop there and
use the adapter for their router: the link remains familiar while Cogni decides whether its preload
is worth starting.

<Warning>
  The package exists in this workspace at version `0.0.0`, but npm publication has not been
  verified. Use a workspace dependency or an explicit local link for development.
</Warning>

## Choose your link

| Router             | Package                           | Drop-in component |
| ------------------ | --------------------------------- | ----------------- |
| React Router       | `@inttegro/cogni-react-router`    | `PredictiveLink`  |
| TanStack Router    | `@inttegro/cogni-tanstack-router` | `PredictiveLink`  |
| Next.js App Router | `@inttegro/cogni-next`            | `PredictiveLink`  |

All three use the same required prediction fields: `probability` and `horizonMs`. They preserve the
router's link semantics, start route work through Cogni's shared budget, and attribute reuse at the
router's navigation boundary. See [React Router](/react-router),
[TanStack Router](/tanstack-router), or [Next.js](/next) for the matching setup.

## Mount the provider

```tsx
import { CogniProvider } from "@inttegro/cogni-react";

export function App() {
  return <CogniProvider>{/* router and application */}</CogniProvider>;
}
```

`CogniProvider` creates and disposes a browser scheduler by default. It also observes visibility,
data-saving, and constrained-network signals. Pass `foregroundActivity` when the host has active
foreground requests so speculation yields to work the user is already waiting for.

Use `scheduler` to supply a host-owned scheduler, or `createScheduler` for a provider-owned custom
instance. The two props are mutually exclusive. A supplied scheduler must stay stable and is never
disposed by the provider.

## Other routers

A custom router does not need a custom Cogni core. Its adapter calls `useRouteIntent()` with one
cache-aware `prefetchRoute` function, forwards hover and direct intent to the returned actions, and
calls `commit()` only after the router accepts the destination.

```tsx
const intent = useRouteIntent({
  href: "/orders",
  probability: 0.92,
  horizonMs: 30_000,
  prefetchRoute: (href, { signal }) => router.preload(href, { signal }),
});
```

This is the same contract used by the official router packages. The prefetch must populate the
representation that foreground navigation consumes; merely finishing a request is not reuse.

## Lower-level work

Use `useScheduledPrediction()` for non-route resources and `useIntentPrefetch()` when you only need
intent timing. `useCogniScheduler()` exposes the shared scheduler for explicit reuse attribution or
quality snapshots.

The public package also exports `createRouteCandidate`, `useRouteIntent`, and their types so custom
router adapters do not have to recreate Cogni's scheduling lifecycle.

See [Candidates and reuse](/candidates-and-reuse) for accounting semantics and
[Scheduling and intent](/scheduling-and-intent) for admission behavior.
