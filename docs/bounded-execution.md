---
title: Bounded execution
description: See how admission, concurrency, deadlines, and completion-order streaming keep predictive work subordinate to foreground demand.
---

Predictive work competes with foreground requests. The Node executor limits admission, concurrency,
and duration so speculation cannot take over host capacity.

## Admission

The executor sorts candidates by descending `priority`, then probability, then request order. It
prepares them in that order and asks:

- the configured ordinary and high-cost probability gates;
- `capabilities.limits.max_candidates_per_batch`;
- `capabilities.limits.max_horizon_ms`;
- registry availability; and
- resource parameter validation.

A candidate may be rejected as `below_quality_gate`, `budget_exhausted`, `unavailable`, or
`invalid_parameters` before resolution. The protocol also reserves `queue_full` and
`unsupported_representation`.

`createPredictionExecutor()` defaults to a `0.8` ordinary gate, a `0.9` high-cost gate, and four
concurrent resolvers. Configure these values through `executor` when using
`createCogniResourceServer()`:

```typescript
const server = createCogniResourceServer({
  registry: resources,
  capabilities,
  executor: {
    minimumProbability: 0.85,
    highCostMinimumProbability: 0.95,
    maxConcurrent: 3,
  },
});
```

The high-cost threshold must be at least the ordinary threshold; `maxConcurrent` must be positive.

## Capacity

`prediction.accepted` is emitted only when a resolver starts, so telemetry does not count queued
work as active work.

Resolution emits `prediction.resolved`; cancellation, expiry, or errors emit `prediction.failed`.
One final `batch.completed` event reconciles every terminal count.

## Deadlines

`horizon_ms` becomes the execution deadline. Deadline or request cancellation aborts the resolver
signal and emits `deadline_exceeded` or `cancelled`. Downstream I/O must honor the signal to release
host capacity.

## Completion order

Priority controls start order; completion controls delivery order. A fast later resolver can populate
the cache without waiting for the batch's slowest read.

## NDJSON streaming

With `Accept: application/x-ndjson`, each validated event is streamed as one JSON line.

The protocol client requests NDJSON by default and invokes `onEvent` after validating each event:

```typescript
const events = await cogniBackend.executePredictions(batch, {
  transport: "ndjson",
  async onEvent(event) {
    if (event.type === "prediction.resolved") {
      await applicationCache.store(event.resource.cache_key, event.resource.payload);
    }
  },
});
```

The promise returns the complete event array; `onEvent` receives results as they arrive.

## JSON transport

Set `transport: "json"` to request `application/json`:

```typescript
const events = await cogniBackend.executePredictions(batch, {
  transport: "json",
});
```

JSON preserves completion order but exposes results only after the batch ends. Use NDJSON when early
independent results matter.

## Sequence validation

The client and server reject unknown IDs, invalid event order, duplicate terminal events,
inconsistent summaries, and missing or non-final `batch.completed`. A stream may fail after valid
resources arrived, so cache each validated resource independently and retain foreground fallback.

## Continue

- [Backend contract](/backend-contract) defines the exact wire messages and error behavior.
- [Registered resources](/registered-resources) defines the validation and authorization boundary.
