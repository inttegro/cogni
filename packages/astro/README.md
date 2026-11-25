# `@inttegro/cogni-astro`

Astro route prediction through Cogni's shared admission, scheduling, cancellation,
and measurement runtime.

## Install

```sh
npm install @inttegro/cogni-client @inttegro/cogni-astro
```

## Use the Astro components

Mount one provider in the base layout and use predictive links where the
application can reuse route work:

```astro
---
import CogniProvider from "@inttegro/cogni-astro/CogniProvider.astro";
import PredictiveLink from "@inttegro/cogni-astro/PredictiveLink.astro";
---

<CogniProvider opaqueUserKey={session.opaqueUserKey}>
  <PredictiveLink href="/orders">Orders</PredictiveLink>
</CogniProvider>
```

The link uses Cogni's conservative initial probability and reuse horizon. The
browser runtime learns from actual reuse and waste; applications with stronger
evidence can override either value.

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
  opaqueUserKey: session.opaqueUserKey,
  prefetchRoute: async (href, { signal }) => {
    await routeCache.prefetch(href, { signal });
  },
});

runtime.start();
```

The host-owned loader must populate the same cache consumed by committed Astro
navigation. It must remain read-only and preserve ordinary authentication,
authorization, and tenancy.

## Versioning

Cogni follows semantic versioning. During the `0.x` series, minor releases may
change public APIs and will include migration notes in the changelog. Local
tests and package checks are implementation evidence, not evidence of npm
publication or production reuse.
