import type {
  PatchMapDatasetMaterialization,
  PatchMapElement,
} from '../semantic/dataset';

export const PATCH_MAP_MIGRATION_REVISION = 'core-v2-migration/1' as const;

export const PATCH_MAP_MIGRATION_COHORTS = Object.freeze([
  1,
  10,
  50,
  100,
] as const);

export const PATCH_MAP_MIGRATION_EFFECTS = Object.freeze([
  'selection',
  'command',
  'history',
  'persistence',
  'callback',
  'analytics',
] as const);

export const PATCH_MAP_MIGRATION_BLOCKERS = Object.freeze([
  'semantic-mismatch',
  'runtime-error',
  'performance-budget',
  'cleanup-budget',
] as const);

export type PatchMapMigrationEngine = 'core-v2' | 'previous';
export type PatchMapMigrationShadowEngine = 'comparison' | 'previous';
export type PatchMapMigrationEffect =
  (typeof PATCH_MAP_MIGRATION_EFFECTS)[number];
export type PatchMapMigrationBlocker =
  (typeof PATCH_MAP_MIGRATION_BLOCKERS)[number];
export type PatchMapMigrationTriggerState =
  | 'idle'
  | 'load-failure'
  | 'update'
  | 'gesture'
  | 'remount';
export type PatchMapMigrationDiagnosticCode =
  | 'INVALID_LEGACY_ROOT'
  | 'NON_SERIALIZABLE_VALUE'
  | 'INVALID_EXPORT_ROOT'
  | 'SEMANTIC_MISMATCH';

export class PatchMapMigrationError extends Error {
  public readonly category = 'INVALID_INPUT' as const;
  public readonly code: PatchMapMigrationDiagnosticCode;
  public readonly datasetPath: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount = 0;
  public readonly unchangedCount = 0;

  public constructor(
    code: PatchMapMigrationDiagnosticCode,
    datasetPath: string,
    detail: string,
  ) {
    super(`${code} at ${datasetPath}: ${detail}`);
    this.name = 'PatchMapMigrationError';
    this.code = code;
    this.datasetPath = datasetPath;
  }
}

export interface PatchMapCompatibilityMaterialization {
  readonly revision: typeof PATCH_MAP_MIGRATION_REVISION;
  readonly sourceKind: 'canonical-array' | 'legacy-generic-item';
  /**
   * Schema-compatible detached input for Engine.loadDataset or persistence.
   * This deliberately preserves the minimal canonical representation instead
   * of exposing materializer-added defaults as authored data.
   */
  readonly canonicalDataset: readonly unknown[];
  readonly materialization: PatchMapDatasetMaterialization;
  readonly semanticHash: string;
}

export interface PatchMapPersistenceExport {
  readonly revision: typeof PATCH_MAP_MIGRATION_REVISION;
  readonly rootKind: 'array';
  readonly dataset: readonly PatchMapElement[];
  readonly serialized: string;
  readonly semanticHash: string;
}

export interface PatchMapMigrationEffectResult {
  readonly effect: PatchMapMigrationEffect;
  readonly role: 'authoritative' | 'shadow';
  readonly published: boolean;
  readonly suppressed: boolean;
}

export interface PatchMapMigrationCohortResult {
  readonly guardedBlockers: readonly PatchMapMigrationBlocker[];
  readonly failures: readonly PatchMapMigrationBlocker[];
  readonly completedCohorts: readonly number[];
  readonly stoppedAtPercent: number | null;
  readonly promotionAllowed: boolean;
}

export interface PatchMapMigrationProbe {
  readonly revision: typeof PATCH_MAP_MIGRATION_REVISION;
  readonly desiredEngine: PatchMapMigrationEngine;
  readonly activeEngine: PatchMapMigrationEngine | null;
  readonly shadowEngine: PatchMapMigrationShadowEngine | null;
  readonly shadowMode: 'read-only' | null;
  readonly activeSessionId: string | null;
  readonly activeLifecycleCount: 0 | 1;
  readonly canvasCount: 0 | 1;
  readonly activeCanvasesPerHostSlot: 0 | 1;
  readonly shadowCanvasCount: 0;
  readonly activeSessionHotSwapCount: 0;
  readonly authoritativeEngineCountPerSession: 0 | 1;
  readonly authoritativeEffectCount: number;
  readonly shadowEffectCount: 0;
  readonly suppressedShadowEffectCount: number;
  readonly effectCounts: Readonly<Record<PatchMapMigrationEffect, number>>;
  readonly cohort: PatchMapMigrationCohortResult | null;
  readonly rollbackPending: boolean;
  readonly triggerStates: readonly PatchMapMigrationTriggerState[];
  readonly activeGestureCount: number;
  readonly staleGestureCount: 0;
  readonly replayedGestureCount: 0;
  readonly retainedCallbackCount: 0;
  readonly destroyed: boolean;
}
