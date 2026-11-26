# @inttegro/cogni-vinext

Vinext App Router support for Cogni predictive loading.

```sh
npm install @inttegro/cogni-vinext
```

Vinext reimplements the public Next.js API on Vite. Cogni uses that compatibility boundary rather
than maintaining a second router implementation: `PredictiveLink` uses Vinext's `next/link` shim,
and route work enters the cache through Vinext's `next/navigation` router.

```tsx
"use client";

import { PredictiveLink, VinextCogniProvider } from "@inttegro/cogni-vinext";

export function Navigation() {
  return (
    <VinextCogniProvider opaqueUserKey={session.opaqueUserKey}>
      <PredictiveLink href="/orders">Orders</PredictiveLink>
    </VinextCogniProvider>
  );
}
```

`PredictiveLink` disables Vinext's automatic viewport prefetch by default, waits for sustained
hover, escalates direct intent immediately, shares Cogni's prediction budget, and records reuse only
after Vinext accepts the navigation. Existing link systems can use
`useVinextDelegatedRouteIntent()` once in a shared shell.

The package deliberately reuses `@inttegro/cogni-next` internally because Vinext's supported public
contract is the same. The Vinext package supplies framework-specific peer metadata and names without
forking prediction policy, cache semantics, or reuse accounting.
