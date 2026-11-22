# @inttegro/cogni-next

Next.js App Router adapters for Cogni predictive loading.

```tsx
import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider>
      <PredictiveLink href="/orders" probability={0.9} horizonMs={30_000}>
        Orders
      </PredictiveLink>
    </NextCogniProvider>
  );
}
```

`PredictiveLink` delays hover work, escalates focus, touch, pointer-down, and
click intent, deduplicates the route, and records reuse only after Next accepts
an unmodified same-context navigation. Next's automatic viewport prefetch is disabled on the
link by default so the same route is not fetched outside Cogni's budget.

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

For non-link policy predictions, use `useNextRoutePrediction`. Probabilities and
horizons remain required because an adapter cannot calibrate application intent.
The package also re-exports the React scheduler hooks, so a Next.js application
does not need a second adapter import.

Cogni is under active extraction and this package has not been published.
