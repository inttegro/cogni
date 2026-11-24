"use client";

export {
  CogniProvider as NextCogniProvider,
  resolveAnchorHref,
  useCogniScheduler,
  useIntentPrefetch,
  useScheduledPrediction,
} from "@inttegro/cogni-react";
export { PredictiveLink } from "./predictive-link";
export { createNextRouteCandidate } from "./route";
export {
  markRoutePredictionReused,
  useNextRoutePrediction,
} from "./use-next-route-prediction";
export { useNextRouteIntent } from "./use-next-route-intent";
export { useNextDelegatedRouteIntent } from "./use-next-delegated-route-intent";
export type {
  CogniProviderProps as NextCogniProviderProps,
  DelegatedRouteCandidateResolver,
  DelegatedRouteHrefResolver,
  DelegatedRouteIntentActions,
  DelegatedRouteIntentContext,
  IntentPrefetchActions,
  UseIntentPrefetchOptions,
} from "@inttegro/cogni-react";
export type { PredictiveLinkProps } from "./predictive-link";
export type {
  NextRouteCandidateOptions,
  NextRoutePrefetch,
  NextRoutePrefetchContext,
} from "./route";
export type { UseNextRoutePredictionOptions } from "./use-next-route-prediction";
export type { UseNextDelegatedRouteIntentOptions } from "./use-next-delegated-route-intent";
export type {
  NextRouteIntentActions,
  NextRouteIntentTrigger,
  UseNextRouteIntentOptions,
} from "./use-next-route-intent";
