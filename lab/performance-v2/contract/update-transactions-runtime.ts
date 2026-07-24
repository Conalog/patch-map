import type { CoreV2Engine } from '../../../src/core-v2';

export const CORE_V2_UPDATE_TRANSACTIONS_RUNTIME_REVISION =
  'core-v2-update-transactions-runtime/1';
export const CORE_V2_UPDATE_TRANSACTIONS_CLEANUP_REVISION =
  'core-v2-update-transactions-cleanup/1';

export const CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS = Object.freeze([
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
] as const);

export type CoreV2UpdateTransactionsCaseId =
  (typeof CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS)[number];

interface SyntheticSceneRequest {
  readonly caseId: 'UPD-007';
  readonly size: number;
  readonly seed: number;
}

interface ProductResourceProbeRequest {
  readonly caseId: CoreV2UpdateTransactionsCaseId;
  readonly engine: CoreV2Engine;
}

export interface CoreV2UpdateTransactionsProductAdapter {
  createSyntheticScene(input: unknown): readonly Readonly<Record<string, unknown>>[];
  resourceProbe(input: ProductResourceProbeRequest): Readonly<Record<string, unknown>>;
}

export interface CoreV2UpdateTransactionsRuntime {
  readonly product: CoreV2UpdateTransactionsProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only transport seam shared by eighteen update/error/consumer cases.
 *
 * The adapter only authors the seeded UPD-007 input and snapshots facts already
 * exposed by public Engine probes. It never owns an Engine, Pixi object, ticker,
 * listener, asset lease, retained dataset, or answer-shaped observation.
 */
export function createCoreV2UpdateTransactionsRuntime(
  caseId: CoreV2UpdateTransactionsCaseId,
): CoreV2UpdateTransactionsRuntime {
  requireCaseId(caseId);
  const journal = new RuntimeJournal();
  let syntheticBuildCount = 0;
  let syntheticEntityCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2UpdateTransactionsProductAdapter = Object.freeze({
    createSyntheticScene(inputValue: unknown) {
      assertActive(released, 'synthetic scene construction');
      invariant(caseId === 'UPD-007', 'synthetic scenes belong to UPD-007');
      const input = syntheticSceneRequest(inputValue);
      const dataset = buildSyntheticScene(input.size, input.seed);
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
        revision: CORE_V2_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
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
        revision: CORE_V2_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
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

function buildSyntheticScene(
  size: number,
  seed: number,
): readonly Readonly<Record<string, unknown>>[] {
  const random = createSeededRandom(seed);
  const columns = Math.max(1, Math.ceil(Math.sqrt(size)));
  const dataset: Readonly<Record<string, unknown>>[] = [];
  for (let index = 0; index < size; index += 1) {
    const width = 88 + Math.floor(random() * 25);
    const height = 60 + Math.floor(random() * 21);
    const barHeight = 8 + Math.floor(random() * 25);
    const color = rgbaHex(
      Math.floor(random() * 192) + 32,
      Math.floor(random() * 192) + 32,
      Math.floor(random() * 192) + 32,
    );
    dataset.push({
      type: 'item',
      id: `node-${index}`,
      label: `Node ${index}`,
      size: { width, height },
      padding: 4,
      attrs: {
        x: (index % columns) * 128,
        y: Math.floor(index / columns) * 92,
      },
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#e2e8f0ff' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: color },
          size: { width: Math.max(1, width - 16), height: barHeight },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
        {
          type: 'text',
          id: 'label',
          text: `${index}`,
          placement: 'center',
          style: {
            fontFamily: 'FiraCode',
            fontSize: 12,
            fill: '#0f172aff',
          },
        },
      ],
    });
  }
  return deepFreeze(dataset);
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
  return Object.freeze({ caseId, engine: engine as CoreV2Engine });
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

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function rgbaHex(red: number, green: number, blue: number): string {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}ff`;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0');
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

function requireCaseId(value: unknown): CoreV2UpdateTransactionsCaseId {
  invariant(
    typeof value === 'string'
      && CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS.includes(
        value as CoreV2UpdateTransactionsCaseId,
      ),
    'unsupported case identity',
  );
  return value as CoreV2UpdateTransactionsCaseId;
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
  if (!condition) throw new Error(`Invalid Core v2 update-transactions runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
