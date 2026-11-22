# `@inttegro/cogni-astro`

Astro route prediction through Cogni's shared admission, scheduling, cancellation,
and measurement runtime.

## Install

```sh
npm install @inttegro/cogni-client @inttegro/cogni-astro
```

## Use the Astro components

Mount one provider in the base layout and use predictive links where the
application has a calibrated intent policy:

```astro
---
import CogniProvider from "@inttegro/cogni-astro/CogniProvider.astro";
import PredictiveLink from "@inttegro/cogni-astro/PredictiveLink.astro";
---

<CogniProvider>
  <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
    Orders
  </PredictiveLink>
</CogniProvider>
```

`PredictiveLink` waits for sustained hover intent and escalates focus, touch,
and pointer-down intent. With Astro's `ClientRouter`, the runtime reports reuse
only after `astro:before-preparation` confirms the destination navigation.

The component writes `data-astro-prefetch="false"` so Astro's built-in
prefetcher does not duplicate Cogni's work for that link. Applications adopting
Cogni across navigation should also remove `prefetch.prefetchAll` from their
Astro configuration; otherwise unmarked links continue bypassing Cogni's
budget.

## Use a custom route cache

The DOM runtime is public when an application needs a route loader other than
`astro:prefetch`:

```ts
import { createAstroPredictionRuntime } from "@inttegro/cogni-astro";

const runtime = createAstroPredictionRuntime({
  prefetchRoute: async (href, { signal }) => {
    await routeCache.prefetch(href, { signal });
  },
});

runtime.start();
```

The host-owned loader must populate the same cache consumed by committed Astro
navigation. It must remain read-only and preserve ordinary authentication,
authorization, and tenancy.

## Current status

This package is version `0.0.0` and has not been published. Local tests and
package checks are implementation evidence, not evidence of npm publication or
production reuse.
