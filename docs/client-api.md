---
title: Client API
description: Choose the client primitive that answers whether work may run, when it should start, and whether the result helped.
---

Start with the integration question:

| Question                                           | Primitive                         |
| -------------------------------------------------- | --------------------------------- |
| Does this candidate deserve bounded capacity?      | `PredictionCoordinator`           |
| Is now a responsible time to start it?             | `PredictionScheduler`             |
| Has indirect interest become direct intent?        | `IntentPrefetchController`        |
| Did predictive work start and settle early enough? | `NavigationMetrics`               |
| Should browser conditions veto prediction?         | `@inttegro/cogni-client/browser`  |
| How does the client call a Cogni backend?          | `@inttegro/cogni-client/protocol` |

The client exposes four entry points. During the `0.x` series, minor releases may change public APIs
and will include migration notes in the changelog.

## Core

Import framework-neutral primitives from `@inttegro/cogni-client`.

### `PredictionCoordinator`

The coordinator admits, deduplicates, bounds, and records predictions.

```typescript
new PredictionCoordinator(options?: PredictionCoordinatorOptions)
```

Methods:

- `cancel(key: string): void` cancels active work by stable key.
- `dispose(): void` rejects new work and cancels active work.
- `markReused(key: string): boolean` attributes reuse to active work.
- `predict(candidate: PredictionCandidate, loader: PredictionLoader): PredictionHandle` admits or
  rejects a candidate.
- `quality(filter?: PredictionQualityFilter): PredictionQualitySnapshot` summarizes bounded terminal
  history.
- `subscribe(listener: PredictionEventListener): () => void` observes lifecycle events without
  replacing the host's `onEvent` callback.

`PredictionCoordinatorOptions` fields:

| Field                        | Type                               | Default                                        |
| ---------------------------- | ---------------------------------- | ---------------------------------------------- |
| `highCostMinimumProbability` | `number`                           | At least `0.9` and at least the ordinary gate. |
| `maxConcurrent`              | `number`                           | `2`                                            |
| `maxHistory`                 | `number`                           | `1000`                                         |
| `maxQueued`                  | `number`                           | `16`                                           |
| `minimumProbability`         | `number`                           | `0.8`                                          |
| `onEvent`                    | `(event: PredictionEvent) => void` | None                                           |
| `runtime`                    | `PredictionRuntime`                | System clock and timers                        |

### `PredictionScheduler`

The scheduler waits for configured delays, idle time, foreground quiet, and allowed environments.

```typescript
new PredictionScheduler(options?: PredictionSchedulerOptions)
```

Members:

- `cancel(key: string): void` cancels pending or coordinator-owned work.
- `coordinator: PredictionCoordinator` returns the underlying coordinator.
- `dispose(): void` cancels pending work and disposes an internally created coordinator.
- `environmentAllowed: boolean` returns the current environment gate.
- `foregroundActivity: number` returns the current foreground count.
- `schedule(candidate, loader, options?): ScheduledPrediction` schedules one candidate.
- `setEnvironmentAllowed(allowed: boolean): void` updates the environment gate.
- `setForegroundActivity(count: number): void` updates the non-negative active foreground count.
- `subscribe(listener: PredictionSchedulerEventListener): () => void` observes scheduling and gate
  changes.

`PredictionSchedulerOptions` fields:

| Field                | Type                                        | Default                                      |
| -------------------- | ------------------------------------------- | -------------------------------------------- |
| `coordinator`        | `PredictionCoordinator`                     | A new coordinator                            |
| `coordinatorOptions` | `PredictionCoordinatorOptions`              | Coordinator defaults                         |
| `environmentAllowed` | `boolean`                                   | `true`                                       |
| `foregroundActivity` | `number`                                    | `0`                                          |
| `onEvent`            | `(event: PredictionSchedulerEvent) => void` | None                                         |
| `runtime`            | `PredictionSchedulerRuntime`                | System timers with timer-based idle fallback |

`PredictionScheduleOptions` fields:

| Field                   | Type      | Default          |
| ----------------------- | --------- | ---------------- |
| `allowDuringForeground` | `boolean` | `false`          |
| `delayMs`               | `number`  | `0`              |
| `idle`                  | `boolean` | `true`           |
| `idleTimeoutMs`         | `number`  | `2500`           |
| `maxDeferMs`            | `number`  | No maximum defer |

### `IntentPrefetchController`

This controller coalesces hover, focus, touch, and pointer signals into one callback.

```typescript
new IntentPrefetchController<Value>(
  options: IntentPrefetchControllerOptions<Value>,
)
```

Methods:

- `cancel(): void` cancels a pending delayed run.
- `dispose(): void` cancels pending work and ignores future calls.
- `runNow(value: Value): void` cancels pending delay and executes immediately.
- `schedule(value: Value): void` replaces any pending value and runs after `delayMs`.

