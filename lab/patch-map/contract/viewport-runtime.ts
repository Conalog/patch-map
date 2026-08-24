import productionShapedWorkloadJson from '../../../docs/reference/core-v2-functional-contract/evidence/production-shaped-workload.v1.json';
import type { PatchMap } from '../../../src/patch-map';

export const PATCH_MAP_VIEWPORT_RUNTIME_REVISION = 'core-v2-viewport-runtime/1';
export const PATCH_MAP_VIEWPORT_CLEANUP_REVISION = 'core-v2-viewport-cleanup/1';

export const PATCH_MAP_VIEWPORT_CASE_IDS = Object.freeze([
  'VIE-001',
  'VIE-002',
  'VIE-003',
  'VIE-004',
  'VIE-005',
  'VIE-006',
  'VIE-007',
  'VIE-008',
  'CSM-009',
  'CSM-010',
] as const);

export type PatchMapViewportCaseId = (typeof PATCH_MAP_VIEWPORT_CASE_IDS)[number];

interface ProductionDatasetRequest {
  readonly caseId: 'CSM-010';
  readonly generatorRef: 'production-shaped';
}

interface ProductResourceProbeRequest {
  readonly caseId: PatchMapViewportCaseId;
  readonly engine: PatchMap;
}

interface ProductTaskMeasureRequest {
  readonly caseId: PatchMapViewportCaseId;
  readonly actionIndex: number;
  readonly actionType: string;
}

export interface PatchMapViewportProductAdapter {
  productionDataset(input: ProductionDatasetRequest): readonly Readonly<Record<string, unknown>>[];
  resourceProbe(input: ProductResourceProbeRequest): Readonly<Record<string, unknown>>;
  longTaskProbe(): Readonly<Record<string, unknown>>;
  measureProductTask<Result>(
    input: ProductTaskMeasureRequest,
    operation: () => Result | Promise<Result>,
  ): Promise<Result>;
}

export interface PatchMapViewportRuntime {
  readonly product: PatchMapViewportProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only transport shared by the viewport capability and consumer cases.
 *
 * The adapter owns no Engine or Pixi object. Its only live browser resource is a
 * bounded Long Task observer used by CSM-010; postDestroyProductProbe always
 * disconnects it before the bridge publishes cleanup evidence.
 */
export function createPatchMapViewportRuntime(
  caseId: PatchMapViewportCaseId,
): PatchMapViewportRuntime {
  requireCaseId(caseId);
  const journal = new RuntimeJournal();
  const longTasks = new BrowserLongTaskLedger(caseId === 'CSM-010');
  let productionDatasetBuildCount = 0;
  let productionEntityCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapViewportProductAdapter = Object.freeze({
    productionDataset(inputValue: ProductionDatasetRequest) {
      assertActive(released, 'production dataset construction');
      const input = productionDatasetRequest(inputValue);
      invariant(input.caseId === caseId, 'production dataset case identity');
      const dataset = deepFreeze(structuredClone(
        productionShapedWorkloadJson,
      )) as readonly Readonly<Record<string, unknown>>[];
      productionDatasetBuildCount += 1;
      productionEntityCount += dataset.length;
      journal.append('production-dataset-created', {
        caseId,
        generatorRef: input.generatorRef,
        rootCount: dataset.length,
        productionDatasetBuildCount,
      });
      return dataset;
    },

    resourceProbe(inputValue: ProductResourceProbeRequest) {
      assertActive(released, 'resource probe');
      const input = productResourceProbeRequest(inputValue);
      invariant(input.caseId === caseId, 'resource probe case identity');
      const snapshot = detach(input.engine.snapshot());
      const destroyed =
        snapshot.lifecycle === 'destroyed' || snapshot.lifecycle === 'destroying';
      const semantic = detach(input.engine.semanticProbe());
      const geometry = destroyed ? null : detach(input.engine.geometryProbe());
      const interactionOwnership = destroyed
        ? null
        : detach(input.engine.interactionOwnershipProbe());
      const viewport = destroyed ? null : detach(input.engine.viewportProbe());
      const viewportTransform = destroyed
        ? null
        : detach(input.engine.viewportTransformProbe());
      const persistence = destroyed
        ? null
        : detach(input.engine.viewportPersistenceProbe());
      const policy = detach(input.engine.viewportPolicyProbe());
      resourceProbeCount += 1;
      journal.append('viewport-product-observed', {
        caseId,
        lifecycle: snapshot.lifecycle,
        sceneRevision: requireSceneRevision(snapshot),
        resourceProbeCount,
      });
      return deepFreeze({
        revision: PATCH_MAP_VIEWPORT_RUNTIME_REVISION,
        caseId,
        engine: {
          snapshot,
          semantic,
          geometry,
          interactionOwnership,
          viewport,
          viewportTransform,
          persistence,
          policy,
        },
        runtime: {
          ownership: runtimeOwnership(longTasks.activeObserverCount()),
          stats: runtimeStats(
            productionDatasetBuildCount,
            productionEntityCount,
            resourceProbeCount,
          ),
        },
        journal: journal.snapshot(),
      });
    },

    longTaskProbe() {
      assertActive(released, 'long task probe');
      return longTasks.snapshot();
    },

    async measureProductTask<Result>(
      inputValue: ProductTaskMeasureRequest,
      operation: () => Result | Promise<Result>,
    ): Promise<Result> {
      assertActive(released, 'product task measurement');
      const input = productTaskMeasureRequest(inputValue);
      invariant(input.caseId === caseId, 'product task measurement case identity');
      invariant(typeof operation === 'function', 'product task measurement operation');
      const result = await longTasks.measure(input.actionType, operation);
      journal.append('viewport-product-task-measured', {
        caseId,
        actionIndex: input.actionIndex,
        actionType: input.actionType,
      });
      return result;
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      longTasks.release();
      journal.append('viewport-runtime-released', {
        caseId,
        productionDatasetBuildCount,
        productionEntityCount,
        resourceProbeCount,
      });
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_VIEWPORT_CLEANUP_REVISION,
        caseId,
        runtimeCounts: runtimeOwnership(longTasks.activeObserverCount()),
        stats: runtimeStats(
          productionDatasetBuildCount,
          productionEntityCount,
          resourceProbeCount,
        ),
        longTasks: longTasks.cleanupSnapshot(),
        journal: journal.snapshot(),
      });
      return cleanupProbe;
    },
  });
}

