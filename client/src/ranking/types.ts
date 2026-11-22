/** A destination the host has already approved for predictive consideration. */
export interface CandidateRankingCandidate {
  /** Opaque, stable identity. Rankers must return only IDs from the input set. */
  readonly id: string;
  /** Short host-provided meaning, such as "Review recent orders". */
  readonly description: string;
}

export interface CandidateRankingInput<Context> {
  readonly candidates: readonly CandidateRankingCandidate[];
  /** Host-owned, privacy-reviewed context used only to rank the candidates. */
  readonly context: Context;
  readonly signal: AbortSignal;
}

export interface CandidateRankingResult {
  /** Every input ID exactly once, ordered from most to least likely. */
  readonly rankedCandidateIds: readonly string[];
  /** Optional bounded classification for aggregate measurement and calibration. */
  readonly intent?: string;
}

/**
 * An optional ranking signal. The host and coordinator remain responsible for
 * candidate generation, calibrated probabilities, budgets, and scheduling.
 */
export interface CandidateRanker<Context> {
  rank(input: CandidateRankingInput<Context>): Promise<CandidateRankingResult | null>;
}
