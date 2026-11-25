import {
  adaptiveCalibrationRecordKey,
  adaptiveCalibrationSubjectKey,
  assertRecordMatchesScope,
  assertUniqueUpdates,
} from "./store";
import { AdaptivePredictionCalibrator } from "./calibrator";
import { InMemoryAdaptiveCalibrationStore } from "./store";
import type {
  PredictionCalibrationController,
  PredictionCandidate,
  PredictionTerminalResult,
} from "../core/types";
import type {
  AdaptiveCalibrationRecord,
  AdaptiveCalibrationRecordUpdater,
  AdaptiveCalibrationScope,
  AdaptiveCalibrationStore,
  AdaptiveCalibrationStoreOptions,
  AdaptiveCalibrationStoreUpdate,
} from "./types";

interface StoredCalibrationRecord {
  key: string;
  subject: string;
  updatedAt: number;
  record: AdaptiveCalibrationRecord;
}

export interface IndexedDbAdaptiveCalibrationStoreOptions extends AdaptiveCalibrationStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
}

export interface BrowserPredictionCalibrationOptions {
  /** Opaque stable key for the currently authenticated account. */
  opaqueUserKey: string;
  /** Dependency injection for tests and non-standard browser hosts. */
  indexedDB?: IDBFactory;
  storage?: Pick<Storage, "getItem" | "setItem">;
  randomUUID?: () => string;
  location?: Pick<Location, "origin" | "pathname" | "search">;
}

export class IndexedDbAdaptiveCalibrationStore implements AdaptiveCalibrationStore {
  readonly #databaseName: string;
  readonly #storeName = "calibration";
  readonly #indexedDB: IDBFactory;
  readonly #maxRecords: number;
  readonly #retentionMs: number;
  #database: Promise<IDBDatabase> | undefined;

  constructor(options: IndexedDbAdaptiveCalibrationStoreOptions = {}) {
    this.#databaseName = options.databaseName ?? "inttegro-cogni-learning";
    this.#maxRecords = positiveInteger(options.maxRecords ?? 2_000, "maxRecords");
    this.#retentionMs = positive(options.retentionMs ?? 90 * DAY_MS, "retentionMs");
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (factory === undefined) {
      throw new TypeError("IndexedDB is unavailable in this environment");
    }
    this.#indexedDB = factory;
  }

