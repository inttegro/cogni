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
  CogniDevtoolsRecorder,
  createCogniDevtools,
  type CogniDevtoolsSnapshot,
} from "@inttegro/cogni-devtools";
import {
  CogniDevtools,
  CogniDevtoolsConnector,
  type CogniDevtoolsProps,
} from "@inttegro/cogni-devtools/react";
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
import {
  CogniProvider,
  resolveAnchorHref,
  useCogniScheduler,
  useDelegatedRouteIntent,
  useIntentPrefetch,
  useRouteIntent,
  useScheduledPrediction,
  type CogniProviderProps,
  type DelegatedRouteIntentActions,
} from "@inttegro/cogni-react";
import {
  PredictiveLink as ReactRouterPredictiveLink,
  type PredictiveLinkProps as ReactRouterPredictiveLinkProps,
} from "@inttegro/cogni-react-router";
import {
  PredictiveLink as TanStackPredictiveLink,
  type PredictiveLinkProps as TanStackPredictiveLinkProps,
} from "@inttegro/cogni-tanstack-router";
import {
  NextCogniProvider,
  PredictiveLink,
  createNextRouteCandidate,
  markRoutePredictionReused,
  useNextDelegatedRouteIntent,
  useNextRouteIntent,
  useNextRoutePrediction,
  type PredictiveLinkProps,
} from "@inttegro/cogni-next";
import {
  AstroPredictionRuntime,
  createAstroLinkAttributes,
  createAstroPredictionRuntime,
  createAstroRouteCandidate,
  type AstroLinkPredictionOptions,
} from "@inttegro/cogni-astro";

declare const candidate: PredictionCandidate;
declare const handle: PredictionHandle;
declare const quality: PredictionQualitySnapshot;
declare const ranker: CandidateRanker<{ path: string }>;
declare const runtime: PredictionSchedulerRuntime;
declare const batch: PredictionBatchRequest;
declare const capabilities: BackendCapabilities;
declare const devtoolsProps: CogniDevtoolsProps;
declare const devtoolsSnapshot: CogniDevtoolsSnapshot;
declare const resource: PredictionResourceDefinition<undefined>;
declare const reactProviderProps: CogniProviderProps;
declare const delegatedRouteIntentActions: DelegatedRouteIntentActions;
declare const predictiveLinkProps: PredictiveLinkProps;
declare const reactRouterPredictiveLinkProps: ReactRouterPredictiveLinkProps;
declare const tanStackPredictiveLinkProps: TanStackPredictiveLinkProps;
declare const astroLinkOptions: AstroLinkPredictionOptions;

void [candidate, handle, quality, ranker, runtime, batch];
void new PredictionCoordinator();
void new PredictionScheduler();
void new NavigationMetrics();
void new IntentPrefetchController({ run: () => undefined });
void createBrowserPredictionSchedulerRuntime;
void observeBrowserPredictionEnvironment;
void CogniDevtoolsRecorder;
void createCogniDevtools(new PredictionScheduler());
void CogniDevtools;
void CogniDevtoolsConnector;
void devtoolsProps;
void devtoolsSnapshot;
void CogniProvider;
void resolveAnchorHref;
void useCogniScheduler;
void useDelegatedRouteIntent;
void useIntentPrefetch;
void useRouteIntent;
void useScheduledPrediction;
void ReactRouterPredictiveLink;
void TanStackPredictiveLink;
void NextCogniProvider;
void PredictiveLink;
void createNextRouteCandidate;
void markRoutePredictionReused;
void useNextDelegatedRouteIntent;
void useNextRouteIntent;
void useNextRoutePrediction;
void reactProviderProps;
void delegatedRouteIntentActions;
void predictiveLinkProps;
void reactRouterPredictiveLinkProps;
void tanStackPredictiveLinkProps;
void AstroPredictionRuntime;
void createAstroPredictionRuntime;
void createAstroRouteCandidate;
void createAstroLinkAttributes(astroLinkOptions);
void createCogniBackendClient({
  routes: { capabilities: "/c", predictions: "/p", outcomes: "/o" },
});

const registry = new PredictionResourceRegistry<undefined>();
registry.register("resource", resource);
void createCogniResourceServer({ registry, capabilities });