class BrowserLongTaskLedger {
  private readonly entries: number[] = [];
  private readonly measurements: Array<Readonly<{
    actionType: string;
    durationsMs: readonly number[];
  }>> = [];
  private readonly pendingEntries: Array<Readonly<{
    startTime: number;
    duration: number;
  }>> = [];
  private observer: PerformanceObserver | null = null;
  private readonly requested: boolean;
  private supported = false;

  public constructor(requested: boolean) {
    this.requested = requested;
    if (!requested || typeof globalThis.PerformanceObserver !== 'function') return;
    if (!globalThis.PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== 'longtask') continue;
          this.pendingEntries.push(Object.freeze({
            startTime: entry.startTime,
            duration: entry.duration,
          }));
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
      this.supported = true;
    } catch {
      this.observer?.disconnect();
      this.observer = null;
    }
  }

  public activeObserverCount(): 0 | 1 {
    return this.observer === null ? 0 : 1;
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    const durationsMs = Object.freeze(this.entries.map((duration) => duration));
    return deepFreeze({
      requested: this.requested,
      supported: this.supported,
      activeObserverCount: this.activeObserverCount(),
      count: durationsMs.length,
      atLeast100MsCount: durationsMs.filter((duration) => duration >= 100).length,
      durationsMs,
      measurements: Object.freeze(this.measurements.map((measurement) =>
        deepFreeze({
          actionType: measurement.actionType,
          durationsMs: [...measurement.durationsMs],
        }))),
    });
  }

  public async measure<Result>(
    actionType: string,
    operation: () => Result | Promise<Result>,
  ): Promise<Result> {
    if (!this.requested || !this.supported || this.observer === null) {
      return operation();
    }

    await nextMacrotask();
    this.flushPendingObserverRecords();
    this.pendingEntries.length = 0;
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      const completedAt = performance.now();
      await nextMacrotask();
      this.flushPendingObserverRecords();
      const durationsMs: number[] = [];
      for (const entry of this.pendingEntries) {
        const entryEnd = entry.startTime + entry.duration;
        if (entry.startTime <= completedAt && entryEnd >= startedAt) {
          this.entries.push(entry.duration);
          durationsMs.push(entry.duration);
        }
      }
      this.measurements.push(deepFreeze({ actionType, durationsMs }));
      this.pendingEntries.length = 0;
    }
  }

  public cleanupSnapshot(): Readonly<Record<string, unknown>> {
    return deepFreeze({
      requested: this.requested,
      supported: this.supported,
      activeObserverCount: this.activeObserverCount(),
    });
  }

  public release(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.pendingEntries.length = 0;
  }

  private flushPendingObserverRecords(): void {
    for (const entry of this.observer?.takeRecords() ?? []) {
      if (entry.entryType !== 'longtask') continue;
      this.pendingEntries.push(Object.freeze({
        startTime: entry.startTime,
        duration: entry.duration,
      }));
    }
  }
}

