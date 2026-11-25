---
title: React Router
description: Replace React Router Link with a prediction-aware equivalent.
---

`@inttegro/cogni-react-router` keeps React Router's `to`-based link API and adds calibrated route
prediction. The smallest integration is a component replacement.

<Note>
  This guide follows the `0.1` API. The adapter supports React Router 7.9 through 8.x. Confirm the
  latest published version and migration notes before installing a newer `0.x` release.
</Note>

## Replace Link

```tsx
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-react-router";

export function Navigation() {
  return (
    <CogniProvider opaqueUserKey={session.opaqueUserKey}>
      <PredictiveLink to="/orders">Orders</PredictiveLink>
    </CogniProvider>
  );
}
```

`PredictiveLink` preserves ordinary React Router link props and event handlers. Sustained hover
waits 120 ms by default. Focus, touch, primary pointer-down, and ordinary click intent start
immediately. Modified, downloaded, external, full-document, new-context, or prevented navigation
does not count as reuse.

## Router modes

In Framework Mode, Cogni activates `PrefetchPageLinks` only after the prediction passes admission.
It waits for the emitted data and module resources to settle before recording the route as loaded.
React Router's independent link prefetch is set to `none`, so the same intent does not issue work
twice.

Data and Declarative Mode do not expose Framework Mode's universal route-prefetch contract. Supply
the cache operation your application already uses:

```tsx
<PredictiveLink
  to="/orders"
  prefetchRoute={(href, { signal }) => routeCache.preload(href, { signal })}
>
  Orders
</PredictiveLink>
```

The callback must warm the same cache that the destination reads. Cogni attributes reuse only after
the adapter starts the accepted client navigation, not when the preload merely finishes. Framework
and Data Mode await React Router's navigation promise; Declarative Mode confirms acceptance when
the navigation call returns because that mode does not expose a completion promise.

## Candidate policy

Use `predictionKey`, `policy`, `cost`, `priority`, and `estimatedBytes` when the default route
identity is not enough. Cogni starts with its conservative probability and 30 second reuse horizon,
then learns from actual reuse and waste. Override `probability` or `horizonMs` when the application
has stronger evidence.

See [React](/cogni/react) for provider ownership and [Candidates and reuse](/cogni/candidates-and-reuse) for
quality accounting.
