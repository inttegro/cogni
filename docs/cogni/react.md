---
title: React
description: Give React applications one shared prediction budget and lifecycle.
---

`@inttegro/cogni-react` gives a React tree one provider and one shared scheduler. Router integrations
submit work through that runtime; custom caches and resources register beside their owning component.
The provider owns admission, timing, browser gates, budgets, and adaptive learning without requiring
a central prediction list.

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
| Vinext App Router  | `@inttegro/cogni-vinext`          | `PredictiveLink`  |

All four use Cogni's default probability and reuse horizon, while allowing either value to be
overridden when the host has stronger evidence. They preserve the router's link semantics, start
route work through Cogni's shared budget, and attribute reuse at the router's navigation boundary.
See [React Router](/cogni/react-router),
[TanStack Router](/cogni/tanstack-router), [Next.js](/cogni/next), or
[Vinext](/cogni/vinext) for the matching setup.

## Mount the provider

```tsx
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-react-router";

export function App() {
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
      <PredictiveLink to="/orders">Orders</PredictiveLink>
    </CogniProvider>
  );
}
```

`CogniProvider` creates a learning browser scheduler and disposes it by default. It also observes visibility,
data-saving, and constrained-network signals. Pass `foregroundActivity` when the host has active
foreground requests so speculation yields to work the user is already waiting for.

Use `scheduler` to supply a host-owned scheduler, or `createScheduler` for a provider-owned custom
instance. The two props are mutually exclusive. A supplied scheduler must stay stable and is never
disposed by the provider.

The provider does not need a `predictions` prop. Official router integrations
derive work from their own public lifecycle and submit it through the provider.
This keeps route identity, cache behavior, and reuse attribution with the
integration that can prove them.

## Custom reusable work

Custom data, code, media, or computed work still needs a cache-aware loader because Cogni cannot
infer authorization, freshness, cache identity, or whether foreground behavior consumes the result.
Register that work locally rather than building a central provider list:

```tsx
import { useCogniPrediction } from "@inttegro/cogni-react";

function Dashboard() {
  const recentOrders = useCogniPrediction({
    key: "query:recent-orders",
    load: ({ signal }) => preloadRecentOrders({ signal }),
  });

  return (
    <DashboardLayout
      onOpenRecentOrders={() => {
        void recentOrders.markReused();
      }}
    />
  );
}
```

The key is not a route. It identifies the reusable cache work for deduplication and attribution.
Cogni starts with a conservative `0.8` prior, a `30` second reuse horizon, standard cost, and idle
scheduling. The browser runtime personalizes the prior from actual reuse and waste. Other policies
and route signals continue through the shared scheduler.

Call `markReused()` only when foreground behavior consumes the same cached representation. A completed
loader is not evidence of reuse. Router adapters attribute this automatically when their navigation
boundary commits.

Override policy fields and `schedule` on `useCogniPrediction()` only when the application has stronger
evidence. Use `useScheduledPrediction()` when the host already owns a complete candidate.

## Other routers

A custom router does not need a custom Cogni core. Its adapter calls `useRouteIntent()` with one
cache-aware `prefetchRoute` function, forwards hover and direct intent to the returned actions, and
calls `commit()` only after the router accepts the destination.

```tsx
const intent = useRouteIntent({
  href: "/orders",
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

Discovery does not invent reusable work or authorization. Cogni supplies conservative probability,
horizon, and scheduling defaults; the host still supplies cache-aware route work and may refine or
reject candidates. Idle prediction before any user interaction still requires a bounded candidate
policy; Cogni never crawls the rendered page and prefetches everything.

## Lower-level work

Use `useCogniPrediction()` for ordinary custom resources, `useScheduledPrediction()` for complete
host-owned candidates, and `useIntentPrefetch()` when you only need intent timing.
`useCogniScheduler()` exposes the shared scheduler for adapter authors and quality snapshots.

The public package also exports `createRouteCandidate`, `useRouteIntent`, and their types so custom
router adapters do not have to recreate Cogni's scheduling lifecycle.

See [Candidates and reuse](/cogni/candidates-and-reuse) for accounting semantics and
[Scheduling and intent](/cogni/scheduling-and-intent) for admission behavior.
