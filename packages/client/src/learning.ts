/**
 * Adaptive probability calibration for Cogni prediction candidates.
 * @packageDocumentation
 */

export { AdaptivePredictionCalibrator } from "./learning/calibrator";
export {
  adaptiveCalibrationRecordKey,
  adaptiveCalibrationSubjectKey,
  InMemoryAdaptiveCalibrationStore,
} from "./learning/store";
export { ADAPTIVE_CALIBRATION_MODEL } from "./learning/types";
export type {
  AdaptiveCalibrationInput,
  AdaptiveCalibrationChoiceObservation,
  AdaptiveCalibrationObservation,
  AdaptiveCalibrationRecord,
  AdaptiveCalibrationRecordUpdater,
  AdaptiveCalibrationResult,
  AdaptiveCalibrationScope,
  AdaptiveCalibrationStore,
  AdaptiveCalibrationStoreOptions,
  AdaptiveCalibrationStoreUpdate,
  AdaptiveCalibratorOptions,
} from "./learning/types";
export type {
  PredictionCancellationReason,
  PredictionCalibration,
  PredictionCandidate,
  PredictionCost,
  PredictionOutcome,
  PredictionRejectionReason,
  PredictionTerminalResult,
  RequiredPredictionCandidate,
} from "./core/types";
