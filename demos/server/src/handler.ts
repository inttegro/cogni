import {
  PredictionResourceRegistry,
  createCogniResourceServer,
  type BackendCapabilities,
  type PredictionOutcomeBatch,
} from "@inttegro/cogni-server";

interface AppContext {
  readonly accountId: string;
}

const capabilities: BackendCapabilities = {
  protocol_version: "1",
  transports: ["application/json", "application/x-ndjson"],
  representations: ["application/json"],
  limits: {
    max_candidates_per_batch: 4,
    max_horizon_ms: 60_000,
  },
  outcome_reporting: true,
};

const resources = new PredictionResourceRegistry<AppContext>();
resources.register("products.page", {
  validate(parameters) {
    const page = parameters.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      throw new TypeError("page must be a positive integer");
    }
    return { page };
  },
  async resolve({ context, parameters }) {
    return {
      payload: {
        account_id: context.accountId,
        page: parameters.page,
        products: [{ id: "prod_demo", name: "Cogni demo product" }],
      },
    };
  },
});

const recordedOutcomes: PredictionOutcomeBatch[] = [];
const cogni = createCogniResourceServer({
  capabilities,
  registry: resources,
  outcomes: async ({ batch }) => {
    recordedOutcomes.push(batch);
  },
});

/**
 * Mount this handler behind routes chosen by the host application. Authenticate
 * first, then pass the same account context used by foreground reads.
 */
export async function handleCogniRequest(
  request: Request,
  context: AppContext,
): Promise<Response> {
  switch (new URL(request.url).pathname) {
    case "/internal/predict/capabilities":
      return cogni.handleCapabilities(request, context);
    case "/internal/predict/execute":
      return cogni.handlePredictions(request, context);
    case "/internal/predict/outcomes":
      return cogni.handleOutcomes(request, context);
    default:
      return new Response("Not found", { status: 404 });
  }
}

export function outcomeHistory(): readonly PredictionOutcomeBatch[] {
  return recordedOutcomes;
}
