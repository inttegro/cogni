# Cogni client

Cogni coordinates bounded predictive loading between a frontend and its
application backend. It starts only read-only work that clears an explicit
confidence gate, gives direct intent priority over background guesses, and
measures whether the eventual user action reused the result.

The frontend package is TypeScript. Backends implement the language-neutral
Cogni protocol in Go, Rust, Ruby, Node.js, or any other language. A backend
implementation remains inside the host application's authentication, resource,
and cache boundaries.

## Versioning

Cogni follows semantic versioning. During the `0.x` series, minor releases may
change public APIs and will include migration notes in the changelog.

## Core coordinator

```ts
import { PredictionCoordinator } from "@inttegro/cogni-client";

const predictions = new PredictionCoordinator({
  maxConcurrent: 2,
  onEvent: (event) => telemetry.record(event),
});

const handle = predictions.predict(
  {
    key: "account:app_123:products",
    policy: "account-navigation",
    trigger: "pointer",
    destination: "/products",
    probability: 0.92,
    horizonMs: 5_000,
    cost: "standard",
  },
  async ({ signal }) => {
    const response = await fetch("/api/products", { signal });
    await productsCache.store(await response.json());
    return {
      materialWork: true,
      bytes: Number(response.headers.get("content-length")) || 0,
    };
  },
);

// Call this when the committed action consumes the same cached resource.
handle.markReused();
```

Cogni does not retain the response. The host cache remains the source consumed by
the application.

Applications that do not already own a calibrated policy can start with Cogni's
defaults instead of assembling every candidate field:

```ts
import { createPredictionCandidate } from "@inttegro/cogni-client";

const candidate = createPredictionCandidate({ key: "query:recent-orders" });
```

This uses a conservative `0.8` initial prior, a `30` second reuse horizon,
standard cost, and generic context labels. Browser learning adjusts the prior
from actual reuse and waste. The host still supplies the stable work identity
and cache-aware loader because Cogni cannot infer authorization, freshness, or
whether foreground code consumes the result. Advanced integrations may override
every candidate field or construct `PredictionCandidate` directly.

The coordinator accepts an optional runtime with `now()` and `schedule()` so
applications and tests can control deadlines without relying on global timers.

## Adaptive calibration

Browser-owned framework runtimes enable learning by default once the host supplies an opaque
authenticated account key. The scheduler calibrates before admission and records material outcomes
after completion without a feature flag. IndexedDB loss starts a fresh model and never blocks
prediction.

Low-level integrations can use the learning entry point directly to adjust a host probability from
the time-decayed reuse history of an opaque user-device subject:

```ts
import { AdaptivePredictionCalibrator } from "@inttegro/cogni-client/learning";
import {
  composeUserDeviceSubjectKey,
  getOrCreateCogniDeviceKey,
  IndexedDbAdaptiveCalibrationStore,
} from "@inttegro/cogni-client/learning/browser";

const calibrator = new AdaptivePredictionCalibrator({
  namespace: "dashboard",
  store: new IndexedDbAdaptiveCalibrationStore(),
});
const subjectKey = composeUserDeviceSubjectKey(
  session.opaqueUserKey,
  getOrCreateCogniDeviceKey(),
);

const contextKey = location.pathname;
const { candidate: calibrated } = await calibrator.calibrate({
  subjectKey,
  contextKey,
  candidate,
});
const handle = predictions.predict(calibrated, loader);

// On committed navigation, learn from the complete host-approved choice set.
await calibrator.observeChoice({
  subjectKey,
  contextKey,
  chosenDestination: nextPath,
  consideredDestinations: approvedCandidates.map(({ destination }) => destination),
});
```

`observeChoice()` learns from committed navigation even when a candidate stayed
below the prediction gate. `observe()` is available when material `reused` and
`missed` outcomes are the intended training signal; operational failures,
rejections, cancellations, and already-cached reads are ignored. Do not feed the
same decision into both methods in one namespace.

The default model requires five effective observations, decays evidence with a
14-day half-life, and caps its adjustment at 0.2. It stores aggregate weights
rather than raw route history.

The host still chooses safe candidates, creates an opaque authenticated user
key, and owns retention and consent. It may supply the base probability or use
Cogni's conservative prior. The calibrator cannot invent destinations or bypass
coordinator gates. Call `clearSubject()` when an account is deleted or the user
resets personalization.

## Activity-aware scheduling

