import {
  IntentPrefetchController,
  NavigationMetrics,
  PredictionCoordinator,
  PredictionScheduler,
  type CandidateRanker,
  type PredictionCandidate,
  type PredictionHandle,
  type PredictionQualitySnapshot,
  type PredictionSchedulerRuntime,
} from "@inttegro/cogni-client";
import {
  createBrowserPredictionSchedulerRuntime,
  observeBrowserPredictionEnvironment,
} from "@inttegro/cogni-client/browser";
import {
  createCogniBackendClient,
  type PredictionBatchRequest,
} from "@inttegro/cogni-client/protocol";
import {
  PredictionResourceRegistry,
  createCogniResourceServer,
  type BackendCapabilities,
  type PredictionResourceDefinition,
} from "@inttegro/cogni-server";

declare const candidate: PredictionCandidate;
declare const handle: PredictionHandle;
declare const quality: PredictionQualitySnapshot;
declare const ranker: CandidateRanker<{ path: string }>;
declare const runtime: PredictionSchedulerRuntime;
declare const batch: PredictionBatchRequest;
declare const capabilities: BackendCapabilities;
declare const resource: PredictionResourceDefinition<undefined>;

void [candidate, handle, quality, ranker, runtime, batch];
void new PredictionCoordinator();
void new PredictionScheduler();
void new NavigationMetrics();
void new IntentPrefetchController({ run: () => undefined });
void createBrowserPredictionSchedulerRuntime;
void observeBrowserPredictionEnvironment;
void createCogniBackendClient({
  routes: { capabilities: "/c", predictions: "/p", outcomes: "/o" },
});

const registry = new PredictionResourceRegistry<undefined>();
registry.register("resource", resource);
void createCogniResourceServer({ registry, capabilities });
