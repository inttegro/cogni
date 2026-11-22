---
title: Client quickstart
description: Begin one bounded read, place it where navigation will look, and report reuse only when the foreground path consumes it.
---

Start with one route whose reuse you can prove. A likely Products navigation begins one bounded read,
writes to the foreground cache, and reports whether navigation consumed it.

<Warning>
  `@inttegro/cogni-client` is not published to npm yet. Run this example from a workspace or local
  package link that resolves the current Cogni client package. Do not add a registry install step
  until a release is published.
</Warning>

## Find the cache

First identify where ordinary navigation reads this data. Prediction must populate that exact place.
Here, a `Map` represents the router or query cache, and one key identifies an account's first
Products page.

You need:

- A TypeScript application with `fetch` and `AbortController`.
- A read-only endpoint or router prefetch function.
- A host-owned cache that ordinary navigation already consumes.
- A stable key that includes every tenant and input dimension needed to identify one reusable
  representation.

## Create the coordinator

Create one coordinator for the application scope so candidates share a concurrency and queue budget:

```typescript
import {
  PredictionCoordinator,
  type PredictionCandidate,
  type PredictionEvent,
  type PredictionWorkResult,
} from "@inttegro/cogni-client";

interface Product {
  id: string;
  name: string;
}

interface ProductsPage {
  products: Product[];
}

const cacheKey = "account:app_123:products:first-page";
const productsCache = new Map<string, ProductsPage>();

function recordPredictionEvent(event: PredictionEvent): void {
  console.info("cogni", event.type, event.candidate.key);
}

const predictions = new PredictionCoordinator({
  maxConcurrent: 2,
  onEvent: recordPredictionEvent,
});

const candidate: PredictionCandidate = {
  key: cacheKey,
  policy: "account-navigation",
  trigger: "pointer",
  destination: "/products",
  probability: 0.92,
  horizonMs: 5_000,
  cost: "standard",
  estimatedBytes: 24_000,
  priority: 20,
};

async function loadProducts(signal: AbortSignal): Promise<PredictionWorkResult> {
  const response = await fetch("/api/products?page=1", { signal });
  if (!response.ok) {
    throw new Error(`Products request failed with HTTP ${response.status}`);
  }

  const page = (await response.json()) as ProductsPage;
  productsCache.set(cacheKey, page);

  const header = response.headers.get("content-length");
  const bytes = header === null ? undefined : Number(header);
  return {
    materialWork: true,
    ...(typeof bytes === "number" && Number.isInteger(bytes) && bytes >= 0
      ? { bytes }
      : {}),
  };
}

const prediction = predictions.predict(candidate, ({ signal }) => loadProducts(signal));

export async function openProducts(): Promise<ProductsPage> {
  const predicted = productsCache.get(cacheKey);
  if (predicted) {
    prediction.markReused();
    return predicted;
  }

  // The committed foreground path remains available after a miss or failure.
  const response = await fetch("/api/products?page=1");
  if (!response.ok) {
    throw new Error(`Products request failed with HTTP ${response.status}`);
  }
  const page = (await response.json()) as ProductsPage;
  productsCache.set(cacheKey, page);
  return page;
}
```

`openProducts()` calls `markReused()` only after reading the predicted cache entry. The coordinator
controls the loader lifecycle but never owns `ProductsPage`. The ordinary `fetch` remains available
after a miss or failure.

## Inspect outcomes

Every handle exposes a terminal `completion` promise, and the coordinator keeps bounded quality
history:

```typescript
const result = await prediction.completion;
console.info(result.outcome, result.bytes, result.materialWork);

const quality = predictions.quality({ policy: "account-navigation" });
console.info({
  byteReuseRate: quality.byteReuseRate,
  reuseRate: quality.reuseRate,
});
```

After loading, the prediction remains in `waiting_for_reuse` until the host calls `markReused()` or
the horizon expires.

Material work that reaches the horizon without reuse becomes `missed`. Work reported with
`materialWork: false` represents an already-warm host cache and stays outside the material reuse
denominator.

## Dispose cleanly

Call `dispose()` when the application shell that owns the coordinator is destroyed:

```typescript
predictions.dispose();
```

Disposal rejects new work and aborts active loaders. Pass the loader's `signal` into cancellable I/O.

## Continue

- [Candidates and reuse](/candidates-and-reuse) defines candidate fields and accounting semantics.
- [Scheduling and direct intent](/scheduling-and-intent) adds activity-aware delays and escalation.
- [Browser runtime and navigation metrics](/browser-and-navigation) connects visibility, connection,
  idle scheduling, and lead-time measurement.
- [Client API reference](/client-api) lists the current package exports.