  async read(
    scope: Readonly<AdaptiveCalibrationScope>,
  ): Promise<AdaptiveCalibrationRecord | undefined> {
    const database = await this.#open();
    const transaction = database.transaction(this.#storeName, "readonly");
    const stored = await requestResult<StoredCalibrationRecord | undefined>(
      transaction.objectStore(this.#storeName).get(adaptiveCalibrationRecordKey(scope)),
    );
    await transactionDone(transaction);
    return stored === undefined ? undefined : { ...stored.record };
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
    const database = await this.#open();
    const transaction = database.transaction(this.#storeName, "readwrite");
    try {
      const store = transaction.objectStore(this.#storeName);
      const stored = await Promise.all(
        updates.map(({ scope }) =>
          requestResult<StoredCalibrationRecord | undefined>(
            store.get(adaptiveCalibrationRecordKey(scope)),
          ),
        ),
      );
      const nextRecords = updates.map(({ scope, updater }, index) => {
        const current = stored[index];
        const next = updater(current === undefined ? undefined : { ...current.record });
        assertRecordMatchesScope(next, scope);
        store.put({
          key: adaptiveCalibrationRecordKey(scope),
          subject: adaptiveCalibrationSubjectKey(scope),
          updatedAt: next.updatedAt,
          record: { ...next },
        } satisfies StoredCalibrationRecord);
        return { ...next };
      });
      await pruneStoredRecords(
        store,
        Math.max(...nextRecords.map(({ updatedAt }) => updatedAt)),
        this.#maxRecords,
        this.#retentionMs,
      );
      await transactionDone(transaction);
      return nextRecords;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The browser may already have aborted or completed the transaction.
      }
      throw error;
    }
  }

  async clearSubject(subjectKey: string, namespace?: string): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(this.#storeName, "readwrite");
    const store = transaction.objectStore(this.#storeName);
    if (namespace !== undefined) {
      const index = store.index("subject");
      await deleteCursorMatches(
        index.openCursor(adaptiveCalibrationSubjectKey({ namespace, subjectKey })),
      );
    } else {
      await deleteCursorMatches(store.openCursor(), (value) => {
        const stored = value as StoredCalibrationRecord;
        return stored.record.subjectKey === subjectKey;
      });
    }
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(this.#storeName, "readwrite");
    transaction.objectStore(this.#storeName).clear();
    await transactionDone(transaction);
  }

  async close(): Promise<void> {
    const database = await this.#database;
    database?.close();
    this.#database = undefined;
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise((resolve, reject) => {
      const request = this.#indexedDB.open(this.#databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(this.#storeName)
          ? request.transaction?.objectStore(this.#storeName)
          : database.createObjectStore(this.#storeName, { keyPath: "key" });
        if (store !== undefined && !store.indexNames.contains("subject")) {
          store.createIndex("subject", "subject", { unique: false });
        }
        if (store !== undefined && !store.indexNames.contains("updatedAt")) {
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.#database = undefined;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error(`IndexedDB database ${this.#databaseName} is blocked`));
    });
    return this.#database;
  }
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface CogniDeviceKeyOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  storageKey?: string;
  randomUUID?: () => string;
}

/** Returns a stable browser-profile key without collecting hardware identifiers. */
export function getOrCreateCogniDeviceKey(options: CogniDeviceKeyOptions = {}): string {
  const storage = options.storage ?? globalThis.localStorage;
  const storageKey = options.storageKey ?? "inttegro.cogni.device";
  const existing = storage.getItem(storageKey);
  if (existing?.trim()) return existing;
  const deviceKey = createRandomDeviceKey(options.randomUUID);
  storage.setItem(storageKey, deviceKey);
  return deviceKey;
}

/** Combines an already-opaque user key with a browser-profile key. */
export function composeUserDeviceSubjectKey(
  opaqueUserKey: string,
  deviceKey: string,
): string {
  if (!opaqueUserKey.trim()) throw new TypeError("opaqueUserKey must not be empty");
  if (!deviceKey.trim()) throw new TypeError("deviceKey must not be empty");
  return JSON.stringify([opaqueUserKey, deviceKey]);
}

/**
 * Creates the browser's default learning controller.
 *
 * Persistence is best-effort: unavailable, cleared, or replaced IndexedDB
 * storage falls back to a fresh in-memory model and never blocks prediction.
 */
export function createBrowserPredictionCalibration(
  options: BrowserPredictionCalibrationOptions,
): PredictionCalibrationController {
  const location = options.location ?? globalThis.location;
  const deviceKey = resilientDeviceKey({
    ...(options.randomUUID === undefined ? {} : { randomUUID: options.randomUUID }),
    ...(options.storage === undefined ? {} : { storage: options.storage }),
  });
  const subjectKey = composeUserDeviceSubjectKey(options.opaqueUserKey, deviceKey);
  const memory = new InMemoryAdaptiveCalibrationStore();
  let store: AdaptiveCalibrationStore = memory;
  try {
    const persistent = new IndexedDbAdaptiveCalibrationStore({
      ...(options.indexedDB === undefined ? {} : { indexedDB: options.indexedDB }),
    });
    store = new FailOpenAdaptiveCalibrationStore(persistent, memory);
  } catch {
    // Private browsing and hardened browsers may make IndexedDB unavailable.
  }

  const calibrator = new AdaptivePredictionCalibrator({
    namespace: location?.origin ?? "browser",
    store,
  });
  const contextKey = () =>
    location === undefined ? "browser" : `${location.pathname}${location.search}`;

  return {
    async calibrate(candidate: Readonly<PredictionCandidate>) {
      try {
        return (
          await calibrator.calibrate({
            subjectKey,
            contextKey: contextKey(),
            candidate,
          })
        ).candidate;
      } catch {
        return candidate;
      }
    },
    async observe(result: Readonly<PredictionTerminalResult>) {
      try {
        await calibrator.observe({
          subjectKey,
          contextKey: contextKey(),
          result,
        });
      } catch {
        // Learning is never allowed to interfere with application behavior.
      }
    },
  };
}

class FailOpenAdaptiveCalibrationStore implements AdaptiveCalibrationStore {
  #store: AdaptiveCalibrationStore;

  constructor(
    persistent: AdaptiveCalibrationStore,
    readonly fallback: AdaptiveCalibrationStore,
  ) {
    this.#store = persistent;
  }

  async read(scope: Readonly<AdaptiveCalibrationScope>) {
    return this.#run((store) => store.read(scope));
  }

  async update(
    scope: Readonly<AdaptiveCalibrationScope>,
    updater: AdaptiveCalibrationRecordUpdater,
  ) {
    return this.#run((store) => store.update(scope, updater));
  }

  async updateMany(updates: readonly AdaptiveCalibrationStoreUpdate[]) {
    return this.#run((store) => store.updateMany(updates));
  }

  async clearSubject(subjectKey: string, namespace?: string) {
    await this.#run((store) => store.clearSubject(subjectKey, namespace));
  }

  async clear() {
    await this.#run((store) => store.clear());
  }

  async #run<Value>(operation: (store: AdaptiveCalibrationStore) => Promise<Value>) {
    try {
      return await operation(this.#store);
    } catch {
      this.#store = this.fallback;
      return operation(this.#store);
    }
  }
}

function resilientDeviceKey({
  storage,
  randomUUID,
}: Pick<CogniDeviceKeyOptions, "storage" | "randomUUID">): string {
  try {
    return getOrCreateCogniDeviceKey({
      ...(randomUUID === undefined ? {} : { randomUUID }),
      ...(storage === undefined ? {} : { storage }),
    });
  } catch {
    return createRandomDeviceKey(randomUUID);
  }
}

function createRandomDeviceKey(randomUUID?: () => string): string {
  try {
    const uuid = randomUUID ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
    if (uuid !== undefined) return uuid();

    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues(bytes);
    if (bytes.some((byte) => byte !== 0)) {
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // A non-persistent runtime key is sufficient when browser randomness is restricted.
  }

  return [Date.now().toString(36), Math.random().toString(36).slice(2)].join("-");
}

function requestResult<Value>(request: IDBRequest<Value>): Promise<Value> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteCursorMatches(
  request: IDBRequest<IDBCursorWithValue | null>,
  matches: (value: unknown) => boolean = () => true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve();
        return;
      }
      if (matches(cursor.value)) cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function pruneStoredRecords(
  store: IDBObjectStore,
  referenceAt: number,
  maxRecords: number,
  retentionMs: number,
): Promise<void> {
  const total = await requestResult(store.count());
  let excess = Math.max(0, total - maxRecords);
  const cutoff = referenceAt - retentionMs;
  await deleteCursorMatches(store.index("updatedAt").openCursor(), (value) => {
    const stored = value as StoredCalibrationRecord;
    if (stored.updatedAt < cutoff) {
      if (excess > 0) excess -= 1;
      return true;
    }
    if (excess <= 0) return false;
    excess -= 1;
    return true;
  });
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
