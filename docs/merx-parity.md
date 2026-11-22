# Merx parity and migration boundary

Merx is the reference implementation for Cogni's first migration. The package
APIs cover the reusable behavior; Merx keeps the framework, domain, and cache
adapters that only Merx can define.

## Parity map

| Current Merx behavior                                                                               | Cogni owner                                                     | Merx adapter after migration                                       |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| 80% ordinary and 90% high-cost confidence gates                                                     | `PredictionCoordinator` and `PredictionExecutor`                | Calibrated candidate probabilities                                 |
| Priority, concurrency, queue bounds, deduplication, cancellation, and reuse accounting              | `PredictionCoordinator`                                         | Loader and cache-reuse signal                                      |
| 500 ms route delay, 200 ms between route starts, and 750 ms maximum foreground defer                | `PredictionScheduler`                                           | Route policy and sequence advancement                              |
| 3 second data delay, 400 ms between queries, and no maximum foreground defer                        | `PredictionScheduler`                                           | TanStack query definitions and sequence advancement                |
| Pause new work during foreground requests                                                           | `PredictionScheduler.setForegroundActivity()`                   | Existing Merx network-activity subscription                        |
| Pause while hidden, on data saving, or on 2G                                                        | Browser environment evaluator and observer                      | Feed each decision into `setEnvironmentAllowed()`                  |
| Idle callback with a 2.5 second timeout                                                             | Browser scheduler runtime                                       | None                                                               |
| Hover delay and immediate pointer, focus, touch, or click escalation                                | `IntentPrefetchController` and `ScheduledPrediction.startNow()` | Delegated DOM target and URL normalization                         |
| Prediction and navigation lead-time measurements                                                    | `NavigationMetrics`                                             | Merx telemetry sink and route-completion signal                    |
| Full Next.js route prefetch and RSC network settlement                                              | Merx                                                            | Next 16 adapter around the private FULL prefetch API               |
| Query-cache population and invalidation                                                             | Merx                                                            | TanStack query loaders and `scheduler.cancel(key)` on invalidation |
| Optional Chrome Prompt API shadow ranking                                                           | Cogni Chrome AI adapter                                         | Bounded, non-sensitive Merx context description                    |
| Named, read-only backend resources                                                                  | `PredictionResourceRegistry`                                    | Resource registration and normal Merx authorization                |
| Backend confidence gates, concurrency, deadlines, failure isolation, and completion-order streaming | `PredictionExecutor`                                            | Authenticated context and resource resolvers                       |
| Route locations for capability, prediction, and outcome operations                                  | Host route map                                                  | Merx chooses all three internal paths                              |

## Timing rules

The scheduler distinguishes three kinds of waiting:

1. A soft delay gives the foreground page time to settle. When foreground
   activity returns to zero, that delay starts again.
2. A maximum defer prevents bounded route predictions from starving. It may
   bypass foreground activity and idle waiting, but never the environment gate.
3. The environment gate pauses all prediction. When the page becomes eligible
   again, soft and maximum delays restart. Direct intent starts immediately once
   the environment permits it.

This matches the current account-route and account-data components. Data work
omits `maxDeferMs`, so continued foreground activity can defer it indefinitely.

## Client migration shape

Create one scheduler for the authenticated account shell, not one per link. The
shell wires the existing network activity count and browser environment to it:

```ts
const scheduler = new PredictionScheduler({
  runtime: createBrowserPredictionSchedulerRuntime(),
  coordinatorOptions: { maxConcurrent: 2 },
});

const stopEnvironment = observeBrowserPredictionEnvironment((decision) => {
  scheduler.setEnvironmentAllowed(decision.allowed);
});

const stopNetwork = subscribeNetworkActivity((count) => {
  scheduler.setForegroundActivity(count);
});
```

Route policy code schedules the first target with `delayMs: 500`,
`maxDeferMs: 750`, `idleTimeoutMs: 2500`. After it starts, the adapter schedules
the next target with `delayMs: 200`. If the observed RSC request settles from the
network, call `startNow()` on the next scheduled target.

Data policy code schedules one TanStack loader at a time with `delayMs: 3000`
for the first query and `delayMs: 400` thereafter. It does not set
`maxDeferMs`. Loader failures remain background misses and do not surface as
page errors.

The delegated route-intent adapter keeps Merx URL rules. It uses
`IntentPrefetchController` with a 50 ms hover delay and calls `startNow()` for
pointerdown, focus, touch, and click. A direct unmodified click also records the
navigation start through `NavigationMetrics`.

## Server migration shape

Merx registers an allowlist of read-only resources. A registration validates
parameters before acceptance and resolves through the same authenticated
services used by foreground requests:

```ts
const resources = new PredictionResourceRegistry<MerxContext>();

resources.register("products.page", {
  validate(parameters) {
    return parseProductsPageParameters(parameters);
  },
  async resolve({ context, parameters, signal }) {
    const payload = await context.products.page(parameters, { signal });
    return { payload };
  },
});

const server = createCogniResourceServer({
  registry: resources,
  capabilities,
  outcomes: ({ context, batch }) => context.predictions.record(batch),
});
```

The Merx route layer authenticates first and passes the resulting account
context to `handleCapabilities`, `handlePredictions`, or `handleOutcomes`.
Cogni does not create a second authorization system and does not accept URLs as
resource names.

## Migration order

1. Add the client package through a workspace dependency and create an account
   shell adapter.
2. Move account-route and account-data timing onto `PredictionScheduler` while
   retaining the existing Next and TanStack loaders.
3. Move the shared intent delay and navigation measurements onto the Cogni
   primitives.
4. Run the existing Merx unit tests unchanged, then remove superseded timer and
   metric implementations.
5. Register backend resources and mount the three internal protocol operations.
6. Compare production reuse rate, reused bytes, navigation duration, request
   volume, and error rate before enabling additional candidates.

Migration is behavior-preserving only when both existing Merx tests and Cogni's
cross-package conformance test pass. Package tests alone do not prove the Merx
adapter, deployment, or production behavior.
