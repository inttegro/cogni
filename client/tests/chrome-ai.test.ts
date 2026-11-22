import { describe, expect, it, vi } from "vitest";

import {
  createChromePromptCandidateRanker,
  type ChromeLanguageModelApi,
  type ChromeLanguageModelSession,
  type ChromePromptCandidateRankerEvent,
} from "../src/chrome-ai";

const candidates = [
  { id: "orders", description: "Review recent orders" },
  { id: "customers", description: "Manage customers" },
] as const;

describe("Chrome Prompt API candidate ranker", () => {
  it("ranks only the host-provided allowlist with structured output", async () => {
    const session = mockSession({
      rankedCandidateIds: ["customers", "orders"],
      intent: "customer_management",
    });
    const api = mockApi("available", session);
    const events: ChromePromptCandidateRankerEvent[] = [];
    const ranker = createChromePromptCandidateRanker({
      describeContext: (context: { current: string }) =>
        `Current route: ${context.current}`,
      languageModel: api,
      onEvent: (event) => events.push(event),
    });

    await expect(
      ranker.rank({
        candidates,
        context: { current: "home" },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      rankedCandidateIds: ["customers", "orders"],
      intent: "customer_management",
    });

    expect(api.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    expect(session.prompt).toHaveBeenCalledWith(
      expect.stringContaining('"id":"orders"'),
      expect.objectContaining({
        responseConstraint: expect.objectContaining({
          properties: expect.objectContaining({
            rankedCandidateIds: expect.objectContaining({
              items: { type: "string", enum: ["orders", "customers"] },
            }),
          }),
        }),
      }),
    );
    expect(session.destroy).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "ranked", candidateCount: 2 });
  });

  it("does not create a session or start a model download when not ready", async () => {
    const api = mockApi("downloadable", mockSession({}));
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: api,
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();

    expect(api.create).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({
      type: "unavailable",
      reason: "model_not_ready",
      availability: "downloadable",
    });
  });

  it("rejects responses that omit or invent candidate IDs", async () => {
    const session = mockSession({ rankedCandidateIds: ["settings", "orders"] });
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: mockApi("available", session),
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();

    expect(onEvent).toHaveBeenCalledWith({ type: "invalid_response" });
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it("enforces the output shape even if the browser returns extra fields", async () => {
    const session = mockSession({
      rankedCandidateIds: ["orders", "customers"],
      destination: "/unapproved",
    });
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: mockApi("available", session),
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    expect(onEvent).toHaveBeenCalledWith({ type: "invalid_response" });
  });

  it("does not let session cleanup replace a valid ranking", async () => {
    const session = mockSession({
      rankedCandidateIds: ["orders", "customers"],
    });
    vi.mocked(session.destroy).mockImplementation(() => {
      throw new Error("cleanup failed");
    });
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: mockApi("available", session),
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      rankedCandidateIds: ["orders", "customers"],
    });
  });

  it("returns the static-policy fallback without Chrome's API", async () => {
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    expect(onEvent).toHaveBeenCalledWith({
      type: "unavailable",
      reason: "api_unavailable",
    });
  });

  it("honors cancellation without reporting an adapter failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const api = mockApi("available", mockSession({}));
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: api,
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: controller.signal,
      }),
    ).resolves.toBeNull();

    expect(api.availability).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("rejects unbounded input before invoking the model", async () => {
    const api = mockApi("available", mockSession({}));
    const onEvent = vi.fn();
    const ranker = createChromePromptCandidateRanker({
      describeContext: () => "Current route: home",
      languageModel: api,
      maxCandidates: 1,
      onEvent,
    });

    await expect(
      ranker.rank({
        candidates,
        context: undefined,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
    expect(api.availability).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({
      type: "invalid_input",
      reason: "candidate count exceeds 1",
    });
  });
});

function mockApi(
  availability: string,
  session: ChromeLanguageModelSession,
): ChromeLanguageModelApi {
  return {
    availability: vi.fn(async () => availability),
    create: vi.fn(async () => session),
  };
}

function mockSession(value: unknown): ChromeLanguageModelSession {
  return {
    prompt: vi.fn(async () => JSON.stringify(value)),
    destroy: vi.fn(),
  };
}
