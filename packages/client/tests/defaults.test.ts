import { describe, expect, it } from "vitest";
import {
  createPredictionCandidate,
  DEFAULT_HIGH_COST_PREDICTION_PROBABILITY,
  DEFAULT_PREDICTION_HORIZON_MS,
  DEFAULT_PREDICTION_POLICY,
  DEFAULT_PREDICTION_PROBABILITY,
  DEFAULT_PREDICTION_TRIGGER,
} from "../src/index";

describe("prediction defaults", () => {
  it("turns a safe host work identity into a complete candidate", () => {
    expect(createPredictionCandidate({ key: "query:recent-orders" })).toEqual({
      key: "query:recent-orders",
      destination: "query:recent-orders",
      policy: DEFAULT_PREDICTION_POLICY,
      trigger: DEFAULT_PREDICTION_TRIGGER,
      probability: DEFAULT_PREDICTION_PROBABILITY,
      horizonMs: DEFAULT_PREDICTION_HORIZON_MS,
    });
  });

  it("allows advanced policy values without changing the candidate shape", () => {
    expect(
      createPredictionCandidate({
        key: "media:hero",
        destination: "hero-media",
        policy: "landing-media",
        trigger: "viewport",
        probability: 0.94,
        horizonMs: 5_000,
        cost: "high",
        priority: 4,
        estimatedBytes: 2_048,
      }),
    ).toEqual({
      key: "media:hero",
      destination: "hero-media",
      policy: "landing-media",
      trigger: "viewport",
      probability: 0.94,
      horizonMs: 5_000,
      cost: "high",
      priority: 4,
      estimatedBytes: 2_048,
    });
  });

  it("uses the stricter admission prior for high-cost work", () => {
    expect(
      createPredictionCandidate({ key: "media:hero", cost: "high" }).probability,
    ).toBe(DEFAULT_HIGH_COST_PREDICTION_PROBABILITY);
  });
});
