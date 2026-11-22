export type ProtocolVersion = "1";
export type PredictionCost = "low" | "standard" | "high";
export type PredictionOutcome = "reused" | "missed" | "expired" | "cancelled";

export interface BackendCapabilities {
  readonly protocol_version: ProtocolVersion;
  readonly transports: readonly ("application/json" | "application/x-ndjson")[];
  readonly representations: readonly "application/json"[];
  readonly limits: {
    readonly max_candidates_per_batch: number;
    readonly max_horizon_ms: number;
  };
  readonly outcome_reporting: boolean;
}

export interface ResourceRequest {
  /** Backend-registered read-only resource name, never a URL. */
  readonly name: string;
  /** Opaque identity used by the frontend cache adapter. */
  readonly cache_key: string;
  /** Resource-specific JSON parameters validated by the backend. */
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface PredictionCandidateRequest {
  readonly prediction_id: string;
  readonly resource: ResourceRequest;
  readonly policy: string;
  readonly trigger: string;
  readonly probability: number;
  readonly horizon_ms: number;
  readonly cost: PredictionCost;
  readonly priority?: number;
  readonly estimated_bytes?: number;
}

export interface PredictionBatchRequest {
  readonly protocol_version: ProtocolVersion;
  readonly request_id: string;
  readonly candidates: readonly PredictionCandidateRequest[];
}

interface EventBase {
  readonly protocol_version: ProtocolVersion;
  readonly request_id: string;
  readonly at: string;
}

export interface PredictionAcceptedEvent extends EventBase {
  readonly type: "prediction.accepted";
  readonly prediction_id: string;
  readonly expires_at: string;
}

export interface ResolvedResource {
  readonly name: string;
  readonly cache_key: string;
  readonly media_type: "application/json";
  readonly payload: unknown;
  readonly etag?: string;
  readonly expires_at?: string;
}

export interface PredictionWork {
  readonly material_work: boolean;
  readonly bytes: number;
  readonly duration_ms: number;
}

export interface PredictionResolvedEvent extends EventBase {
  readonly type: "prediction.resolved";
  readonly prediction_id: string;
  readonly resource: ResolvedResource;
  readonly work: PredictionWork;
}

export type PredictionRejectionReason =
  | "below_quality_gate"
  | "budget_exhausted"
  | "queue_full"
  | "unavailable"
  | "invalid_parameters"
  | "unsupported_representation";

export interface PredictionRejectedEvent extends EventBase {
  readonly type: "prediction.rejected";
  readonly prediction_id: string;
  readonly reason: PredictionRejectionReason;
}

export type PredictionFailureCode = "cancelled" | "deadline_exceeded" | "backend_error";

export interface PredictionFailedEvent extends EventBase {
  readonly type: "prediction.failed";
  readonly prediction_id: string;
  readonly code: PredictionFailureCode;
  readonly retryable: boolean;
}

export interface PredictionBatchSummary {
  readonly accepted: number;
  readonly resolved: number;
  readonly rejected: number;
  readonly failed: number;
}

export interface PredictionBatchCompletedEvent extends EventBase {
  readonly type: "batch.completed";
  readonly summary: PredictionBatchSummary;
}

export type PredictionEvent =
  | PredictionAcceptedEvent
  | PredictionResolvedEvent
  | PredictionRejectedEvent
  | PredictionFailedEvent
  | PredictionBatchCompletedEvent;

export interface PredictionBatchResponse {
  readonly protocol_version: ProtocolVersion;
  readonly request_id: string;
  readonly events: readonly PredictionEvent[];
}

export interface PredictionOutcomeRecord {
  readonly prediction_id: string;
  readonly outcome: PredictionOutcome;
  readonly observed_at: string;
  readonly lead_time_ms?: number;
}

export interface PredictionOutcomeBatch {
  readonly protocol_version: ProtocolVersion;
  readonly request_id: string;
  readonly outcomes: readonly PredictionOutcomeRecord[];
}

export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly [key: string]: unknown;
}
