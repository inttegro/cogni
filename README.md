# Cogni

Cogni coordinates bounded predictive loading between a frontend and its
application backend. It starts only read-only work that clears an explicit
confidence gate, gives direct intent priority over background guesses, and
measures whether the eventual user action reused the result.

The frontend package is TypeScript. Backends implement the language-neutral
Cogni protocol in Go, Rust, Ruby, Node.js, or any other language. A backend
implementation remains inside the host application's authentication, resource,
and cache boundaries.

## Status

Cogni is under active extraction and is not published yet. The current API is
expected to change before the first release.

## Core coordinator

```ts
import { PredictionCoordinator } from "@inttegro/cogni";

const predictions = new PredictionCoordinator({
  maxConcurrent: 2,
  onEvent: (event) => telemetry.record(event),
});

const handle = predictions.predict(
  {
    key: "account:app_123:products",
    policy: "account-navigation",
    trigger: "pointer",
    destination: "/products",
    probability: 0.92,
    horizonMs: 5_000,
    cost: "standard",
  },
  async ({ signal }) => {
    const response = await fetch("/api/products", { signal });
    await productsCache.store(await response.json());
    return {
      materialWork: true,
      bytes: Number(response.headers.get("content-length")) || 0,
    };
  },
);

// Call this when the committed action consumes the same cached resource.
handle.markReused();
```

Cogni does not retain the response. The host cache remains the source consumed by
the application.

## Backend protocol

The language-neutral backend contract is documented in
[`protocol/README.md`](./protocol/README.md) and exercised by the shared
conformance fixtures. It defines three authenticated operations:

- capability negotiation;
- bounded execution of server-registered, read-only resources; and
- reuse outcome reporting for calibration.

Prediction results can be returned as one JSON envelope or streamed as NDJSON.
The TypeScript package provides one client binding. Other backend languages
implement the same messages and lifecycle rules without importing this package.
The host chooses all operation URLs when it creates the client; Cogni does not
reserve a URL prefix.

Resource names are opaque backend registrations, never client-provided URLs or
authorization grants. Every implementation resolves the host's normal request
identity and authorizes each resource exactly as it would authorize the
foreground request.

The contract document specifies the message fields, lifecycle ordering,
authentication requirements, fixtures, and implementation rules.

## Quality accounting

The default gates require an 80 percent probability for ordinary work and 90
percent for high-cost work. `quality()` reports reuse by prediction count and by
transferred bytes. Work that fails, expires, or is cancelled after it begins
lowers the measured reuse rate.

See [CHARTER.md](./CHARTER.md) for the operating boundaries and release standard.
