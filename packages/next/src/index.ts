"use client";

export {
  CogniProvider as NextCogniProvider,
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
export type {
  CogniProviderProps as NextCogniProviderProps,
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
export type {
  NextRouteIntentActions,
  NextRouteIntentTrigger,
  UseNextRouteIntentOptions,
} from "./use-next-route-intent";
