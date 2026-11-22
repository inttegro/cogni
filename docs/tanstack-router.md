---
title: TanStack Router
description: Put TanStack route preloading behind Cogni's admission and quality accounting.
---

`@inttegro/cogni-tanstack-router` wraps TanStack Router's awaitable `preloadRoute()` contract in a
familiar link. Route parameters, search state, active state, and ordinary anchor props stay with the
router; Cogni owns whether predictive work starts.

<Warning>
  The package exists at version `0.0.0`, but npm publication has not been verified. Use a workspace
  dependency or an explicit local link for development. It supports TanStack Router 1.x.
</Warning>

## Replace Link

```tsx
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-tanstack-router";

export function Navigation() {
  return (
    <CogniProvider>
      <PredictiveLink to="/orders" probability={0.92} horizonMs={30_000}>
        Orders
      </PredictiveLink>
    </CogniProvider>
  );
}
```

The adapter disables the link's independent `preload` behavior, then calls
`router.preloadRoute()` after Cogni admits the candidate. The returned promise keeps the prediction
in its loading state until TanStack's speculative match lane settles.

When TanStack begins a matching navigation, the adapter attributes reuse. If the user leaves,
prevents the event, opens another context, or navigates elsewhere, the prediction is not credited.

## Keep router cache policy

Cogni does not replace `preloadStaleTime`, `preloadGcTime`, route loaders, or an external query
cache. Those settings decide whether the route can reuse settled work. Cogni decides whether the
speculation was worth starting and measures whether committed navigation used it.

Avoid enabling a second default preload strategy for these links. `PredictiveLink` passes
`preload={false}` internally so hover does not bypass Cogni's budget.

Use `predictionKey`, `policy`, `cost`, `priority`, and `estimatedBytes` when the default route
identity needs more context. `probability` and `horizonMs` are required.

See [React](/react) for provider ownership and [Scheduling and intent](/scheduling-and-intent) for
the admission sequence.
