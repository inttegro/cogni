import type {
  PredictionCandidate,
  PredictionEvent,
  PredictionSchedulerEvent,
} from "@inttegro/cogni-client";

export const COGNI_DEVTOOLS_PROTOCOL = "inttegro.cogni.devtools.v1";

export type CogniDevtoolsEventSource = "coordinator" | "scheduler";

export type CogniDevtoolsTraceState =
  | "scheduled"
  | "accepted"
  | "running"
  | "waiting_for_reuse"
  | "reused"
  | "missed"
  | "failed"
  | "cancelled"
  | "expired"
  | "rejected";

export interface CogniDevtoolsEntry {
  id: number;
  source: CogniDevtoolsEventSource;
  type: PredictionEvent["type"] | PredictionSchedulerEvent["type"];
  at: number;
  candidate?: Readonly<PredictionCandidate>;
  details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CogniDevtoolsTrace {
  id: string;
  attempt: number;
  candidate: Readonly<PredictionCandidate>;
  state: CogniDevtoolsTraceState;
  firstAt: number;
  lastAt: number;
  materialWork: boolean;
  bytes: number;
  startMode?: string;
  reason?: string;
}

export interface CogniDevtoolsSummary {
  active: number;
  outcomes: number;
  materialOutcomes: number;
  reused: number;
  missed: number;
  failed: number;
  rejected: number;
  totalBytes: number;
  reusedBytes: number;
  wastedBytes: number;
  reuseRate: number | null;
  byteReuseRate: number | null;
  expectedReuseRate: number | null;
  calibrationGap: number | null;
}

export interface CogniDevtoolsSnapshot {
  protocol: typeof COGNI_DEVTOOLS_PROTOCOL;
  generatedAt: number;
  environmentAllowed: boolean;
  foregroundActivity: number;
  entries: readonly CogniDevtoolsEntry[];
  traces: readonly CogniDevtoolsTrace[];
  summary: CogniDevtoolsSummary;
}

export interface CogniDevtoolsStore {
  snapshot(): CogniDevtoolsSnapshot;
  subscribe(listener: (snapshot: CogniDevtoolsSnapshot) => void): () => void;
}

export interface CogniDevtoolsCommand {
  type: "highlight";
  destination: string;
}

export type CogniDevtoolsPageMessage =
  | {
      protocol: typeof COGNI_DEVTOOLS_PROTOCOL;
      direction: "cogni-to-devtools";
      type: "snapshot";
      snapshot: CogniDevtoolsSnapshot;
    }
  | {
      protocol: typeof COGNI_DEVTOOLS_PROTOCOL;
      direction: "devtools-to-cogni";
      type: "request_snapshot";
    }
  | {
      protocol: typeof COGNI_DEVTOOLS_PROTOCOL;
      direction: "devtools-to-cogni";
      type: "command";
      command: CogniDevtoolsCommand;
    };
