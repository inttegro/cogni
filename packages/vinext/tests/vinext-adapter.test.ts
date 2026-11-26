import {
  NextCogniProvider,
  PredictiveLink as NextPredictiveLink,
  createNextRouteCandidate,
  useNextDelegatedRouteIntent,
  useNextRouteIntent,
  useNextRoutePrediction,
} from "@inttegro/cogni-next";
import { describe, expect, it } from "vitest";
import {
  PredictiveLink,
  VinextCogniProvider,
  createVinextRouteCandidate,
  useVinextDelegatedRouteIntent,
  useVinextRouteIntent,
  useVinextRoutePrediction,
} from "../src/index";

describe("Vinext adapter", () => {
  it("reuses the public Next-compatible route integration", () => {
    expect(VinextCogniProvider).toBe(NextCogniProvider);
    expect(PredictiveLink).toBe(NextPredictiveLink);
    expect(createVinextRouteCandidate).toBe(createNextRouteCandidate);
    expect(useVinextDelegatedRouteIntent).toBe(useNextDelegatedRouteIntent);
    expect(useVinextRouteIntent).toBe(useNextRouteIntent);
    expect(useVinextRoutePrediction).toBe(useNextRoutePrediction);
  });

  it("brands route candidates for the Next-compatible cache contract", () => {
    expect(createVinextRouteCandidate("/orders", "hover", {})).toMatchObject({
      key: "next-route:/orders",
      policy: "next-route",
      destination: "/orders",
    });
  });
});