Options are `delayMs` with a 120 ms default, required `run`, optional `onError`, and optional
`PredictionRuntime`.

### `NavigationMetrics`

Navigation metrics measure lead time. Pair them with coordinator outcomes to measure useful reuse.

```typescript
new NavigationMetrics(options?: NavigationMetricsOptions)
```

Methods:

- `clear(key?: string): void`
- `recordNavigationCompleted(key: string, at?: number): NavigationMetric | undefined`
- `recordNavigationStarted(key: string, at?: number): void`
- `recordPrefetchSettled(key: string, at?: number): void`
- `recordPrefetchStarted(key: string, at?: number): void`

`NavigationMetricsOptions` fields are `maxPending` with default `24`, `now`, `onComplete`, and
`ttlMs` with default `120000`.

### Main type exports

All current main-entry type exports are listed below.

| Export                                   | Purpose                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `CandidateRanker<Context>`               | Optional interface that orders a host allowlist and returns a ranking or `null`.  |
| `CandidateRankingCandidate`              | Candidate `id` and short `description` supplied to a ranker.                      |
| `CandidateRankingInput<Context>`         | Candidates, privacy-reviewed context, and abort signal.                           |
| `CandidateRankingResult`                 | Every candidate ID in ranked order and optional bounded `intent`.                 |
| `IntentPrefetchControllerOptions<Value>` | Intent run function, delay, runtime, and error callback.                          |
| `NavigationMetric`                       | Completed navigation and optional prefetch timing fields.                         |
| `NavigationMetricsOptions`               | Clock, capacity, TTL, and completion callback.                                    |
| `PredictionCancellationReason`           | `cancelled_by_host`, `coordinator_disposed`, or `superseded_by_committed_action`. |
| `PredictionCandidate`                    | Host candidate identity, quality, cost, priority, and horizon.                    |
| `PredictionCoordinatorOptions`           | Coordinator gates, bounds, runtime, history, and event callback.                  |
| `PredictionCost`                         | `low`, `standard`, or `high`.                                                     |
| `PredictionEvent`                        | Union of coordinator lifecycle events.                                            |
| `PredictionEventListener`                | Observer for coordinator lifecycle events.                                        |
| `PredictionExecution`                    | Normalized candidate, abort signal, and start timestamp passed to a loader.       |
| `PredictionHandle`                       | Candidate, status, completion, reuse, and cancellation controls.                  |
| `PredictionLifecycleEvent<Type>`         | Typed lifecycle event for one event name.                                         |
| `PredictionLoader`                       | Function from `PredictionExecution` to optional work metadata.                    |
| `PredictionOutcome`                      | `cancelled`, `expired`, `failed`, `missed`, `rejected`, or `reused`.              |
| `PredictionQualityFilter`                | Optional `cost`, `destination`, `policy`, and `trigger` filter.                   |
| `PredictionQualitySnapshot`              | Count and byte reuse accounting.                                                  |
| `PredictionRejectionReason`              | `below_quality_gate`, `disposed`, or `queue_full`.                                |
| `PredictionRuntime`                      | Injectable `now()` and delayed `schedule()` contract.                             |
| `PredictionScheduleOptions`              | Delay, idle, maximum defer, and foreground settings.                              |
| `NormalizedPredictionScheduleOptions`    | Fully normalized scheduler options recorded in scheduling events.                 |
| `PredictionSchedulerCancellationReason`  | Why pending scheduling stopped before coordinator execution.                      |
| `PredictionSchedulerEvent`               | Union of scheduling, escalation, gate, and cancellation events.                   |
| `PredictionSchedulerEventListener`       | Observer for scheduler events.                                                    |
| `PredictionSchedulerStartMode`           | Gate that allowed the scheduled prediction to start.                              |
| `PredictionScheduledTask`                | Cancel function returned by a runtime schedule.                                   |
| `PredictionSchedulerOptions`             | Coordinator, runtime, and initial gate state.                                     |
| `PredictionSchedulerRuntime`             | `PredictionRuntime` plus `scheduleIdle()`.                                        |
| `PredictionStatus`                       | `queued`, `running`, `terminal`, or `waiting_for_reuse`.                          |
| `PredictionTerminalResult`               | Terminal timestamps, work metadata, outcome, and optional reason or error.        |
| `PredictionWorkResult`                   | Optional actual `bytes` and `materialWork`.                                       |
| `RequiredPredictionCandidate`            | Candidate with normalized cost, priority, and estimated bytes.                    |
| `ScheduledPrediction`                    | Pending schedule status, start promise, escalation, and cancellation.             |
| `ScheduledPredictionStatus`              | `cancelled`, `pending`, or `started`.                                             |

