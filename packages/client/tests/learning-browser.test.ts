import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  composeUserDeviceSubjectKey,
  createBrowserPredictionCalibration,
  getOrCreateCogniDeviceKey,
  IndexedDbAdaptiveCalibrationStore,
} from "../src/learning-browser";
import type { AdaptiveCalibrationScope } from "../src/learning";

function scope(overrides: Partial<AdaptiveCalibrationScope> = {}) {
  return {
    namespace: "shop",
    subjectKey: "user-device",
    contextKey: "/home",
    destination: "/orders",
    ...overrides,
  };
}

describe("IndexedDbAdaptiveCalibrationStore", () => {
  it("updates aggregates atomically and clears one subject", async () => {
    const store = new IndexedDbAdaptiveCalibrationStore({
      databaseName: "learning-test",
      indexedDB: new IDBFactory(),
    });
    const firstScope = scope();
    const secondScope = scope({ subjectKey: "other-device" });

    await store.update(firstScope, () => ({
      ...firstScope,
      successWeight: 1,
      failureWeight: 0,
      updatedAt: 100,
    }));
    await store.update(firstScope, (current) => ({
      ...firstScope,
      successWeight: (current?.successWeight ?? 0) + 1,
      failureWeight: 0,
      updatedAt: 200,
    }));
    await store.update(secondScope, () => ({
      ...secondScope,
      successWeight: 1,
      failureWeight: 0,
      updatedAt: 100,
    }));

    expect((await store.read(firstScope))?.successWeight).toBe(2);
    await store.clearSubject("user-device", "shop");
    expect(await store.read(firstScope)).toBeUndefined();
    expect((await store.read(secondScope))?.successWeight).toBe(1);
    await store.close();
  });

  it("batches choice updates and evicts the oldest aggregate", async () => {
    const store = new IndexedDbAdaptiveCalibrationStore({
      databaseName: "learning-bounds-test",
      indexedDB: new IDBFactory(),
      maxRecords: 2,
      retentionMs: 10_000,
    });
    const scopes: AdaptiveCalibrationScope[] = [
      scope({ destination: "/first" }),
      scope({ destination: "/second" }),
      scope({ destination: "/third" }),
    ];
    await store.updateMany(
      scopes.map((candidateScope, index) => ({
        scope: candidateScope,
        updater: () => ({
          ...candidateScope,
          successWeight: 1,
          failureWeight: 0,
          updatedAt: (index + 1) * 100,
        }),
      })),
    );

    expect(await store.read(scopes[0]!)).toBeUndefined();
    expect((await store.read(scopes[1]!))?.successWeight).toBe(1);
    expect((await store.read(scopes[2]!))?.successWeight).toBe(1);
    await store.close();
  });

  it("aborts a batch when an updater fails", async () => {
    const store = new IndexedDbAdaptiveCalibrationStore({
      databaseName: "learning-atomicity-test",
      indexedDB: new IDBFactory(),
    });
    const firstScope = scope();
    const secondScope = scope({ destination: "/products" });

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
    await store.close();
  });

  it("starts fresh after its IndexedDB database is cleared", async () => {
    const indexedDB = new IDBFactory();
    const databaseName = "learning-cleared-test";
    const store = new IndexedDbAdaptiveCalibrationStore({
      databaseName,
      indexedDB,
    });
    const candidateScope = scope();
    await store.update(candidateScope, () => ({
      ...candidateScope,
      successWeight: 4,
      failureWeight: 0,
      updatedAt: 100,
    }));

    await deleteDatabase(indexedDB, databaseName);
    expect(await store.read(candidateScope)).toBeUndefined();
    await store.update(candidateScope, () => ({
      ...candidateScope,
      successWeight: 1,
      failureWeight: 0,
      updatedAt: 200,
    }));
    expect((await store.read(candidateScope))?.successWeight).toBe(1);
    await store.close();
  });
});

describe("user-device identity helpers", () => {
  it("persists a random browser-profile key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const first = getOrCreateCogniDeviceKey({
      storage,
      randomUUID: () => "device-123",
    });
    const second = getOrCreateCogniDeviceKey({
      storage,
      randomUUID: () => "unused",
    });

    expect(first).toBe("device-123");
    expect(second).toBe(first);
    expect(composeUserDeviceSubjectKey("opaque-user", first)).toBe(
      '["opaque-user","device-123"]',
    );
  });

  it("keeps calibration available when browser persistence is unavailable", async () => {
    const calibration = createBrowserPredictionCalibration({
      opaqueUserKey: "opaque-user",
      storage: {
        getItem: () => {
          throw new Error("storage denied");
        },
        setItem: () => {
          throw new Error("storage denied");
        },
      },
      randomUUID: () => "runtime-device",
      location: {
        origin: "https://example.test",
        pathname: "/orders",
        search: "",
      },
    });
    const candidate = {
      key: "route:/products",
      policy: "test",
      trigger: "idle",
      destination: "/products",
      probability: 0.75,
      horizonMs: 10_000,
    };

    await expect(calibration.calibrate(candidate)).resolves.toMatchObject(candidate);
  });
});

function deleteDatabase(indexedDB: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`database ${name} is blocked`));
  });
}
