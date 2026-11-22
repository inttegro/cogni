---
title: Server API
description: Choose between the registry-backed server, a custom protocol runtime, and the lower-level executor and resource primitives.
---

Choose the registry-backed reference server or supply custom execution behind the wire handlers:

| Need                                                | Start with                   |
| --------------------------------------------------- | ---------------------------- |
| Registered resources plus the reference executor    | `createCogniResourceServer`  |
| Custom prediction execution behind Cogni's protocol | `createCogniServer`          |
| Resource registration without route handling        | `PredictionResourceRegistry` |
| Bounded execution without the server factory        | `createPredictionExecutor`   |

The unpublished package requires Node.js 20 or newer.

## Server factories

### `createCogniResourceServer`

Use the reference registry and executor.

```typescript
function createCogniResourceServer<Context>(
  options: CogniResourceServerOptions<Context>,
): CogniServer<Context>;
```

Options are:

| Field          | Type                                                        | Required |
| -------------- | ----------------------------------------------------------- | -------- |
| `capabilities` | `BackendCapabilities`                                       | Yes      |
| `executor`     | Executor options except `capabilities` and `registry`       | No       |
| `outcomes`     | Host callback receiving context, request, and outcome batch | No       |
| `registry`     | `PredictionResourceRegistry<Context>`                       | Yes      |

### `createCogniServer`

Use custom execution that emits a valid event sequence.

```typescript
function createCogniServer<Context>(
  handlers: CogniServerHandlers<Context>,
): CogniServer<Context>;
```

`CogniServerHandlers` requires:

| Field          | Type                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| `capabilities` | Capabilities value or async-capable function receiving request and context. |
| `outcomes`     | Async-capable function receiving validated outcome input.                   |
| `predictions`  | Function returning an iterable, async iterable, or promise of either.       |

Both factories return:

```typescript
interface CogniServer<Context> {
  handleCapabilities(request: Request, context: Context): Promise<Response>;
  handleOutcomes(request: Request, context: Context): Promise<Response>;
  handlePredictions(request: Request, context: Context): Promise<Response>;
}
```

The host chooses routes, authenticates requests, and constructs `Context`.

## Resource registry

### `PredictionResourceRegistry`

The registry maps stable names to host validation and resolution. Authorization remains host-owned.

```typescript
const registry = new PredictionResourceRegistry<Context>();
```

Methods:

- `definition(name: string): PredictionResourceDefinition<Context> | undefined`
- `has(name: string): boolean`
- `register<Parameters>(name, definition): this`

`PredictionResourceDefinition` has optional `validate(parameters)` and required `resolve(input)`.
`validate` receives a read-only JSON object. `resolve` receives:

| Field        | Type                             |
| ------------ | -------------------------------- |
| `batch`      | `PredictionBatchRequest`         |
| `cacheKey`   | `string`                         |
| `candidate`  | `PredictionCandidateRequest`     |
| `context`    | Host `Context`                   |
| `parameters` | Validated generic parameter type |
| `request`    | Fetch `Request`                  |
| `signal`     | `AbortSignal`                    |

The resolver returns `PredictionResourceResult` with required `payload` and optional `bytes`, `etag`,
`expiresAt`, and `materialWork`.

### `CogniResourceRejection`

```typescript
new CogniResourceRejection(reason: PredictionRejectionReason, message?: string)
```

Throw from parameter validation to produce a candidate rejection reason without acceptance.

### `CogniResourceFailure`

```typescript
new CogniResourceFailure(
  code: PredictionFailureCode,
  options?: { message?: string; retryable?: boolean },
)
```

Throw from a resolver to produce a classified `prediction.failed` event. `retryable` defaults to
`false`.

## Executor

### `createPredictionExecutor`

The executor applies confidence gates, concurrency, cancellation, and deadlines.

```typescript
function createPredictionExecutor<Context>(
  options: PredictionExecutorOptions<Context>,
): PredictionExecutor<Context>;
```

Options:

| Field                        | Type                                  | Default                              |
| ---------------------------- | ------------------------------------- | ------------------------------------ |
| `capabilities`               | `BackendCapabilities`                 | Required                             |
| `highCostMinimumProbability` | `number`                              | At least `0.9` and the ordinary gate |
| `maxConcurrent`              | `number`                              | `4`                                  |
| `minimumProbability`         | `number`                              | `0.8`                                |
| `now`                        | `() => number`                        | `Date.now`                           |
| `registry`                   | `PredictionResourceRegistry<Context>` | Required                             |

The returned executor exposes:

```typescript
interface PredictionExecutor<Context> {
  execute(input: PredictionExecutorInput<Context>): AsyncIterable<PredictionEvent>;
}
```

`PredictionExecutorInput` contains `batch`, `context`, `request`, and `signal`.

## Errors

### `CogniServerError`

```typescript
new CogniServerError(problem: Problem)
```

This becomes `application/problem+json`. Validation failures use HTTP 400; uncaught failures become
a generic HTTP 500 without internal details.

## Input types

| Export                          | Fields                                  |
| ------------------------------- | --------------------------------------- |
| `CogniOutcomeInput<Context>`    | `batch`, `context`, `request`           |
| `CogniPredictionInput<Context>` | `batch`, `context`, `request`, `signal` |
| `CogniServerInput<Context>`     | `context`, `request`                    |

Additional server type exports are `CogniResourceServerOptions`, `CogniServer`,
`CogniServerHandlers`, `PredictionExecutor`, `PredictionExecutorInput`, `PredictionExecutorOptions`,
`PredictionResourceDefinition`, `PredictionResourceInput`, and `PredictionResourceResult`.

## Protocol types

The package re-exports these version 1 types:

`BackendCapabilities`, `PredictionAcceptedEvent`, `PredictionBatchCompletedEvent`,
`PredictionBatchRequest`, `PredictionBatchResponse`, `PredictionBatchSummary`,
`PredictionCandidateRequest`, `PredictionCost`, `PredictionEvent`, `PredictionFailedEvent`,
`PredictionFailureCode`, `PredictionOutcome`, `PredictionOutcomeBatch`, `PredictionOutcomeRecord`,
`PredictionRejectedEvent`, `PredictionRejectionReason`, `PredictionResolvedEvent`, `PredictionWork`,
`Problem`, `ProtocolVersion`, `ResolvedResource`, and `ResourceRequest`.

Their wire fields and lifecycle rules are documented in the [backend contract](/backend-contract).
