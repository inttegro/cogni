---
title: Registered resources
description: Turn predictive backend work into a small, validated vocabulary of authorized read-only resources.
---

Predictive loading changes when a read happens, not who may perform it.
`PredictionResourceRegistry` maps opaque names to host-owned validation and resolution, preventing
the client from inventing URLs, queries, or functions.

## Resource names

A name identifies a reusable representation, not its storage. Names start with a lowercase letter,
may use lowercase letters, digits, and single `.`, `_`, or `-` separators, and are limited to 128
characters.

Registration requires a `resolve` function and rejects duplicate names:

```typescript
const resources = new PredictionResourceRegistry<AppContext>();

resources.register("products.page", {
  resolve: async ({ context, signal }) => ({
    payload: await context.products.firstPage({ signal }),
  }),
});
```

Register only reads the foreground path can reuse. Mutations and external side effects do not belong
in the registry because predictions can be wrong.

## Validate parameters

`validate` runs before `prediction.accepted`, so invalid work is never recorded as admitted.

```typescript
resources.register("orders.recent", {
  validate(parameters) {
    const limit = parameters.limit;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50) {
      throw new CogniResourceRejection("invalid_parameters");
    }
    return { limit: Number(limit) };
  },
  resolve: async ({ context, parameters, signal }) => ({
    payload: await context.orders.recent(
      { accountId: context.accountId, limit: parameters.limit },
      { signal },
    ),
  }),
});
```

`CogniResourceRejection` carries a protocol reason. Other validation errors become
`invalid_parameters`. Keep tenant identity in authenticated context, never client parameters.

## Authorize reads

Registration declares a read; it does not authorize one. Authenticate the route first, then apply
the same domain authorization as the foreground read.

```typescript
resources.register("invoice.detail", {
  validate(parameters) {
    if (typeof parameters.invoiceId !== "string" || !parameters.invoiceId) {
      throw new CogniResourceRejection("invalid_parameters");
    }
    return { invoiceId: parameters.invoiceId };
  },
  async resolve({ context, parameters, signal }) {
    await context.authorization.requireInvoiceRead(
      context.accountId,
      parameters.invoiceId,
    );
    const payload = await context.invoices.lookup(
      { accountId: context.accountId, invoiceId: parameters.invoiceId },
      { signal },
    );
    return { payload };
  },
});
```

Cogni passes context through unchanged and grants nothing from a name, cache key, or probability.
Keep authorization ahead of reads and cache writes.

## Return metadata

A resolver returns a payload plus reuse and cost metadata:

| Field          | Required | Meaning                                                                              |
| -------------- | -------- | ------------------------------------------------------------------------------------ |
| `bytes`        | No       | Non-negative integer byte count. The executor measures serialized JSON when omitted. |
| `etag`         | No       | Host-defined representation tag returned to the frontend.                            |
| `expiresAt`    | No       | RFC 3339 date-time for representation expiry.                                        |
| `materialWork` | No       | Whether the resolver incurred material work; defaults to `true`.                     |
| `payload`      | Yes      | JSON representation consumed by the frontend cache adapter.                          |

The wire response uses `snake_case`. Set `materialWork: false` for a backend cache hit so warm reads
do not distort material reuse.

## Classify failures

Throw `CogniResourceFailure` when the host can classify a resolver failure:

```typescript
throw new CogniResourceFailure("backend_error", {
  retryable: true,
  message: "The read service is temporarily unavailable",
});
```

The public event exposes only `code` and `retryable`. Unclassified errors become non-retryable
`backend_error`; cancellation and expiry become `cancelled` and `deadline_exceeded`. Failures remain
isolated per candidate.

## Propagate cancellation

Pass the resolver's `AbortSignal` into downstream calls. Cogni can stop awaiting ignored work, but it
cannot recover the host capacity that work continues to consume.

## Continue

- [Bounded execution and streaming](/bounded-execution) follows a batch from admission to completion.
- [Architecture and trust boundaries](/architecture) shows the full host security and cache flow.
