---
title: React and Next.js
description: Adopt Cogni through lifecycle hooks and intent-aware App Router links without copying scheduler logic.
---

Cogni's framework packages translate React and Next.js lifecycle into the public client runtime.
They do not own route policy, calibrated probabilities, application data, authentication, or a
second cache.

## React provider

Mount one provider around the part of the application that shares a prediction budget:

```tsx
import { CogniProvider } from "@inttegro/cogni-react";

export function Application({ children }: { children: React.ReactNode }) {
  return <CogniProvider>{children}</CogniProvider>;
}
```

The provider creates and disposes a browser scheduler, observes visibility and constrained-network
signals, and can accept the application's foreground request count. Pass `scheduler` when the host
already owns a shared scheduler. Pass `createScheduler` when it needs custom coordinator limits or
telemetry.

`useScheduledPrediction(candidate, loader, options)` binds one candidate to component lifecycle.
It cancels the prediction when the candidate changes or the component unmounts.

`useIntentPrefetch(run, options)` exposes `schedule`, `runNow`, and `cancel` for controls that need
delayed hover intent and immediate focus, touch, or click intent.

## Next.js provider and links

`NextCogniProvider` is the React provider exported under a Next-specific name.

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

`PredictiveLink`:

- waits for sustained hover intent;
- starts immediately for focus, touch, pointer-down, and an ordinary click;
- deduplicates the route through the shared scheduler;
- cancels work when intent leaves;
- reports reuse only after Next accepts an unmodified same-context navigation; and
- disables Next's automatic link prefetch by default so it does not bypass Cogni's budget.

The probability and horizon are required. The adapter cannot infer calibrated application intent.

## Automatic route policies

Use `useNextRoutePrediction` for a route selected by an application policy rather than a link event:

```tsx
useNextRoutePrediction({
  href: "/orders/123",
  trigger: "recent-order-policy",
  probability: 0.94,
  horizonMs: 15_000,
  schedule: { delayMs: 500, maxDeferMs: 5_000 },
});
```

Call `markRoutePredictionReused` when a non-link committed action consumes that route.

## Full-route prefetch

The default Next loader uses public `router.prefetch()` behavior. A host may inject a
`prefetchRoute` function when it has a tested, version-specific way to load a fuller route payload.
That function receives the prediction's abort signal and invalidation callback. Scheduling,
admission, cancellation, and measurement remain in Cogni.

## Current status

Both adapters are workspace packages at version `0.0.0`. Passing unit, type, build, and package
consumer checks is local implementation evidence. It is not evidence of npm publication or host
application reuse.
