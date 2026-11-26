# @inttegro/cogni-next

Next.js App Router adapters for Cogni predictive loading.

For a Vinext application, install [`@inttegro/cogni-vinext`](../vinext/) instead. It exposes this
same public integration with Vinext-native peer metadata, so Vinext users do not need to install
Next.js.

```sh
npm install @inttegro/cogni-next
```

Mount one provider and use `PredictiveLink` anywhere you would normally use
Next's `Link`:

```tsx
import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider opaqueUserKey={session.opaqueUserKey}>
      <PredictiveLink href="/orders">Orders</PredictiveLink>
    </NextCogniProvider>
  );
}
```

`PredictiveLink` delays hover work, escalates focus, touch, pointer-down, and
click intent, deduplicates the route, and records reuse only after Next accepts
an unmodified same-context navigation. Next's automatic viewport prefetch is disabled on the
link by default so the same route is not fetched outside Cogni's budget.

## Custom prefetchers

The default loader uses the public `router.prefetch()` API. Applications that
need version-specific full-route behavior can inject `prefetchRoute` without
forking scheduling or measurement:

```tsx
<PredictiveLink
  href="/orders/123"
  probability={0.94}
  horizonMs={15_000}
  prefetchRoute={(href, { onInvalidate }) => {
    prefetchFullRoute(href, onInvalidate);
  }}
>
  Open order
</PredictiveLink>
```

Applications with an established link system can mount
`useNextDelegatedRouteIntent` once in their shared shell. It discovers ordinary
links and links added after mount without requiring `PredictiveLink` at every
call site. Hosts may extend the selector and resolver for link-like rows, and
must call `markReused(href)` only after App Router navigation commits.

For non-link work, use the re-exported `useCogniPrediction` beside the cache or
component that owns reuse. Cogni supplies a conservative initial probability
and reuse horizon; applications with stronger evidence can override either
value. `useNextRoutePrediction` remains available for custom route lifecycles.
A Next.js application does not need a second adapter import.

Cogni follows semantic versioning. During the `0.x` series, minor releases may
change public APIs and will include migration notes in the changelog.
