---
title: Astro
description: Add calibrated route prediction to Astro links through Cogni's delegated browser runtime.
---

`@inttegro/cogni-astro` connects Astro route intent to Cogni's shared admission, scheduling, and
reuse accounting. It provides two Astro components and a document-level client runtime that
survives `ClientRouter` page swaps.

<Note>
  This guide follows the `0.1` API. The manifest declares Astro `>=5 <8` as a peer dependency.
  Confirm the latest published version and migration notes before installing a newer `0.x` release.
</Note>

The current package name is `@inttegro/cogni-astro`. There is no `@inttegro/cogni` root package or
`@inttegro/cogni/astro` subpath.

## Add predictive links

Mount one provider in the base layout and mark routes whose work can be reused:

```astro
---
import CogniProvider from "@inttegro/cogni-astro/CogniProvider.astro";
import PredictiveLink from "@inttegro/cogni-astro/PredictiveLink.astro";
---

<CogniProvider opaqueUserKey={session.opaqueUserKey}>
  <nav>
    <PredictiveLink href="/orders">Orders</PredictiveLink>
  </nav>
</CogniProvider>
```

`CogniProvider` renders its slot and installs one singleton runtime through
`@inttegro/cogni-astro/client`. `PredictiveLink` renders an ordinary anchor. Only `href` is required;
Cogni supplies its conservative probability and 30 second reuse horizon, then learns from reuse and
waste. Candidate fields such as policy, cost, priority, estimated bytes, hover delay, and maximum
defer remain optional overrides.

The runtime delegates events at the document boundary. Sustained hover schedules after 120 ms by
default; leaving cancels pending work. Focus, touch, and unmodified primary pointer-down intent start
immediately. It predicts only same-origin, same-context routes. Route identity is an absolute URL
with its hash removed, so `/orders#latest` and `/orders` share a candidate.

## Route cache and reuse

The built-in client loader calls Astro's public `astro:prefetch` function. The resulting route
representation remains in Astro's cache for committed client navigation. `PredictiveLink` also
writes `data-astro-prefetch="false"` so Astro's link prefetcher does not issue duplicate work outside
Cogni's budget.

If Cogni owns route prediction across the application, remove `prefetch.prefetchAll` from Astro
configuration. Otherwise unmarked links may still prefetch outside Cogni's admission and accounting.

With Astro's `ClientRouter`, `astro:before-preparation` supplies the committed-navigation signal. A
matching active prediction is started immediately and attributed as reused; the runtime marks
foreground activity until `astro:page-load`. A completed prefetch alone is not reuse, and full
document navigation cannot preserve the in-memory accounting runtime.

The built-in loader calls `prefetch(href)` without Cogni's abort signal. Cogni can cancel delayed
intent before that call, but it cannot abort Astro's internal work after it begins. Use
`createAstroPredictionRuntime({ opaqueUserKey, prefetchRoute })` when the host has a tested loader that populates
the exact route cache consumed by committed navigation and can honor cancellation.

## Runtime lifecycle

Browser environment observation is enabled by default. The scheduler gate starts closed and opens
only when visibility, data-saving, and connection checks allow prediction. `onError` can observe
invalid link data and environment-observer failures without interrupting navigation.

The public runtime is useful for custom caches or controlled hosts. `start()` installs delegated
listeners and is idempotent. `stop()` removes listeners and cancels active schedules. `dispose()`
also disposes a runtime-owned scheduler and prevents restart. A scheduler supplied through
`scheduler` remains host-owned; `scheduler` and `createScheduler` are mutually exclusive.

`createAstroRouteCandidate()` creates normalized candidates with default policy `astro-route`,
destination equal to the absolute route, key `astro-route:${route}`, and Cogni's shared probability
and horizon defaults.
`createAstroLinkAttributes()` creates the data attributes consumed by the delegated runtime and
disables Astro's parallel link prefetch for that anchor.

## Public API

The package root exports `AstroPredictionRuntime`, `createAstroPredictionRuntime`,
`createAstroLinkAttributes`, `createAstroRouteCandidate`, and their public option and context types.
The `@inttegro/cogni-astro/client` entry point exports `installAstroPredictionRuntime` and
`uninstallAstroPredictionRuntime`. The component subpaths default-export `CogniProvider.astro` and
`PredictiveLink.astro`.

See [Candidates and reuse](/cogni/candidates-and-reuse) for accounting semantics and
[Current scope](/cogni/current-boundaries) for distribution boundaries.