`PredictionScheduler` adds the timing and admission behavior needed by an
application shell. The host supplies foreground activity and browser admission;
Cogni owns delays, idle starts, maximum defers, direct-intent escalation, and
pending-work deduplication:

```ts
import { PredictionScheduler } from "@inttegro/cogni-client";
import {
  createBrowserPredictionSchedulerRuntime,
  observeBrowserPredictionEnvironment,
} from "@inttegro/cogni-client/browser";

const scheduler = new PredictionScheduler({
  runtime: createBrowserPredictionSchedulerRuntime(),
});

const stop = observeBrowserPredictionEnvironment((decision) => {
  scheduler.setEnvironmentAllowed(decision.allowed);
});

const scheduled = scheduler.schedule(candidate, loader, {
  delayMs: 500,
  idleTimeoutMs: 2_500,
  maxDeferMs: 750,
});

// Pointer, focus, touch, or committed click intent can escalate pending work.
scheduled.startNow();
```

Use `setForegroundActivity(count)` with the host's request tracker. A transition
back to zero restarts the soft delay. `maxDeferMs` may bypass foreground activity
but never a blocked browser environment. Omitting it permits indefinite defer,
which is appropriate for low-priority data warmup.

`IntentPrefetchController` provides cancelable hover-style delays and immediate
intent escalation without depending on React. `NavigationMetrics` measures
prefetch lead, settlement, and committed navigation duration while leaving the
telemetry destination to the host.

## Browser admission

The optional browser entry point applies conservative environment checks before
speculative work is scheduled:

```ts
import { evaluateBrowserPredictionEnvironment } from "@inttegro/cogni-client/browser";

const decision = evaluateBrowserPredictionEnvironment();
if (!decision.allowed) telemetry.record("prediction_blocked", decision);
```

It blocks work while the document is hidden, when data saving is enabled, and
on 2G connections. The evaluator accepts an explicit environment for
deterministic tests and does not depend on React or a router.

`observeBrowserPredictionEnvironment()` watches visibility and connection
changes and returns an unsubscribe function.

## Optional Chrome AI ranking

The `@inttegro/cogni-client/chrome-ai` entry point can use Chrome's built-in
Prompt API to rerank a small set of destinations already approved by the host:

```ts
import { createChromePromptCandidateRanker } from "@inttegro/cogni-client/chrome-ai";

const ranker = createChromePromptCandidateRanker({
  describeContext: ({ current, recent }) => JSON.stringify({ current, recent }),
});
const navigationController = new AbortController();

const result = await ranker.rank({
  candidates: [
    { id: "orders", description: "Review recent orders" },
    { id: "customers", description: "Manage customers" },
  ],
  context: { current: "home", recent: ["products"] },
  signal: navigationController.signal,
});
```

This is progressive enhancement. The adapter returns `null` when the API or
model is unavailable, the request is cancelled, or the response is invalid. It
runs only when Chrome reports the model as `available`, so it never initiates a
model download. The host's static policy remains the fallback.

The model receives only the context returned by `describeContext`. Keep it
short, ephemeral, and free of customer, order, message, credential, and other
sensitive data. Candidate IDs are an allowlist: structured output and runtime
validation prevent the model from inventing destinations. The ranker does not
produce confidence values or start work. Hosts must calibrate probabilities
from observed reuse before passing candidates to the coordinator.

## Backend protocol

The language-neutral backend contract is documented in
[`protocol/README.md`](../../protocol/README.md) and exercised by the shared
conformance fixtures. It defines three authenticated operations:

- capability negotiation;
- bounded execution of server-registered, read-only resources; and
- reuse outcome reporting for calibration.

Prediction results can be returned as one JSON envelope or streamed as NDJSON.
The TypeScript package provides one client binding. Other backend languages
implement the same messages and lifecycle rules without importing this package.
The host chooses all operation URLs when it creates the client; Cogni does not
reserve a URL prefix.

Resource names are opaque backend registrations, never client-provided URLs or
authorization grants. Every implementation resolves the host's normal request
identity and authorizes each resource exactly as it would authorize the
foreground request.

The contract document specifies the message fields, lifecycle ordering,
authentication requirements, fixtures, and implementation rules.

## Quality accounting

The default gates require an 80 percent probability for ordinary work and 90
percent for high-cost work. `quality()` reports reuse by prediction count and by
transferred bytes. Work that fails, expires, or is cancelled after it begins
lowers the measured reuse rate.

See [CHARTER.md](../../CHARTER.md) for the operating boundaries and release standard.
