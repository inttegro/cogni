import type {
  PredictionCancellationReason as CorePredictionCancellationReason,
  PredictionCandidate as CorePredictionCandidate,
  PredictionCalibration as CorePredictionCalibration,
  PredictionCalibrationController as CorePredictionCalibrationController,
  PredictionCoordinatorOptions as CorePredictionCoordinatorOptions,
  PredictionCost as CorePredictionCost,
  PredictionEvent as CorePredictionEvent,
  PredictionEventListener as CorePredictionEventListener,
  PredictionExecution as CorePredictionExecution,
  PredictionHandle as CorePredictionHandle,
  PredictionLifecycleEvent as CorePredictionLifecycleEvent,
  PredictionLoader as CorePredictionLoader,
  PredictionOutcome as CorePredictionOutcome,
  PredictionQualityFilter as CorePredictionQualityFilter,
  PredictionQualitySnapshot as CorePredictionQualitySnapshot,
  PredictionRejectionReason as CorePredictionRejectionReason,
  PredictionRuntime as CorePredictionRuntime,
  PredictionScheduleOptions as CorePredictionScheduleOptions,
  PredictionSchedulerCancellationReason as CorePredictionSchedulerCancellationReason,
  PredictionSchedulerEvent as CorePredictionSchedulerEvent,
  PredictionSchedulerEventListener as CorePredictionSchedulerEventListener,
  PredictionSchedulerStartMode as CorePredictionSchedulerStartMode,
  PredictionScheduledTask as CorePredictionScheduledTask,
  PredictionSchedulerOptions as CorePredictionSchedulerOptions,
  PredictionSchedulerRuntime as CorePredictionSchedulerRuntime,
  PredictionStatus as CorePredictionStatus,
  PredictionTerminalResult as CorePredictionTerminalResult,
  PredictionWorkResult as CorePredictionWorkResult,
  RequiredPredictionCandidate as CoreRequiredPredictionCandidate,
  NormalizedPredictionScheduleOptions as CoreNormalizedPredictionScheduleOptions,
  ScheduledPrediction as CoreScheduledPrediction,
  ScheduledPredictionStatus as CoreScheduledPredictionStatus,
} from "./core/types";
import type {
  CandidateRanker as CoreCandidateRanker,
  CandidateRankingCandidate as CoreCandidateRankingCandidate,
  CandidateRankingInput as CoreCandidateRankingInput,
  CandidateRankingResult as CoreCandidateRankingResult,
} from "./ranking/types";

export {
  createPredictionCandidate,
  DEFAULT_HIGH_COST_PREDICTION_PROBABILITY,
  DEFAULT_PREDICTION_HORIZON_MS,
  DEFAULT_PREDICTION_POLICY,
  DEFAULT_PREDICTION_PROBABILITY,
  DEFAULT_PREDICTION_TRIGGER,
} from "./core/defaults";
export { PredictionCoordinator } from "./core/coordinator";
export { IntentPrefetchController } from "./core/intent";
export { NavigationMetrics } from "./core/navigation-metrics";
export { PredictionScheduler } from "./core/scheduler";
export type { IntentPrefetchControllerOptions } from "./core/intent";
export type { PredictionCandidateInput } from "./core/defaults";
export type {
  NavigationMetric,
  NavigationMetricsOptions,
} from "./core/navigation-metrics";

export type PredictionCancellationReason = CorePredictionCancellationReason;
export type PredictionCandidate = CorePredictionCandidate;
export type PredictionCalibration = CorePredictionCalibration;
export type PredictionCalibrationController = CorePredictionCalibrationController;
export type PredictionCoordinatorOptions = CorePredictionCoordinatorOptions;
export type PredictionCost = CorePredictionCost;
export type PredictionEvent = CorePredictionEvent;
export type PredictionEventListener = CorePredictionEventListener;
export type PredictionExecution = CorePredictionExecution;
export type PredictionHandle = CorePredictionHandle;
export type PredictionLifecycleEvent<Type extends CorePredictionEvent["type"]> =
  CorePredictionLifecycleEvent<Type>;
export type PredictionLoader = CorePredictionLoader;
export type PredictionOutcome = CorePredictionOutcome;
export type PredictionQualityFilter = CorePredictionQualityFilter;
export type PredictionQualitySnapshot = CorePredictionQualitySnapshot;
export type PredictionRejectionReason = CorePredictionRejectionReason;
export type PredictionRuntime = CorePredictionRuntime;
export type PredictionScheduleOptions = CorePredictionScheduleOptions;
export type NormalizedPredictionScheduleOptions =
  CoreNormalizedPredictionScheduleOptions;
export type PredictionSchedulerCancellationReason =
  CorePredictionSchedulerCancellationReason;
export type PredictionSchedulerEvent = CorePredictionSchedulerEvent;
export type PredictionSchedulerEventListener = CorePredictionSchedulerEventListener;
export type PredictionSchedulerStartMode = CorePredictionSchedulerStartMode;
export type PredictionScheduledTask = CorePredictionScheduledTask;
export type PredictionSchedulerOptions = CorePredictionSchedulerOptions;
export type PredictionSchedulerRuntime = CorePredictionSchedulerRuntime;
export type PredictionStatus = CorePredictionStatus;
export type PredictionTerminalResult = CorePredictionTerminalResult;
export type PredictionWorkResult = CorePredictionWorkResult;
export type RequiredPredictionCandidate = CoreRequiredPredictionCandidate;
export type ScheduledPrediction = CoreScheduledPrediction;
export type ScheduledPredictionStatus = CoreScheduledPredictionStatus;
export type CandidateRanker<Context> = CoreCandidateRanker<Context>;
export type CandidateRankingCandidate = CoreCandidateRankingCandidate;
export type CandidateRankingInput<Context> = CoreCandidateRankingInput<Context>;
export type CandidateRankingResult = CoreCandidateRankingResult;
