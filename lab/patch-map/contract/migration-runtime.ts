import {
  PATCH_MAP_MIGRATION_REVISION,
  PatchMapMigrationAuthority,
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
  type PatchMap,
  type PatchMapMigrationEngine,
} from '../../../src/patch-map';

export const PATCH_MAP_MIGRATION_RUNTIME_REVISION =
  'core-v2-migration-runtime/1' as const;
export const PATCH_MAP_MIGRATION_CLEANUP_REVISION =
  'core-v2-migration-cleanup/1' as const;

export const PATCH_MAP_MIGRATION_CASE_IDS = Object.freeze([
  'MIG-001',
  'MIG-002',
  'MIG-003',
] as const);

export type PatchMapMigrationCaseId =
  (typeof PATCH_MAP_MIGRATION_CASE_IDS)[number];

export interface PatchMapMigrationProductAdapter {
  createAuthority(initialEngine: PatchMapMigrationEngine): PatchMapMigrationAuthority;
  materializeDataset(input: unknown): Readonly<Record<string, unknown>>;
  preparePersistenceExport(
    input: unknown,
    strictReferences: boolean,
  ): Readonly<Record<string, unknown>>;
  assertSemanticRoundtrip(
    before: Readonly<{ semanticHash: string }>,
    after: Readonly<{ semanticHash: string }>,
  ): void;
  observeEngine(engine: PatchMap): Readonly<Record<string, unknown>>;
}

export interface PatchMapMigrationRuntime {
  readonly product: PatchMapMigrationProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only transport for migration scenarios. Approved expected values and
 * comparison code never enter this adapter.
 */
export function createPatchMapMigrationRuntime(
  caseId: PatchMapMigrationCaseId,
): PatchMapMigrationRuntime {
  requireCaseId(caseId);
  const authorities = new Set<PatchMapMigrationAuthority>();
  let released = false;

  const product: PatchMapMigrationProductAdapter = Object.freeze({
    createAuthority(
      initialEngine: PatchMapMigrationEngine,
    ): PatchMapMigrationAuthority {
      invariant(!released, 'createAuthority after release');
      const authority = new PatchMapMigrationAuthority(initialEngine);
      authorities.add(authority);
      return authority;
    },

    materializeDataset(input: unknown): Readonly<Record<string, unknown>> {
      invariant(!released, 'materializeDataset after release');
      const compatible = materializePatchMapCompatibilityDataset(input);
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
      const prepared = preparePatchMapPersistenceExport(input, {
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
      assertPatchMapSemanticRoundtrip(before, after);
    },

    observeEngine(engine: PatchMap): Readonly<Record<string, unknown>> {
      invariant(!released, 'observeEngine after release');
      return deepFreeze({
        runtimeRevision: PATCH_MAP_MIGRATION_RUNTIME_REVISION,
        migrationRevision: PATCH_MAP_MIGRATION_REVISION,
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
        revision: PATCH_MAP_MIGRATION_CLEANUP_REVISION,
        caseId,
        authorityCountBeforeDestroy: liveBeforeDestroy,
        retainedAuthorityCount: 0,
        retainedSessionCount: 0,
        retainedCallbackCount: 0,
      });
    },
  });
}

function requireCaseId(value: string): asserts value is PatchMapMigrationCaseId {
  invariant(
    (PATCH_MAP_MIGRATION_CASE_IDS as readonly string[]).includes(value),
    `unsupported case ${value}`,
  );
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap migration runtime: ${message}`);
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
