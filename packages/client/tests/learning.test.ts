import { describe, expect, it } from "vitest";

import type {
  PredictionCandidate,
  PredictionOutcome,
  PredictionTerminalResult,
  RequiredPredictionCandidate,
} from "../src";
import {
  AdaptivePredictionCalibrator,
  InMemoryAdaptiveCalibrationStore,
} from "../src/learning";

function candidate(probability = 0.5): PredictionCandidate {
  return {
    key: "orders",
    policy: "navigation",
    trigger: "idle",
    destination: "/orders",
    probability,
    horizonMs: 5_000,
  };
}

function terminalResult(
  outcome: PredictionOutcome,
  overrides: Partial<PredictionTerminalResult> = {},
): PredictionTerminalResult {
  const required: RequiredPredictionCandidate = {
    ...candidate(),
    cost: "standard",
    priority: 0,
    estimatedBytes: 1_000,
  };
  return {
    candidate: required,
    outcome,
    acceptedAt: 0,
    completedAt: 1_000,
    materialWork: true,
    bytes: 1_000,
    ...overrides,
  };
}

async function observe(
  calibrator: AdaptivePredictionCalibrator,
  outcome: "reused" | "missed",
  count: number,
  at = 1_000,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await calibrator.observe({
      subjectKey: "user-device",
      contextKey: "/home",
      result: terminalResult(outcome, { completedAt: at }),
    });
  }
}

describe("AdaptivePredictionCalibrator", () => {
  it("keeps cold-start candidates anchored to the host probability", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
    });

    const result = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(0.62),
      at: 0,
    });

    expect(result.candidate.probability).toBe(0.62);
    expect(result.calibration).toMatchObject({
      baseProbability: 0.62,
      evidence: 0,
      confidence: 0,
      adjustment: 0,
    });
  });

  it("raises and lowers probabilities from material reuse outcomes", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      minimumEvidence: 5,
    });
    await observe(calibrator, "reused", 8);

    const raised = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(),
      at: 1_000,
    });
    expect(raised.candidate.probability).toBeGreaterThan(0.5);
    expect(raised.calibration.evidence).toBe(8);

    await observe(calibrator, "missed", 16);
    const lowered = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(),
      at: 1_000,
    });
    expect(lowered.candidate.probability).toBeLessThan(0.5);
    expect(lowered.calibration.evidence).toBe(24);
  });

  it("learns committed choices even when no prediction ran", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      minimumEvidence: 5,
    });
    for (let index = 0; index < 8; index += 1) {
      await calibrator.observeChoice({
        subjectKey: "user-device",
        contextKey: "/home",
        chosenDestination: "/orders",
        consideredDestinations: ["/orders", "/products", "/orders"],
        at: 1_000,
      });
    }

    const orders = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(),
      at: 1_000,
    });
    const products = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: { ...candidate(), key: "products", destination: "/products" },
      at: 1_000,
    });

    expect(orders.candidate.probability).toBeGreaterThan(0.5);
    expect(products.candidate.probability).toBeLessThan(0.5);
    expect(orders.calibration.evidence).toBe(8);
    expect(products.calibration.evidence).toBe(8);
  });

  it("bounds the candidate set used for choice learning", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      maxChoiceDestinations: 2,
    });

    await expect(
      calibrator.observeChoice({
        subjectKey: "user-device",
        contextKey: "/home",
        chosenDestination: "/orders",
        consideredDestinations: ["/orders", "/products", "/customers"],
      }),
    ).rejects.toThrow("at most 2 destinations");
  });

  it("decays old evidence and caps the learned adjustment", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      halfLifeMs: 1_000,
      minimumEvidence: 0,
      confidenceScale: 1,
      priorStrength: 0,
      maxAdjustment: 0.1,
    });
    await observe(calibrator, "reused", 8, 0);

    const immediate = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(0.2),
      at: 0,
    });
    expect(immediate.candidate.probability).toBeCloseTo(0.3);

    const decayed = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(0.2),
      at: 1_000,
    });
    expect(decayed.calibration.evidence).toBeCloseTo(4);
  });

  it("does not compound an already calibrated candidate", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      minimumEvidence: 0,
    });
    await observe(calibrator, "reused", 8);
    const first = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(0.5),
      at: 1_000,
    });
    const second = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: first.candidate,
      at: 1_000,
    });

    expect(second.calibration.baseProbability).toBe(0.5);
    expect(second.candidate.probability).toBe(first.candidate.probability);
  });

  it("keeps evidence timestamps monotonic when outcomes arrive out of order", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
      halfLifeMs: 1_000,
      minimumEvidence: 0,
    });
    await observe(calibrator, "reused", 1, 2_000);
    await observe(calibrator, "missed", 1, 1_000);

    const result = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(),
      at: 2_000,
    });
    expect(result.calibration.evidence).toBe(2);
  });

  it("ignores operational failures and non-material outcomes", async () => {
    const calibrator = new AdaptivePredictionCalibrator({
      store: new InMemoryAdaptiveCalibrationStore(),
    });
    expect(
      await calibrator.observe({
        subjectKey: "user-device",
        contextKey: "/home",
        result: terminalResult("failed"),
      }),
    ).toBe(false);
    expect(
      await calibrator.observe({
        subjectKey: "user-device",
        contextKey: "/home",
        result: terminalResult("reused", { materialWork: false }),
      }),
    ).toBe(false);

    const result = await calibrator.calibrate({
      subjectKey: "user-device",
      contextKey: "/home",
      candidate: candidate(),
    });
    expect(result.calibration.evidence).toBe(0);
  });

  it("can delete one subject without disturbing another", async () => {
    const store = new InMemoryAdaptiveCalibrationStore();
    const calibrator = new AdaptivePredictionCalibrator({ store });
    await observe(calibrator, "reused", 6);
    await calibrator.observe({
      subjectKey: "other-device",
      contextKey: "/home",
      result: terminalResult("reused"),
    });

    await calibrator.clearSubject("user-device");
    expect(
      (
        await calibrator.calibrate({
          subjectKey: "user-device",
          contextKey: "/home",
          candidate: candidate(),
          at: 1_000,
        })
      ).calibration.evidence,
    ).toBe(0);
    expect(
      (
        await calibrator.calibrate({
          subjectKey: "other-device",
          contextKey: "/home",
          candidate: candidate(),
          at: 1_000,
        })
      ).calibration.evidence,
    ).toBe(1);
  });
});

describe("InMemoryAdaptiveCalibrationStore", () => {
  it("does not commit a partial batch when an updater fails", async () => {
    const store = new InMemoryAdaptiveCalibrationStore();
    const firstScope = {
      namespace: "shop",
      subjectKey: "user-device",
      contextKey: "/home",
      destination: "/orders",
    };
    const secondScope = { ...firstScope, destination: "/products" };

    await expect(
      store.updateMany([
        {
          scope: firstScope,
          updater: () => ({
            ...firstScope,
            successWeight: 1,
            failureWeight: 0,
            updatedAt: 100,
          }),
        },
        {
          scope: secondScope,
          updater: () => ({
            ...secondScope,
            destination: "/wrong",
            successWeight: 1,
            failureWeight: 0,
            updatedAt: 100,
          }),
        },
      ]),
    ).rejects.toThrow("must preserve its scope");

    expect(await store.read(firstScope)).toBeUndefined();
    expect(await store.read(secondScope)).toBeUndefined();
  });
});
