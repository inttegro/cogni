---
title: Backend protocol
description: Implement the three operations that let a Cogni frontend negotiate limits, execute registered reads, and report observed reuse.
---

Protocol version 1 lets any backend language support a Cogni frontend through three HTTP operations.
It uses UTF-8 JSON, `snake_case` fields, and `POST`; readers ignore unknown fields but enforce all
required fields.

## Route map

Cogni reserves no path prefix. The host supplies all three routes during initialization:

```typescript
import { createCogniBackendClient } from "@inttegro/cogni-client/protocol";

const backend = createCogniBackendClient({
  routes: {
    capabilities: "/internal/predict/capabilities",
    outcomes: "/internal/predict/outcomes",
    predictions: "/internal/predict/execute",
  },
});
```

Routes may be relative or absolute. Protect them with host authentication; credentials never belong
in Cogni payloads.

## Common identifiers

| Field              | Rule                                                            |
| ------------------ | --------------------------------------------------------------- |
| `prediction_id`    | Caller-generated, unique within a request, 1 to 128 characters. |
| `protocol_version` | The string `"1"`.                                               |
| `request_id`       | Caller-generated correlation ID, 1 to 128 characters.           |

`request_id` identifies a batch; `prediction_id` follows one candidate. Timestamps use RFC 3339,
durations use integer milliseconds, and byte counts are non-negative integers.

## Capabilities

The frontend first negotiates transports, representations, and limits. The request has no Cogni
body; the response uses `application/json`:

```json
{
  "protocol_version": "1",
  "transports": ["application/json", "application/x-ndjson"],
  "representations": ["application/json"],
  "limits": {
    "max_candidates_per_batch": 8,
    "max_horizon_ms": 60000
  },
  "outcome_reporting": true
}
```

At least one transport and representation is required. The frontend must honor advertised limits.

## Predictions

Predictions submit a bounded set of registered reads as `application/json`:

```json
{
  "protocol_version": "1",
  "request_id": "req_01",
  "candidates": [
    {
      "prediction_id": "pred_01",
      "resource": {
        "name": "product-catalog",
        "cache_key": "account:app_123:products",
        "parameters": { "page": 1 }
      },
      "policy": "account-navigation",
      "trigger": "pointer",
      "probability": 0.92,
      "horizon_ms": 5000,
      "cost": "standard",
      "priority": 20,
      "estimated_bytes": 24000
    }
  ]
}
```

The wire format accepts 1 to 16 candidates:

| Field             | Required | Rule                                                                |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `cost`            | Yes      | `low`, `standard`, or `high`.                                       |
| `estimated_bytes` | No       | Non-negative integer; defaults to `0` by convention.                |
| `horizon_ms`      | Yes      | Integer from `1` through `60000`, also within the advertised limit. |
| `policy`          | Yes      | Non-empty host policy name.                                         |
| `prediction_id`   | Yes      | Unique request-local identifier.                                    |
| `priority`        | No       | Integer from `-100` through `100`; defaults to `0`.                 |
| `probability`     | Yes      | Finite number from `0` through `1`.                                 |
| `resource`        | Yes      | Registered name, reusable cache key, and optional parameter object. |
| `trigger`         | Yes      | Non-empty host signal name.                                         |

Resource names use lowercase letters and digits with single `.`, `_`, or `-` separators and are at
most 128 characters. `cache_key` is 1 to 512 characters; parameters are resource-defined JSON.

### Event sequence

JSON returns an ordered `events` array; NDJSON sends the same events one per line. Common fields are
`at`, `protocol_version`, `request_id`, and `type`; candidate events add `prediction_id`.

| Event                 | Semantics                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `batch.completed`     | Exactly one final event with matching `accepted`, `failed`, `rejected`, and `resolved` counts.   |
| `prediction.accepted` | Work was admitted; includes `expires_at` and must be followed by one resolved or failed event.   |
| `prediction.failed`   | Accepted work ended with `backend_error`, `cancelled`, or `deadline_exceeded`, plus `retryable`. |
| `prediction.rejected` | Work did not start; includes a defined rejection `reason`.                                       |
| `prediction.resolved` | Accepted work returned a reusable JSON resource and measured work metadata.                      |

A resolved resource contains `name`, `cache_key`, `payload`, `media_type`, optional expiry metadata,
and measured `work`.

Rejection reasons are `below_quality_gate`, `budget_exhausted`, `invalid_parameters`, `queue_full`,
`unavailable`, and `unsupported_representation`.

Candidate events may interleave, but resolution or failure must follow acceptance. Rejection is
terminal.

### Delivery modes

Return `application/x-ndjson` when the request accepts it and the implementation supports streaming.
Write every event as one complete JSON object followed by `\n`, flushing as results complete. Return
`application/json` with this envelope for buffered transport:

```json
{
  "protocol_version": "1",
  "request_id": "req_01",
  "events": []
}
```

Both transports preserve the lifecycle. NDJSON exposes completed resources while slower work
continues.

## Outcome reporting

The frontend reports whether resolved data was actually consumed:

```json
{
  "protocol_version": "1",
  "request_id": "req_01",
  "outcomes": [
    {
      "prediction_id": "pred_01",
      "outcome": "reused",
      "observed_at": "2026-11-22T12:00:01Z",
      "lead_time_ms": 340
    }
  ]
}
```

Each batch contains at least one outcome:

| Field           | Required | Rule                                           |
| --------------- | -------- | ---------------------------------------------- |
| `lead_time_ms`  | No       | Non-negative integer.                          |
| `observed_at`   | Yes      | RFC 3339 date-time.                            |
| `outcome`       | Yes      | `cancelled`, `expired`, `missed`, or `reused`. |
| `prediction_id` | Yes      | Identifier from the original prediction batch. |

Success is HTTP 204. Foreground navigation never waits for outcome reporting.

## Errors

Protocol failures use HTTP status codes and `application/problem+json`. Problems require `status`,
`title`, and `type`.

Use HTTP 400 for invalid messages, 401 or 403 for host authentication or authorization failures, 413
for a batch outside the wire limit, and 429 when predictive work is overloaded. A 429 response may
include `Retry-After` in seconds.

Candidate failures belong in `prediction.failed`; malformed requests, authentication failures, and
whole-request overload remain HTTP errors.

## Conformance

A conforming backend must:

1. Authenticate the host request and resolve tenancy before predictive data access.
2. Parse protocol version 1 while ignoring unknown fields and enforcing required fields.
3. Apply advertised batch and horizon limits plus bounded concurrency and backpressure.
4. Resolve only server-registered read-only resource names.
5. Validate parameters and apply the same authorization as the foreground read.
6. Propagate request cancellation and enforce each candidate deadline.
7. Emit candidate terminal events in completion order while preserving per-candidate ordering.
8. End every successful prediction response with one consistent `batch.completed` event.
9. Accept and persist outcome reports without making foreground navigation depend on them.

`protocol/conformance` contains canonical capability, prediction, event, and outcome fixtures.

## Continue

- [Node server quickstart](/server-quickstart) uses the reference Node implementation.
- [Bounded execution and streaming](/bounded-execution) explains the Node executor's batch behavior.
- [Client API reference](/client-api#backend-protocol) documents the TypeScript protocol
  binding.
