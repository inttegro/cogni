/**
 * Browser persistence and identity helpers for adaptive calibration.
 * @packageDocumentation
 */

export {
  composeUserDeviceSubjectKey,
  createBrowserPredictionCalibration,
  getOrCreateCogniDeviceKey,
  IndexedDbAdaptiveCalibrationStore,
} from "./learning/browser";
export type {
  AdaptiveCalibrationRecord,
  AdaptiveCalibrationRecordUpdater,
  AdaptiveCalibrationScope,
  AdaptiveCalibrationStore,
  AdaptiveCalibrationStoreOptions,
  AdaptiveCalibrationStoreUpdate,
} from "./learning/types";
export type {
  BrowserPredictionCalibrationOptions,
  CogniDeviceKeyOptions,
  IndexedDbAdaptiveCalibrationStoreOptions,
} from "./learning/browser";