## Browser

Import from `@inttegro/cogni-client/browser` to apply visibility, connection, and idle signals.

Functions:

- `browserAllowsPrediction(environment?): boolean`
- `createBrowserPredictionSchedulerRuntime(host?): PredictionSchedulerRuntime`
- `evaluateBrowserPredictionEnvironment(environment?): BrowserPredictionDecision`
- `observeBrowserPredictionEnvironment(listener, environment?): () => void`

Type exports:

| Export                                   | Purpose                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `BrowserConnection`                      | Optional `effectiveType` and `saveData` connection fields.                   |
| `BrowserPredictionBlockReason`           | `browser_unavailable`, `document_hidden`, `save_data`, or `slow_connection`. |
| `BrowserPredictionDecision`              | Allowed result or blocked result with reason.                                |
| `BrowserPredictionEnvironment`           | Optional document and navigator inputs for evaluation.                       |
| `BrowserSchedulerHost`                   | Timer and optional idle-callback host.                                       |
| `ObservableBrowserConnection`            | Connection fields plus optional change listeners.                            |
| `ObservableBrowserPredictionEnvironment` | Document and navigator inputs with visibility listeners.                     |

## Backend protocol

Import from `@inttegro/cogni-client/protocol`; the host supplies the route map.

### `createCogniBackendClient`

```typescript
function createCogniBackendClient(
  options: CogniBackendClientOptions,
): CogniBackendClient;
```

`CogniBackendClientOptions` fields:

| Field         | Type                 | Default            |
| ------------- | -------------------- | ------------------ |
| `credentials` | `RequestCredentials` | `same-origin`      |
| `fetch`       | `typeof fetch`       | `globalThis.fetch` |
| `headers`     | `HeadersInit`        | None               |
| `routes`      | `CogniBackendRoutes` | Required           |

`CogniBackendRoutes` requires non-empty `capabilities`, `outcomes`, and `predictions` strings.

The returned client has:

```typescript
interface CogniBackendClient {
  capabilities(signal?: AbortSignal): Promise<BackendCapabilities>;
  executePredictions(
    request: PredictionBatchRequest,
    options?: ExecutePredictionsOptions,
  ): Promise<readonly PredictionEvent[]>;
  reportOutcomes(outcomes: PredictionOutcomeBatch, signal?: AbortSignal): Promise<void>;
}
```

`ExecutePredictionsOptions` fields are `onEvent`, `signal`, and `transport`, where transport is
`json` or `ndjson` and defaults to `ndjson`.

Error exports:

- `CogniBackendError` contains the HTTP `status` and optional parsed `problem`.
- `CogniProtocolError` reports invalid local requests, response media types, messages, and event
  sequences.

Protocol type exports:

`BackendCapabilities`, `PredictionAcceptedEvent`, `PredictionBatchCompletedEvent`,
`PredictionBatchRequest`, `PredictionBatchResponse`, `PredictionBatchSummary`,
`PredictionCandidateRequest`, `PredictionCost`, `PredictionEvent`, `PredictionFailedEvent`,
`PredictionFailureCode`, `PredictionOutcome`, `PredictionOutcomeBatch`, `PredictionOutcomeRecord`,
`PredictionRejectedEvent`, `PredictionRejectionReason`, `PredictionResolvedEvent`, `PredictionWork`,
`Problem`, `ProtocolVersion`, `ResolvedResource`, and `ResourceRequest`.

These types mirror the [backend contract](/backend-contract); their field names use `snake_case`.

## Chrome ranking

The optional Chrome ranker may reorder a host allowlist. It cannot invent candidates, assign
probabilities, or start work.

```typescript
function createChromePromptCandidateRanker<Context>(
  options: ChromePromptCandidateRankerOptions<Context>,
): CandidateRanker<Context>;
```

Options:

| Field                  | Type                                                | Default                               |
| ---------------------- | --------------------------------------------------- | ------------------------------------- |
| `describeContext`      | `(context: Context) => string`                      | Required                              |
| `languageModel`        | `ChromeLanguageModelApi`                            | `globalThis.LanguageModel` when valid |
| `maxCandidates`        | `number`                                            | `8`                                   |
| `maxContextCharacters` | `number`                                            | `2000`                                |
| `onEvent`              | `(event: ChromePromptCandidateRankerEvent) => void` | None                                  |

Additional type exports are `ChromeLanguageModelApi`, `ChromeLanguageModelCreateOptions`,
`ChromeLanguageModelSession`, `ChromePromptCandidateRankerEvent`,
`ChromePromptCandidateRankerOptions`, and `ChromePromptRankerUnavailableReason`.

The adapter validates every ID against the allowlist and returns `null` when unavailable, cancelled,
or invalid. It ranks at most eight candidates by default.
