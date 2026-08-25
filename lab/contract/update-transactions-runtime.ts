import type { PatchMap } from '../../src/engine';
import { buildPatchMapSeededScenarioScene } from '../../verification/scenarios/seeded-scene';

export const PATCH_MAP_UPDATE_TRANSACTIONS_RUNTIME_REVISION =
  'patch-map-update-transactions-runtime/1';
export const PATCH_MAP_UPDATE_TRANSACTIONS_CLEANUP_REVISION =
  'patch-map-update-transactions-cleanup/1';

export const PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS = Object.freeze([
  'ERR-001',
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'UPD-013',
  'UPD-014',
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
  'CSM-014',
] as const);

export type PatchMapUpdateTransactionsCaseId =
  (typeof PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS)[number];

interface SyntheticSceneRequest {
  readonly caseId: 'UPD-007';
  readonly size: number;
  readonly seed: number;
}

interface ProductResourceProbeRequest {
  readonly caseId: PatchMapUpdateTransactionsCaseId;
  readonly engine: PatchMap;
}

export interface PatchMapUpdateTransactionsProductAdapter {
  createSyntheticScene(input: unknown): readonly Readonly<Record<string, unknown>>[];
  resourceProbe(input: ProductResourceProbeRequest): Readonly<Record<string, unknown>>;
}

export interface PatchMapUpdateTransactionsRuntime {
  readonly product: PatchMapUpdateTransactionsProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only transport seam shared by update/error/consumer cases.
 *
 * The adapter only authors the seeded UPD-007 input and snapshots facts already
 * exposed by public Engine probes. It never owns an Engine, Pixi object, ticker,
 * listener, asset lease, retained dataset, or answer-shaped observation.
 */
export function createPatchMapUpdateTransactionsRuntime(
  caseId: PatchMapUpdateTransactionsCaseId,
): PatchMapUpdateTransactionsRuntime {
  requireCaseId(caseId);
  const journal = new RuntimeJournal();
  let syntheticBuildCount = 0;
  let syntheticEntityCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapUpdateTransactionsProductAdapter = Object.freeze({
    createSyntheticScene(inputValue: unknown) {
      assertActive(released, 'synthetic scene construction');
      invariant(caseId === 'UPD-007', 'synthetic scenes belong to UPD-007');
      const input = syntheticSceneRequest(inputValue);
      const dataset = buildPatchMapSeededScenarioScene(input.size, input.seed);
      syntheticBuildCount += 1;
      syntheticEntityCount += dataset.length;
      journal.append('synthetic-scene-created', {
        caseId,
        size: input.size,
        seed: input.seed,
        syntheticBuildCount,
      });
      return dataset;
    },

    resourceProbe(inputValue: ProductResourceProbeRequest) {
      assertActive(released, 'resource probe');
      const input = productResourceProbeRequest(inputValue);
      invariant(input.caseId === caseId, 'resource probe case identity');

      const snapshot = detach(input.engine.snapshot());
      const semantic = detach(input.engine.semanticProbe());
      const interactionOwnership = snapshot.lifecycle === 'destroyed'
        ? null
        : detach(input.engine.interactionOwnershipProbe());
      resourceProbeCount += 1;
      journal.append('engine-product-observed', {
        caseId,
        lifecycle: snapshot.lifecycle,
        sceneRevision: requireRevision(snapshot),
        resourceProbeCount,
      });

      return deepFreeze({
        revision: PATCH_MAP_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
        caseId,
        engine: {
          snapshot,
          semantic,
          interactionOwnership,
        },
        runtime: {
          ownership: zeroOwnership(),
          stats: runtimeStats(
            syntheticBuildCount,
            syntheticEntityCount,
            resourceProbeCount,
          ),
        },
        journal: journal.snapshot(),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      journal.append('update-transactions-runtime-released', {
        caseId,
        syntheticBuildCount,
        syntheticEntityCount,
        resourceProbeCount,
      });
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        stats: runtimeStats(
          syntheticBuildCount,
          syntheticEntityCount,
          resourceProbeCount,
        ),
        journal: journal.snapshot(),
      });
      return cleanupProbe;
    },
  });
}

function syntheticSceneRequest(value: unknown): SyntheticSceneRequest {
  const input = requireRecord(value, 'synthetic scene request');
  assertExactKeys(input, ['caseId', 'seed', 'size'], 'synthetic scene request');
  invariant(input.caseId === 'UPD-007', 'synthetic scene case identity');
  const size = positiveSafeInteger(input.size, 'synthetic scene size');
  invariant(size <= 5_000, 'synthetic scene size must not exceed 5000');
  const seed = nonNegativeSafeInteger(input.seed, 'synthetic scene seed');
  invariant(seed <= 0xffff_ffff, 'synthetic scene seed must be uint32');
  return Object.freeze({ caseId: 'UPD-007', size, seed });
}

function productResourceProbeRequest(
  value: unknown,
): ProductResourceProbeRequest {
  const input = requireRecord(value, 'resource probe request');
  assertExactKeys(input, ['caseId', 'engine'], 'resource probe request');
  const caseId = requireCaseId(input.caseId);
  const engine = input.engine;
  invariant(engine !== null && typeof engine === 'object', 'resource probe engine');
  for (const method of ['snapshot', 'semanticProbe', 'interactionOwnershipProbe']) {
    invariant(
      typeof (engine as Record<string, unknown>)[method] === 'function',
      `resource probe engine ${method}()`,
    );
  }
  return Object.freeze({ caseId, engine: engine as PatchMap });
}

function requireRevision(
  snapshot: Readonly<{ readonly revisions: Readonly<{ readonly sceneRevision: number }> }>,
): number {
  return nonNegativeSafeInteger(
    snapshot.revisions.sceneRevision,
    'engine snapshot scene revision',
  );
}

function runtimeStats(
  syntheticBuildCount: number,
  syntheticEntityCount: number,
  resourceProbeCount: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    syntheticBuildCount,
    syntheticEntityCount,
    resourceProbeCount,
  });
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    assetLeaseCount: 0,
    pendingWorkCount: 0,
  });
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

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function requireCaseId(value: unknown): PatchMapUpdateTransactionsCaseId {
  invariant(
    typeof value === 'string'
      && PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS.includes(
        value as PatchMapUpdateTransactionsCaseId,
      ),
    'unsupported case identity',
  );
  return value as PatchMapUpdateTransactionsCaseId;
}

function positiveSafeInteger(value: unknown, label: string): number {
  invariant(Number.isSafeInteger(value) && Number(value) > 0, `${label} must be positive`);
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  invariant(Number.isSafeInteger(value) && Number(value) >= 0, `${label} must be non-negative`);
  return Number(value);
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
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
  if (!condition) throw new Error(`Invalid PatchMap update-transactions runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
