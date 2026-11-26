# Cogni server

`@inttegro/cogni-server` is the Node.js backend runtime for the Cogni protocol.
It provides route-independent handlers for capability negotiation, prediction
execution, and reuse-outcome reporting.

```sh
npm install @inttegro/cogni-server
```

Most Node hosts should start with the resource server. It keeps prediction
requests inside an explicit read-only allowlist and provides confidence gates,
concurrency bounds, deadlines, failure isolation, and completion-order streaming.

## Registered resources

```ts
import {
  PredictionResourceRegistry,
  createCogniResourceServer,
} from "@inttegro/cogni-server";

const resources = new PredictionResourceRegistry<AppContext>();
resources.register("products.page", {
  validate: parseProductsPageParameters,
  resolve: ({ context, parameters, signal }) =>
    context.products.page(parameters, { signal }).then((payload) => ({ payload })),
});

const cogni = createCogniResourceServer({
  registry: resources,
  capabilities,
  outcomes: ({ context, batch }) => context.predictions.record(batch),
});
```

Parameter validation runs before `prediction.accepted`, so invalid input can be
rejected without claiming that work started. Resolvers receive the host's
authenticated context and an abort signal. One failed or expired resource does
not fail other candidates in the batch.

The host application continues to own endpoint paths, authentication,
authorization, tenancy, and construction of the request context.

## Low-level protocol handlers

Use the lower-level runtime when the application needs to execute candidates
through its own resource layer:

```ts
import { createCogniServer } from "@inttegro/cogni-server";

const cogni = createCogniServer({
  capabilities: {
    protocol_version: "1",
    transports: ["application/json", "application/x-ndjson"],
    representations: ["application/json"],
    limits: {
      max_candidates_per_batch: 8,
      max_horizon_ms: 60_000,
    },
    outcome_reporting: true,
  },
  predictions: ({ batch, context, signal }) =>
    context.predictions.execute(batch, { signal }),
  outcomes: ({ batch, context }) => context.predictions.recordOutcomes(batch),
});

// A framework adapter authenticates the request and supplies this context.
return cogni.handlePredictions(request, authenticatedContext);
```

The prediction handler may return an iterable or async iterable. The runtime
validates its event sequence and returns either a JSON envelope or an
incremental NDJSON stream according to the frontend's `Accept` header.

The canonical, language-neutral contract is in
[`protocol/README.md`](../../protocol/README.md). This package is one
implementation of that contract, not the definition of it.
