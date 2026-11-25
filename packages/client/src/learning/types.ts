import type {
  PredictionCalibration,
  PredictionCandidate,
  PredictionTerminalResult,
} from "../core/types";

export const ADAPTIVE_CALIBRATION_MODEL = "adaptive-transition-v1";

/** Host-owned identity and transition context for one learned destination. */
export interface AdaptiveCalibrationScope {
  /** Separates models belonging to different applications or environments. */
  namespace: string;
  /** Opaque identity for an authenticated user-device pair. */
  subjectKey: string;
  /** Opaque source or situation in which the destination was considered. */
  contextKey: string;
  /** Host-approved destination being calibrated. */
  destination: string;
}

/** Persisted aggregate evidence. Raw navigation history is never required. */
export interface AdaptiveCalibrationRecord extends AdaptiveCalibrationScope {
  successWeight: number;
  failureWeight: number;
  updatedAt: number;
}

export type AdaptiveCalibrationRecordUpdater = (
  current: Readonly<AdaptiveCalibrationRecord> | undefined,
) => AdaptiveCalibrationRecord;

export interface AdaptiveCalibrationStoreUpdate {
  scope: Readonly<AdaptiveCalibrationScope>;
  updater: AdaptiveCalibrationRecordUpdater;
}

export interface AdaptiveCalibrationStoreOptions {
  /** Maximum aggregate records retained. Defaults to 2000. */
  maxRecords?: number;
  /** Maximum age of an aggregate record. Defaults to 90 days. */
  retentionMs?: number;
}

/** Atomic persistence contract used by the adaptive model. */
export interface AdaptiveCalibrationStore {
  read(
    scope: Readonly<AdaptiveCalibrationScope>,
  ): Promise<AdaptiveCalibrationRecord | undefined>;
  update(
    scope: Readonly<AdaptiveCalibrationScope>,
    updater: AdaptiveCalibrationRecordUpdater,
  ): Promise<AdaptiveCalibrationRecord>;
  updateMany(
    updates: readonly AdaptiveCalibrationStoreUpdate[],
  ): Promise<readonly AdaptiveCalibrationRecord[]>;
  clearSubject(subjectKey: string, namespace?: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AdaptiveCalibrationInput {
  /** Opaque identity for an authenticated user-device pair. */
  subjectKey: string;
  /** Opaque source route or host-defined context bucket. */
  contextKey: string;
  /** Candidate containing the host's base probability. */
  candidate: Readonly<PredictionCandidate>;
  /** Observation time. Defaults to the calibrator clock. */
  at?: number;
}

export interface AdaptiveCalibrationResult {
  candidate: Readonly<PredictionCandidate>;
  calibration: Readonly<PredictionCalibration>;
}

export interface AdaptiveCalibrationObservation {
  subjectKey: string;
  contextKey: string;
  result: Readonly<PredictionTerminalResult>;
  /** Observation time. Defaults to the terminal completion time. */
  at?: number;
}

export interface AdaptiveCalibrationChoiceObservation {
  subjectKey: string;
  contextKey: string;
  /** Destination the user committed to. It may be outside the considered set. */
  chosenDestination: string;
  /** Host-approved destinations that were plausible in this context. */
  consideredDestinations: readonly string[];
  /** Observation time. Defaults to the calibrator clock. */
  at?: number;
}

export interface AdaptiveCalibratorOptions {
  store: AdaptiveCalibrationStore;
  /** Application or environment partition. */
  namespace?: string;
  /** Evidence half-life. Defaults to 14 days. */
  halfLifeMs?: number;
  /** Prior weight assigned to the host probability. Defaults to 8. */
  priorStrength?: number;
  /** Evidence required before personalization can change a score. Defaults to 5. */
  minimumEvidence?: number;
  /** Evidence needed for personalization to approach full influence. Defaults to 12. */
  confidenceScale?: number;
  /** Maximum absolute probability adjustment. Defaults to 0.2. */
  maxAdjustment?: number;
  /** Maximum destinations in one choice observation. Defaults to 32. */
  maxChoiceDestinations?: number;
  now?: () => number;
}
