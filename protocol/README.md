# Cogni backend protocol

This document and the files in `conformance/` define the language-neutral
contract between Cogni frontends and backend implementations. TypeScript, Go,
Rust, Ruby, and other bindings must preserve these messages and lifecycle rules
rather than redefine them.

Protocol field names use `snake_case`. All request and response bodies are
UTF-8 JSON unless the prediction response uses NDJSON. Unknown fields must be
ignored when reading a message so compatible fields can be added in a minor
release. Required fields must not be omitted.

## Operations

- `capabilities` negotiates protocol limits and transports.
- `predictions` evaluates read-only resource candidates and returns lifecycle
  events as JSON or an NDJSON stream.
- `outcomes` reports whether resolved work was reused.

Cogni does not reserve URL paths. The host supplies the location of each
operation when it creates the frontend client. Relative paths, origin-relative
paths, and absolute URLs are valid according to the host's `fetch`
implementation. Version 1 uses POST for all three operations.

```ts
createCogniBackendClient({
  routes: {
    capabilities: "/internal/predict/capabilities",
    predictions: "/internal/predict/execute",
    outcomes: "/internal/predict/outcomes",
  },
});
```

## Common fields

- `protocol_version` is the string `"1"` in every protocol message.
- `request_id` is a non-empty, caller-generated identifier no longer than 128
  characters. It correlates one prediction batch and its outcomes.
- `prediction_id` is unique within a request and no longer than 128 characters.
- Timestamps are RFC 3339 strings in UTC.
- Durations and horizons are integer milliseconds. Byte counts are
  non-negative integers.

## Capabilities

The `capabilities` operation has no Cogni request body. A successful response
is `application/json`:

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

At least one transport and representation is required. Version 1 supports JSON
resource representations. A frontend must stay within the advertised limits.

## Prediction request

The `predictions` operation receives `application/json`:

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
        "parameters": { "account_id": "app_123" }
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

The batch contains 1 to 16 candidates. `probability` is between 0 and 1.
`horizon_ms` is between 1 and 60000. `cost` is `low`, `standard`, or `high`.
Optional `priority` is an integer from -100 to 100 and defaults to 0. Optional
`estimated_bytes` is a non-negative integer and defaults to 0.

Resource names start with a lowercase letter and contain lowercase letters,
digits, `.`, `_`, or `-`; separators cannot repeat or end the name. Names are
no longer than 128 characters. Cache keys are non-empty and no longer than 512
characters. Parameters are a JSON object interpreted and validated by the
registered resource.

## Prediction events

A successful prediction request returns either:

- `application/json` with `protocol_version`, `request_id`, and an ordered
  `events` array; or
- `application/x-ndjson` with one complete event object per non-empty line.

Every event contains `protocol_version`, `request_id`, `type`, and `at`.
Candidate events also contain `prediction_id`.

### `prediction.accepted`

The backend accepted the candidate. `expires_at` is required. Accepted work
must later produce exactly one resolved or failed event.

### `prediction.resolved`

The event follows acceptance and contains:

- `resource.name`, `resource.cache_key`, `resource.media_type`, and
  `resource.payload`;
- optional `resource.etag` and `resource.expires_at`; and
- `work.material_work`, `work.bytes`, and `work.duration_ms`.

Version 1 requires `resource.media_type` to be `application/json`. The cache key
must identify the representation the normal foreground path consumes.

### `prediction.rejected`

The candidate did not start. `reason` is one of `below_quality_gate`,
`budget_exhausted`, `queue_full`, `unavailable`, `invalid_parameters`, or
`unsupported_representation`.

### `prediction.failed`

Accepted work failed. `code` is `cancelled`, `deadline_exceeded`, or
`backend_error`; `retryable` is a boolean. Predictive failure must not affect
the ordinary foreground request.

### `batch.completed`

This is emitted exactly once and is always the last event. Its `summary`
contains non-negative `accepted`, `resolved`, `rejected`, and `failed` counts
that match the preceding events.

## Outcomes

The `outcomes` operation receives an outcome batch with `protocol_version`, the
original `request_id`, and one or more records:

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

`outcome` is `reused`, `missed`, `expired`, or `cancelled`. Optional
`lead_time_ms` is a non-negative integer. A successful backend returns HTTP 204
with no body.

## Errors

Protocol-level failures use HTTP status codes and `application/problem+json`
with `type`, `title`, and `status`; `detail`, `instance`, and extension fields
are optional. Implementations use 400 for invalid messages, 401 or 403 for host
authentication and authorization failures, 413 for an oversized batch, and 429
when predictive work is overloaded. A 429 response may include `Retry-After` in
seconds.

## Resource registry

Each backend owns a registry of read-only resources. A resource name is an
opaque identifier such as `product-catalog`; it is never a URL, function name,
database query, or authorization grant. The backend validates the supplied
parameters, resolves tenancy from the authenticated host request, and applies
its own confidence and resource budgets before starting work.

The same resource name and cache key must describe the representation consumed
by the frontend's ordinary navigation path. A result placed in a separate cache
or returned in a shape the destination cannot reuse is a miss.

## Authentication and safety

The host application authenticates every protocol operation with its existing
session or service mechanism. Cogni payloads never contain credentials. A
backend must authorize each candidate exactly as it would authorize the
corresponding foreground read and must not reveal whether an inaccessible
resource exists.

Only reads may be registered. Backend implementations must reject resources
that mutate state, send messages, charge money, publish content, or trigger any
other external side effect.

## Streaming

The frontend requests `application/x-ndjson` in the prediction operation's
`Accept` header. The backend keeps that HTTP response open and writes each
completed event as one JSON object followed by a newline. The client consumes
the response incrementally through the Fetch `ReadableStream`; it does not wait
for the entire response body.

Events for different candidates may interleave, but each candidate must be
accepted before it resolves or fails. Rejected candidates are terminal.
`batch.completed` is emitted exactly once and is always the final event.

Version 1 streaming is NDJSON over the prediction response. It does not require
Server-Sent Events, WebSockets, or a second streaming endpoint.

JSON transport returns the same ordered events in a single envelope. It exists
for simple implementations and tests; streaming is preferred when results have
meaningfully different completion times.

## Conformance

The `conformance` directory contains transport-neutral JSON and NDJSON fixtures.
Backend implementations must be able to read the request fixtures and produce
equivalent lifecycle ordering, status semantics, and validation behavior. The
fixtures are examples of the contract, not a resource registry that production
servers must expose.
