---
title: React
description: Give React applications one shared prediction budget and lifecycle.
---

`@inttegro/cogni-react` gives a React tree one scheduler. Most applications should stop there and
use the adapter for their router: the link remains familiar while Cogni decides whether its preload
is worth starting.

<Note>
  This guide follows the `0.1` API. Confirm the latest published version and migration notes before
  installing a newer `0.x` release.
</Note>

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
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
      {/* router and application */}
    </CogniProvider>
  );
}
```

`CogniProvider` creates a learning browser scheduler and disposes it by default. The opaque account
key is combined with a random local browser key, so cleared storage starts a fresh model. It also
observes visibility, data-saving, and constrained-network signals. Pass `foregroundActivity` when
the host has active foreground requests so speculation yields to work the user is already waiting
for.

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

## Discover rendered links

Applications with a shared shell do not need to replace or explicitly list every link.
`useDelegatedRouteIntent()` observes a document or component subtree and discovers matching links as
pointer, focus, touch, and click events bubble through it. Links added after mount are eligible
automatically.

```tsx
const routeIntent = useDelegatedRouteIntent({
  selector: "a[href], [data-resource-href]",
  probability: 0.92,
  horizonMs: 30_000,
  prefetchRoute: (href, { signal }) => router.preload(href, { signal }),
  resolveHref: (source, currentHref) => authorizeRouteSource(source, currentHref),
  onNavigationIntent: ({ href }) => recordNavigationIntent(href),
});

// After the router confirms the destination committed:
await routeIntent.markReused(committedHref);
```

The default selector discovers same-origin anchors and excludes same-location, hash-only, download,
and new-window links. A host resolver can add link-like rows, canonicalize destinations, and enforce
authorization or route boundaries without maintaining a central destination list.

Discovery does not invent predictive policy. The host still supplies probability, horizon, cost,
and reusable route work. Idle prediction before any user interaction still requires a bounded
candidate policy; Cogni never crawls the rendered page and prefetches everything.

## Lower-level work

Use `useScheduledPrediction()` for non-route resources and `useIntentPrefetch()` when you only need
intent timing. `useCogniScheduler()` exposes the shared scheduler for explicit reuse attribution or
quality snapshots.

The public package also exports `createRouteCandidate`, `useRouteIntent`, and their types so custom
router adapters do not have to recreate Cogni's scheduling lifecycle.

See [Candidates and reuse](/candidates-and-reuse) for accounting semantics and
[Scheduling and intent](/scheduling-and-intent) for admission behavior.
