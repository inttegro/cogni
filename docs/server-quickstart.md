---
title: Server quickstart
description: Register one read-only resource, keep authentication with the host, and expose the three protocol operations on your own routes.
---

The frontend asks for a registered name such as `products.page`; the host decides what that name
means inside an authenticated context. This keeps storage, tenancy, and authorization on the server.

<Warning>
  `@inttegro/cogni-server` is not published to npm yet. Run this example from a workspace or local
  package link that resolves the current Cogni server package. The package requires Node.js 20 or
  newer.
</Warning>

## Preserve authority

You need:

- A Node.js 20 or newer application using Fetch `Request` and `Response` objects.
- Existing authentication and tenancy resolution in the host route layer.
- A read service that accepts an `AbortSignal`.
- A frontend cache representation that can consume the returned JSON payload.

## Register a resource

The registry is an allowlist, not a router. This example validates the page and derives the account
from authenticated context:

```typescript
import {
  CogniResourceRejection,
  PredictionResourceRegistry,
  createCogniResourceServer,
  type BackendCapabilities,
} from "@inttegro/cogni-server";

interface Product {
  id: string;
  name: string;
}

interface AppContext {
  accountId: string;
  products: {
    page(
      input: { accountId: string; page: number },
      options: { signal: AbortSignal },
    ): Promise<{ products: Product[] }>;
  };
  predictionOutcomes: {
    record(requestId: string, outcomes: readonly unknown[]): Promise<void>;
  };
}

type ProductsPageParameters = Readonly<Record<string, unknown>> & {
  readonly page: number;
};

const capabilities: BackendCapabilities = {
  protocol_version: "1",
  transports: ["application/json", "application/x-ndjson"],
  representations: ["application/json"],
  limits: {
    max_candidates_per_batch: 8,
    max_horizon_ms: 60_000,
  },
  outcome_reporting: true,
};

const resources = new PredictionResourceRegistry<AppContext>();

resources.register<ProductsPageParameters>("products.page", {
  validate(parameters) {
    if (!Number.isInteger(parameters.page) || Number(parameters.page) < 1) {
      throw new CogniResourceRejection("invalid_parameters");
    }
    return { page: Number(parameters.page) };
  },
  async resolve({ context, parameters, signal }) {
    const payload = await context.products.page(
      { accountId: context.accountId, page: parameters.page },
      { signal },
    );
    return { payload };
  },
});

export const cogni = createCogniResourceServer({
  registry: resources,
  capabilities,
  executor: { maxConcurrent: 4 },
  outcomes: async ({ context, batch }) => {
    await context.predictionOutcomes.record(batch.request_id, batch.outcomes);
  },
});
```

Validation runs before `prediction.accepted`. The resolver receives authenticated context, validated
parameters, request metadata, the host cache key, and a deadline-aware signal. The executor measures
serialized bytes when `bytes` is omitted; `materialWork` defaults to `true`.

## Mount the operations

Cogni defines operations, not paths. Mount all three behind the host's authentication middleware:

```typescript
type CogniOperation = "capabilities" | "outcomes" | "predictions";

export const cogniRoutes = {
  capabilities: "/internal/predict/capabilities",
  outcomes: "/internal/predict/outcomes",
  predictions: "/internal/predict/execute",
} as const;

export function handleAuthenticatedCogniRequest(
  operation: CogniOperation,
  request: Request,
  context: AppContext,
): Promise<Response> {
  switch (operation) {
    case "capabilities":
      return cogni.handleCapabilities(request, context);
    case "outcomes":
      return cogni.handleOutcomes(request, context);
    case "predictions":
      return cogni.handlePredictions(request, context);
  }
}
```

Build `AppContext` from the same account, permissions, and read services as the foreground route.
All operations use `POST`; predictions stream NDJSON when requested and otherwise return JSON.

## Connect the client

Initialize the client with the same route map:

```typescript
import { createCogniBackendClient } from "@inttegro/cogni-client/protocol";

export const cogniBackend = createCogniBackendClient({
  routes: cogniRoutes,
});

const negotiated = await cogniBackend.capabilities();
console.info(negotiated.limits);
```

The client defaults to `credentials: "same-origin"`. Cross-origin authentication and extra headers
remain host decisions.

## Continue

- [Registered resources](/registered-resources) covers validation, authorization, result metadata,
  and explicit failures.
- [Bounded execution and streaming](/bounded-execution) explains batch ordering, deadlines,
  cancellation, JSON, and NDJSON.
- [Backend contract](/backend-contract) defines the language-neutral wire behavior.
- [Server API reference](/server-api) lists the current Node exports.
