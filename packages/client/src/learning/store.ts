import type {
  AdaptiveCalibrationRecord,
  AdaptiveCalibrationRecordUpdater,
  AdaptiveCalibrationScope,
  AdaptiveCalibrationStore,
  AdaptiveCalibrationStoreOptions,
  AdaptiveCalibrationStoreUpdate,
} from "./types";

export class InMemoryAdaptiveCalibrationStore implements AdaptiveCalibrationStore {
  readonly #records = new Map<string, AdaptiveCalibrationRecord>();
  readonly #maxRecords: number;
  readonly #retentionMs: number;

  constructor(options: AdaptiveCalibrationStoreOptions = {}) {
    this.#maxRecords = positiveInteger(options.maxRecords ?? 2_000, "maxRecords");
    this.#retentionMs = positive(options.retentionMs ?? 90 * DAY_MS, "retentionMs");
  }

  async read(
    scope: Readonly<AdaptiveCalibrationScope>,
  ): Promise<AdaptiveCalibrationRecord | undefined> {
    const record = this.#records.get(adaptiveCalibrationRecordKey(scope));
    return record === undefined ? undefined : { ...record };
  }

  async update(
    scope: Readonly<AdaptiveCalibrationScope>,
    updater: AdaptiveCalibrationRecordUpdater,
  ): Promise<AdaptiveCalibrationRecord> {
    const records = await this.updateMany([{ scope, updater }]);
    return records[0] as AdaptiveCalibrationRecord;
  }

  async updateMany(
    updates: readonly AdaptiveCalibrationStoreUpdate[],
  ): Promise<readonly AdaptiveCalibrationRecord[]> {
    if (updates.length === 0) return [];
    assertUniqueUpdates(updates);
    const staged = new Map(this.#records);
    const nextRecords = updates.map(({ scope, updater }) => {
      const key = adaptiveCalibrationRecordKey(scope);
      const current = staged.get(key);
      const next = updater(current === undefined ? undefined : { ...current });
      assertRecordMatchesScope(next, scope);
      staged.set(key, { ...next });
      return { ...next };
    });
    this.#prune(staged);
    this.#records.clear();
    for (const [key, record] of staged) this.#records.set(key, record);
    return nextRecords;
  }

  async clearSubject(subjectKey: string, namespace?: string): Promise<void> {
    for (const [key, record] of this.#records) {
      if (
        record.subjectKey === subjectKey &&
        (namespace === undefined || record.namespace === namespace)
      ) {
        this.#records.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.#records.clear();
  }

  #prune(records: Map<string, AdaptiveCalibrationRecord>): void {
    const ordered = [...records.entries()].sort(
      ([leftKey, left], [rightKey, right]) =>
        left.updatedAt - right.updatedAt || leftKey.localeCompare(rightKey),
    );
    const newestAt = ordered.at(-1)?.[1].updatedAt;
    if (newestAt === undefined) return;
    const cutoff = newestAt - this.#retentionMs;
    for (const [key, record] of ordered) {
      if (record.updatedAt < cutoff) records.delete(key);
    }
    const excess = records.size - this.#maxRecords;
    if (excess <= 0) return;
    const remaining = ordered.filter(([key]) => records.has(key));
    for (const [key] of remaining.slice(0, excess)) records.delete(key);
  }
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export function adaptiveCalibrationRecordKey(
  scope: Readonly<AdaptiveCalibrationScope>,
): string {
  return JSON.stringify([
    scope.namespace,
    scope.subjectKey,
    scope.contextKey,
    scope.destination,
  ]);
}

export function adaptiveCalibrationSubjectKey(
  scope: Pick<AdaptiveCalibrationScope, "namespace" | "subjectKey">,
): string {
  return JSON.stringify([scope.namespace, scope.subjectKey]);
}

export function assertRecordMatchesScope(
  record: Readonly<AdaptiveCalibrationRecord>,
  scope: Readonly<AdaptiveCalibrationScope>,
): void {
  if (
    record.namespace !== scope.namespace ||
    record.subjectKey !== scope.subjectKey ||
    record.contextKey !== scope.contextKey ||
    record.destination !== scope.destination
  ) {
    throw new TypeError("calibration record must preserve its scope");
  }
}

export function assertUniqueUpdates(
  updates: readonly AdaptiveCalibrationStoreUpdate[],
): void {
  const keys = new Set<string>();
  for (const update of updates) {
    const key = adaptiveCalibrationRecordKey(update.scope);
    if (keys.has(key)) {
      throw new TypeError("calibration store updates must have unique scopes");
    }
    keys.add(key);
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be greater than 0`);
  }
  return value;
}
