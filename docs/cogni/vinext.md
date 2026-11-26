---
title: Vinext
description: Add bounded route prediction to a Vinext App Router application.
---

Vinext runs the Next.js API surface on Vite. That compatibility is exactly what Cogni needs:
`@inttegro/cogni-vinext` connects to Vinext's public `next/link` and `next/navigation` shims, so
predicted work lands in the same route cache that navigation consumes.

The result is a Vinext-native install without a second prediction engine and without a `next`
dependency.

## Add Cogni

```sh
npm install @inttegro/cogni-vinext
```

Mount one provider and replace ordinary links where intent should start route work:

```tsx
"use client";

import { PredictiveLink, VinextCogniProvider } from "@inttegro/cogni-vinext";

export function Navigation() {
  return (
    <VinextCogniProvider opaqueUserKey={session.opaqueUserKey}>
      <nav>
        <PredictiveLink href="/orders">Orders</PredictiveLink>
      </nav>
    </VinextCogniProvider>
  );
}
```

`PredictiveLink` waits for sustained hover and reacts immediately to focus, touch, pointer-down,
and click intent. It disables Vinext's automatic viewport prefetch on that link, which keeps the
route inside Cogni's shared budget and reuse accounting.

## Why the adapter stays small

[Vinext implements the Next.js public API](https://vinext.dev/), including the two contracts Cogni
uses: `Link.onNavigate` and `router.prefetch(href, { onInvalidate })`. Cogni therefore shares the
battle-tested Next-compatible route integration instead of inventing Vinext-only cache semantics.

The package gives Vinext users framework-specific names and peer requirements:

- `VinextCogniProvider`
- `PredictiveLink`
- `useVinextRouteIntent()`
- `useVinextDelegatedRouteIntent()`
- `useVinextRoutePrediction()`

All scheduling, browser admission, adaptive learning, cancellation, and reuse measurement still
come from the shared Cogni runtime.

## Existing link systems

Use `useVinextDelegatedRouteIntent()` once in a shared client shell when replacing every link is not
practical. It discovers same-origin links as interaction bubbles through the document. Call the
returned `markReused(href)` only after Vinext commits that destination and consumes the prefetched
route.

The default prefetch path uses Vinext's public router. Supply `prefetchRoute` only when the
application owns a tested loader that fills the same cache used by foreground navigation.

See [Candidates and reuse](/cogni/candidates-and-reuse) for the correctness rule and
[See Cogni work](/cogni/devtools) for live inspection.
