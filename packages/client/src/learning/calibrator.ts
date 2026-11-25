import type { PredictionCalibration, PredictionCandidate } from "../core/types";
import type {
  AdaptiveCalibrationInput,
  AdaptiveCalibrationChoiceObservation,
  AdaptiveCalibrationObservation,
  AdaptiveCalibrationRecord,
  AdaptiveCalibrationResult,
  AdaptiveCalibrationScope,
  AdaptiveCalibratorOptions,
} from "./types";
import { ADAPTIVE_CALIBRATION_MODEL } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export class AdaptivePredictionCalibrator {
  readonly #options: Required<Omit<AdaptiveCalibratorOptions, "store">> &
    Pick<AdaptiveCalibratorOptions, "store">;

  constructor(options: AdaptiveCalibratorOptions) {
    this.#options = {
      store: options.store,
      namespace: nonEmpty(options.namespace ?? "default", "namespace"),
      halfLifeMs: positive(options.halfLifeMs ?? 14 * DAY_MS, "halfLifeMs"),
      priorStrength: nonNegative(options.priorStrength ?? 8, "priorStrength"),
      minimumEvidence: nonNegative(options.minimumEvidence ?? 5, "minimumEvidence"),
      confidenceScale: positive(options.confidenceScale ?? 12, "confidenceScale"),
      maxAdjustment: probability(options.maxAdjustment ?? 0.2, "maxAdjustment"),
      maxChoiceDestinations: positiveInteger(
        options.maxChoiceDestinations ?? 32,
        "maxChoiceDestinations",
      ),
      now: options.now ?? (() => Date.now()),
    };
  }

  async calibrate(
    input: Readonly<AdaptiveCalibrationInput>,
  ): Promise<AdaptiveCalibrationResult> {
    const at = finite(input.at ?? this.#options.now(), "at");
    const baseProbability = probability(
      input.candidate.calibration?.baseProbability ?? input.candidate.probability,
      "candidate.probability",
    );
    const scope = this.#scope(input, input.candidate.destination);
    const current = await this.#options.store.read(scope);
    const weights = decayedWeights(current, at, this.#options.halfLifeMs);
    const evidence = weights.success + weights.failure;
    const denominator = this.#options.priorStrength + evidence;
    const personalizedProbability =
      denominator === 0
        ? baseProbability
        : (baseProbability * this.#options.priorStrength + weights.success) /
          denominator;
    const confidence = calibrationConfidence(
      evidence,
      this.#options.minimumEvidence,
      this.#options.confidenceScale,
    );
    const adjustment = clamp(
      (personalizedProbability - baseProbability) * confidence,
      -this.#options.maxAdjustment,
      this.#options.maxAdjustment,
    );
    const finalProbability = clamp(baseProbability + adjustment, 0, 1);
    const calibration: Readonly<PredictionCalibration> = Object.freeze({
      model: ADAPTIVE_CALIBRATION_MODEL,
      baseProbability,
      personalizedProbability,
      evidence,
      confidence,
      adjustment: finalProbability - baseProbability,
    });
    const candidate: Readonly<PredictionCandidate> = Object.freeze({
      ...input.candidate,
      probability: finalProbability,
      calibration,
    });
    return { candidate, calibration };
  }

  async observe(
    observation: Readonly<AdaptiveCalibrationObservation>,
  ): Promise<boolean> {
    const { result } = observation;
    if (
      !result.materialWork ||
      (result.outcome !== "reused" && result.outcome !== "missed")
    ) {
      return false;
    }

    await this.#record(
      this.#scope(observation, result.candidate.destination),
      result.outcome === "reused",
      finite(observation.at ?? result.completedAt, "at"),
    );
    return true;
  }

  async observeChoice(
    observation: Readonly<AdaptiveCalibrationChoiceObservation>,
  ): Promise<number> {
    const destinations = [
      ...new Set(
        observation.consideredDestinations.map((destination) =>
          nonEmpty(destination, "consideredDestination"),
        ),
      ),
    ];
    if (destinations.length === 0) {
      throw new TypeError("consideredDestinations must not be empty");
    }
    if (destinations.length > this.#options.maxChoiceDestinations) {
      throw new RangeError(
        `consideredDestinations must contain at most ${this.#options.maxChoiceDestinations} destinations`,
      );
    }
    const chosenDestination = nonEmpty(
      observation.chosenDestination,
      "chosenDestination",
    );
    const at = finite(observation.at ?? this.#options.now(), "at");
    await this.#options.store.updateMany(
      destinations.map((destination) => {
        const scope = this.#scope(observation, destination);
        return {
          scope,
          updater: this.#recordUpdater(scope, destination === chosenDestination, at),
        };
      }),
    );
    return destinations.length;
  }

  async clearSubject(subjectKey: string): Promise<void> {
    await this.#options.store.clearSubject(
      nonEmpty(subjectKey, "subjectKey"),
      this.#options.namespace,
    );
  }

  #scope(
    input: Pick<AdaptiveCalibrationInput, "subjectKey" | "contextKey">,
    destination: string,
  ): AdaptiveCalibrationScope {
    return {
      namespace: this.#options.namespace,
      subjectKey: nonEmpty(input.subjectKey, "subjectKey"),
      contextKey: nonEmpty(input.contextKey, "contextKey"),
      destination: nonEmpty(destination, "destination"),
    };
  }

  async #record(
    scope: AdaptiveCalibrationScope,
    reused: boolean,
    at: number,
  ): Promise<void> {
    await this.#options.store.update(scope, this.#recordUpdater(scope, reused, at));
  }

  #recordUpdater(scope: AdaptiveCalibrationScope, reused: boolean, at: number) {
    return (current: Readonly<AdaptiveCalibrationRecord> | undefined) => {
      const updatedAt = Math.max(at, current?.updatedAt ?? at);
      const weights = decayedWeights(current, updatedAt, this.#options.halfLifeMs);
      return {
        ...scope,
        successWeight: weights.success + (reused ? 1 : 0),
        failureWeight: weights.failure + (reused ? 0 : 1),
        updatedAt,
      };
    };
  }
}

function decayedWeights(
  record: Readonly<AdaptiveCalibrationRecord> | undefined,
  at: number,
  halfLifeMs: number,
): { success: number; failure: number } {
  if (record === undefined) return { success: 0, failure: 0 };
  const elapsed = Math.max(0, at - record.updatedAt);
  const factor = 2 ** (-elapsed / halfLifeMs);
  return {
    success: record.successWeight * factor,
    failure: record.failureWeight * factor,
  };
}

function calibrationConfidence(
  evidence: number,
  minimumEvidence: number,
  confidenceScale: number,
): number {
  if (evidence < minimumEvidence) return 0;
  return 1 - Math.exp(-(evidence - minimumEvidence + 1) / confidenceScale);
}

function nonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new TypeError(`${name} must not be empty`);
  return value;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be greater than 0`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function probability(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be between 0 and 1`);
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
