import type { PredictionCandidate, PredictionCost } from "./types";

/**
 * Cogni's initial prior for ordinary-cost work.
 *
 * It matches the default admission gate. Browser learning may move the
 * effective probability up or down as reuse evidence accumulates.
 */
export const DEFAULT_PREDICTION_PROBABILITY = 0.8;

/** Initial prior required before Cogni admits work explicitly marked high cost. */
export const DEFAULT_HIGH_COST_PREDICTION_PROBABILITY = 0.9;

/** A short reuse window that limits speculative work which outlives its context. */
export const DEFAULT_PREDICTION_HORIZON_MS = 30_000;

/** Stable telemetry label for candidates using Cogni's built-in policy defaults. */
export const DEFAULT_PREDICTION_POLICY = "cogni-default";

/** Generic trigger for a candidate made relevant by the current application context. */
export const DEFAULT_PREDICTION_TRIGGER = "context";

/**
 * The smallest safe host input for predictive work.
 *
 * Cogni can choose policy values, admission, timing, budgets, and learning. The
 * host must still identify reusable work because only it knows authorization,
 * cache identity, and whether foreground code consumes the loaded result.
 */
export interface PredictionCandidateInput {
  readonly key: string;
  readonly destination?: string;
  readonly policy?: string;
  readonly trigger?: string;
  readonly probability?: number;
  readonly horizonMs?: number;
  readonly cost?: PredictionCost;
  readonly priority?: number;
  readonly estimatedBytes?: number;
}

/** Builds a complete candidate using Cogni's conservative production defaults. */
export function createPredictionCandidate(
  input: PredictionCandidateInput,
): PredictionCandidate {
  return {
    key: input.key,
    destination: input.destination ?? input.key,
    policy: input.policy ?? DEFAULT_PREDICTION_POLICY,
    trigger: input.trigger ?? DEFAULT_PREDICTION_TRIGGER,
    probability:
      input.probability ??
      (input.cost === "high"
        ? DEFAULT_HIGH_COST_PREDICTION_PROBABILITY
        : DEFAULT_PREDICTION_PROBABILITY),
    horizonMs: input.horizonMs ?? DEFAULT_PREDICTION_HORIZON_MS,
    ...(input.cost === undefined ? {} : { cost: input.cost }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.estimatedBytes === undefined
      ? {}
      : { estimatedBytes: input.estimatedBytes }),
  };
}