class RuntimeJournal {
  private readonly entries: Readonly<Record<string, unknown>>[] = [];
  private sequence = 0;

  public append(event: string, details: Readonly<Record<string, unknown>>): void {
    this.entries.push(deepFreeze({ sequence: ++this.sequence, event, ...details }));
  }

  public snapshot(): readonly Readonly<Record<string, unknown>>[] {
    return Object.freeze(this.entries.map((entry) => deepFreeze({ ...entry })));
  }
}

function productionDatasetRequest(value: unknown): ProductionDatasetRequest {
  const input = requireRecord(value, 'production dataset request');
  assertExactKeys(input, ['caseId', 'generatorRef'], 'production dataset request');
  invariant(input.caseId === 'CSM-010', 'production dataset belongs to CSM-010');
  invariant(input.generatorRef === 'production-shaped', 'production dataset generator');
  return Object.freeze({
    caseId: 'CSM-010',
    generatorRef: 'production-shaped',
  });
}

function productTaskMeasureRequest(value: unknown): ProductTaskMeasureRequest {
  const input = requireRecord(value, 'product task measurement request');
  assertExactKeys(
    input,
    ['actionIndex', 'actionType', 'caseId'],
    'product task measurement request',
  );
  invariant(
    PATCH_MAP_VIEWPORT_CASE_IDS.includes(input.caseId as PatchMapViewportCaseId),
    'product task measurement case',
  );
  invariant(
    Number.isInteger(input.actionIndex) && Number(input.actionIndex) >= 0,
    'product task measurement action index',
  );
  invariant(
    typeof input.actionType === 'string' && input.actionType.length > 0,
    'product task measurement action type',
  );
  return Object.freeze({
    caseId: input.caseId as PatchMapViewportCaseId,
    actionIndex: Number(input.actionIndex),
    actionType: input.actionType,
  });
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function productResourceProbeRequest(value: unknown): ProductResourceProbeRequest {
  const input = requireRecord(value, 'resource probe request');
  assertExactKeys(input, ['caseId', 'engine'], 'resource probe request');
  const caseId = requireCaseId(input.caseId);
  const engine = input.engine;
  invariant(engine !== null && typeof engine === 'object', 'resource probe engine');
  for (const method of [
    'geometryProbe',
    'interactionOwnershipProbe',
    'semanticProbe',
    'snapshot',
    'viewportPersistenceProbe',
    'viewportPolicyProbe',
    'viewportProbe',
    'viewportTransformProbe',
  ]) {
    invariant(
      typeof (engine as Record<string, unknown>)[method] === 'function',
      `resource probe engine ${method}()`,
    );
  }
  return Object.freeze({ caseId, engine: engine as PatchMap });
}

function requireCaseId(value: unknown): PatchMapViewportCaseId {
  invariant(
    typeof value === 'string'
      && PATCH_MAP_VIEWPORT_CASE_IDS.includes(value as PatchMapViewportCaseId),
    'unsupported case identity',
  );
  return value as PatchMapViewportCaseId;
}

function requireSceneRevision(
  snapshot: Readonly<{
    readonly revisions: Readonly<{ readonly sceneRevision: number }>;
  }>,
): number {
  invariant(
    Number.isSafeInteger(snapshot.revisions.sceneRevision)
      && snapshot.revisions.sceneRevision >= 0,
    'engine snapshot scene revision',
  );
  return snapshot.revisions.sceneRevision;
}

function runtimeStats(
  productionDatasetBuildCount: number,
  productionEntityCount: number,
  resourceProbeCount: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    productionDatasetBuildCount,
    productionEntityCount,
    resourceProbeCount,
  });
}

function runtimeOwnership(
  activeObserverCount: 0 | 1,
): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    assetLeaseCount: 0,
    pendingWorkCount: 0,
    activeObserverCount,
  });
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} object`,
  );
  return value as Readonly<Record<string, unknown>>;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    invariant(allowed.has(key), `${label} unknown key ${key}`);
  }
  for (const key of keys) invariant(key in value, `${label} missing key ${key}`);
}

function detach<T>(value: T): T;
function detach(value: unknown): unknown {
  if (Array.isArray(value)) {
    const entries = value as readonly unknown[];
    return deepFreeze(entries.map((entry) => detach(entry)));
  }
  if (value !== null && typeof value === 'object') {
    return deepFreeze(Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .map(([key, entry]) => [key, detach(entry)]),
    ));
  }
  return value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap viewport runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
