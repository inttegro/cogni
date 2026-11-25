---
title: Browser signals
description: Respect visibility and connection signals, use idle opportunities, and measure whether work arrived early enough to matter.
---

The browser can veto prediction when a page is hidden, data saving is enabled, or the connection is
slow. `NavigationMetrics` separately measures whether correct work began early enough to help.

## Environment checks

```typescript
import {
  evaluateBrowserPredictionEnvironment,
  observeBrowserPredictionEnvironment,
} from "@inttegro/cogni-client/browser";

const decision = evaluateBrowserPredictionEnvironment();
if (!decision.allowed) {
  console.info("prediction blocked", decision.reason);
}
```

The evaluator blocks prediction when:

| Reason                | Condition                                           |
| --------------------- | --------------------------------------------------- |
| `browser_unavailable` | `document` or `navigator` is unavailable.           |
| `document_hidden`     | `document.visibilityState` is not `visible`.        |
| `save_data`           | The connection reports `saveData: true`.            |
| `slow_connection`     | The effective connection type is `2g` or `slow-2g`. |

`browserAllowsPrediction()` returns the boolean result. Both functions accept an explicit
environment for deterministic tests.

## Observe changes

`observeBrowserPredictionEnvironment()` calls its listener immediately and after visibility or
connection changes:

```typescript
const stop = observeBrowserPredictionEnvironment((next) => {
  scheduler.setEnvironmentAllowed(next.allowed);
});

// Later, when the application shell is disposed:
stop();
```

The default observer requires a browser. In SSR, workers, and tests, avoid calling it without an
explicit observable environment. The framework-neutral coordinator and scheduler do not require
the browser entry point.

## Idle scheduling

`createBrowserPredictionSchedulerRuntime()` uses `requestIdleCallback` when available and falls back
to a zero-delay timer. Foreground and environment gates still run first.

You can pass an explicit `BrowserSchedulerHost` for tests or embedded runtimes:

```typescript
import { createBrowserPredictionSchedulerRuntime } from "@inttegro/cogni-client/browser";

const runtime = createBrowserPredictionSchedulerRuntime({
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
});
```

The runtime's `now()` uses `Date.now()`. For fully controlled clocks, inject a custom
`PredictionSchedulerRuntime` into `PredictionScheduler` instead.

## Navigation metrics

`NavigationMetrics` correlates prefetch and navigation timestamps with the same host-owned key:

```typescript
import { NavigationMetrics } from "@inttegro/cogni-client";

const metrics = new NavigationMetrics({
  onComplete(metric) {
    console.info("navigation metric", metric);
  },
});

const key = "account:app_123:products:first-page";

metrics.recordPrefetchStarted(key);
await prefetchProducts();
metrics.recordPrefetchSettled(key);

// Call these from the committed router lifecycle.
metrics.recordNavigationStarted(key);
const metric = metrics.recordNavigationCompleted(key);
```

`recordNavigationCompleted()` returns `undefined` if no navigation start exists. Otherwise it
returns:

| Field                             | Meaning                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `key`                             | Host correlation key.                                             |
| `navigationCompletedAt`           | Completion timestamp.                                             |
| `navigationDurationMs`            | Time from committed start to completion.                          |
| `navigationStartedAt`             | Committed navigation start timestamp.                             |
| `prefetchDurationMs`              | Prefetch start-to-settlement duration when both timestamps exist. |
| `prefetchLeadMs`                  | Time from prefetch start to committed navigation start.           |
| `prefetchSettledAt`               | Optional prefetch settlement timestamp.                           |
| `prefetchSettledBeforeNavigation` | Whether prefetch settled no later than navigation start.          |
| `prefetchStartedAt`               | Optional prefetch start timestamp.                                |

Ordinary navigation can be measured without a prediction. The prefetch fields are then absent and
`prefetchSettledBeforeNavigation` is `false`, giving the host a natural baseline.

The class stores pending records in memory. It defaults to at most 24 records and a 120-second TTL;
`maxPending` and `ttlMs` are configurable. `clear(key?)` removes one correlation or all pending
correlations. Telemetry callback failures are isolated from navigation.

## Interpret timing

`prefetchLeadMs` measures the head start; `prefetchSettledBeforeNavigation` shows whether work
finished before commitment. Pair timing with `markReused()` and `quality()` because timing alone does
not prove reuse.

## Optional ranking

`@inttegro/cogni-client/chrome-ai` can rerank a bounded host allowlist. It cannot invent destinations,
assign probabilities, start work, or download a model. It returns `null` when unavailable or invalid.
See the [client API](/cogni/client-api#chrome-ranking).
