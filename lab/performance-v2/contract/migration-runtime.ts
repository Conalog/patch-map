import {
  CORE_V2_MIGRATION_REVISION,
  CoreV2MigrationAuthority,
  assertCoreV2SemanticRoundtrip,
  materializeCoreV2CompatibilityDataset,
  prepareCoreV2PersistenceExport,
  type CoreV2Engine,
  type CoreV2MigrationEngine,
} from '../../../src/core-v2';

export const CORE_V2_MIGRATION_RUNTIME_REVISION =
  'core-v2-migration-runtime/1' as const;
export const CORE_V2_MIGRATION_CLEANUP_REVISION =
  'core-v2-migration-cleanup/1' as const;

export const CORE_V2_MIGRATION_CASE_IDS = Object.freeze([
  'MIG-001',
  'MIG-002',
  'MIG-003',
] as const);

export type CoreV2MigrationCaseId =
  (typeof CORE_V2_MIGRATION_CASE_IDS)[number];

export interface CoreV2MigrationProductAdapter {
  createAuthority(initialEngine: CoreV2MigrationEngine): CoreV2MigrationAuthority;
  materializeDataset(input: unknown): Readonly<Record<string, unknown>>;
  preparePersistenceExport(
    input: unknown,
    strictReferences: boolean,
  ): Readonly<Record<string, unknown>>;
  assertSemanticRoundtrip(
    before: Readonly<{ semanticHash: string }>,
    after: Readonly<{ semanticHash: string }>,
  ): void;
  observeEngine(engine: CoreV2Engine): Readonly<Record<string, unknown>>;
}

export interface CoreV2MigrationRuntime {
  readonly product: CoreV2MigrationProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only transport for migration scenarios. Approved expected values and
 * comparison code never enter this adapter.
 */
export function createCoreV2MigrationRuntime(
  caseId: CoreV2MigrationCaseId,
): CoreV2MigrationRuntime {
  requireCaseId(caseId);
  const authorities = new Set<CoreV2MigrationAuthority>();
  let released = false;

  const product: CoreV2MigrationProductAdapter = Object.freeze({
    createAuthority(
      initialEngine: CoreV2MigrationEngine,
    ): CoreV2MigrationAuthority {
      invariant(!released, 'createAuthority after release');
      const authority = new CoreV2MigrationAuthority(initialEngine);
      authorities.add(authority);
      return authority;
    },

    materializeDataset(input: unknown): Readonly<Record<string, unknown>> {
      invariant(!released, 'materializeDataset after release');
      const compatible = materializeCoreV2CompatibilityDataset(input);
      return deepFreeze({
        revision: compatible.revision,
        sourceKind: compatible.sourceKind,
        canonicalDataset: structuredClone(compatible.canonicalDataset),
        semanticHash: compatible.semanticHash,
      });
    },

    preparePersistenceExport(
      input: unknown,
      strictReferences: boolean,
    ): Readonly<Record<string, unknown>> {
      invariant(!released, 'preparePersistenceExport after release');
      const prepared = prepareCoreV2PersistenceExport(input, {
        strictReferences,
      });
      return deepFreeze({
        revision: prepared.revision,
        rootKind: prepared.rootKind,
        dataset: structuredClone(prepared.dataset),
        serialized: prepared.serialized,
        semanticHash: prepared.semanticHash,
      });
    },

    assertSemanticRoundtrip(
      before: Readonly<{ semanticHash: string }>,
      after: Readonly<{ semanticHash: string }>,
    ): void {
      invariant(!released, 'assertSemanticRoundtrip after release');
      assertCoreV2SemanticRoundtrip(before, after);
    },

    observeEngine(engine: CoreV2Engine): Readonly<Record<string, unknown>> {
      invariant(!released, 'observeEngine after release');
      return deepFreeze({
        runtimeRevision: CORE_V2_MIGRATION_RUNTIME_REVISION,
        migrationRevision: CORE_V2_MIGRATION_REVISION,
        snapshot: structuredClone(engine.snapshot()),
        semantic: structuredClone(engine.semanticProbe()),
        geometry: structuredClone(engine.geometryProbe()),
        pointerGesture: structuredClone(engine.pointerGestureProbe()),
        history: structuredClone(engine.historyState()),
        historyInspection: structuredClone(engine.historyInspection()),
        dataset: structuredClone(engine.exportDataset()),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      let liveBeforeDestroy = 0;
      for (const authority of authorities) {
        if (!authority.probe().destroyed) liveBeforeDestroy += 1;
        authority.destroy();
      }
      authorities.clear();
      released = true;
      return deepFreeze({
        revision: CORE_V2_MIGRATION_CLEANUP_REVISION,
        caseId,
        authorityCountBeforeDestroy: liveBeforeDestroy,
        retainedAuthorityCount: 0,
        retainedSessionCount: 0,
        retainedCallbackCount: 0,
      });
    },
  });
}

function requireCaseId(value: string): asserts value is CoreV2MigrationCaseId {
  invariant(
    (CORE_V2_MIGRATION_CASE_IDS as readonly string[]).includes(value),
    `unsupported case ${value}`,
  );
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Core v2 migration runtime: ${message}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
