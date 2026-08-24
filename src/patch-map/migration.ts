import {
  PATCH_MAP_MIGRATION_BLOCKERS,
  PATCH_MAP_MIGRATION_COHORTS,
  PATCH_MAP_MIGRATION_EFFECTS,
  PATCH_MAP_MIGRATION_REVISION,
  type PatchMapMigrationBlocker,
  type PatchMapMigrationCohortResult,
  type PatchMapMigrationEffect,
  type PatchMapMigrationEffectResult,
  type PatchMapMigrationEngine,
  type PatchMapMigrationProbe,
  type PatchMapMigrationShadowEngine,
  type PatchMapMigrationTriggerState,
} from './migration/contracts';

export {
  PATCH_MAP_MIGRATION_BLOCKERS,
  PATCH_MAP_MIGRATION_COHORTS,
  PATCH_MAP_MIGRATION_EFFECTS,
  PATCH_MAP_MIGRATION_REVISION,
  PatchMapMigrationError,
} from './migration/contracts';
export type * from './migration/contracts';
export {
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
} from './migration/compatibility';

interface ActiveMigrationSession {
  readonly id: string;
  readonly engine: PatchMapMigrationEngine;
  readonly shadow: PatchMapMigrationShadowEngine | null;
  readonly shadowMode: 'read-only' | null;
}

const EFFECT_SET = new Set<string>(PATCH_MAP_MIGRATION_EFFECTS);
const BLOCKER_SET = new Set<string>(PATCH_MAP_MIGRATION_BLOCKERS);
const TRIGGER_STATE_SET = new Set<string>([
  'idle',
  'load-failure',
  'update',
  'gesture',
  'remount',
]);

/**
 * Host-facing, instance-local migration authority. It owns only cohort,
 * effect, and mount decisions; renderers and datasets stay with the host.
 */
export class PatchMapMigrationAuthority {
  private desiredEngineValue: PatchMapMigrationEngine;
  private activeSession: ActiveMigrationSession | null = null;
  private readonly effectCountsValue = createEffectCounts();
  private authoritativeEffectCountValue = 0;
  private suppressedShadowEffectCountValue = 0;
  private cohortValue: PatchMapMigrationCohortResult | null = null;
  private rollbackPendingValue = false;
  private readonly triggerStatesValue: PatchMapMigrationTriggerState[] = [];
  private readonly activeGestures = new Set<string>();
  private destroyedValue = false;

  public constructor(initialEngine: PatchMapMigrationEngine = 'core-v2') {
    this.desiredEngineValue = migrationEngine(initialEngine, 'initial engine');
  }

  public mountSession(
    sessionId: string,
    options: Readonly<{
      authoritative?: PatchMapMigrationEngine;
      shadow?: PatchMapMigrationShadowEngine | null;
      shadowMode?: 'read-only';
    }> = {},
  ): PatchMapMigrationProbe {
    this.assertAlive();
    if (this.activeSession !== null) {
      throw new Error('PatchMap migration session is already mounted');
    }
    const authoritative = options.authoritative === undefined
      ? this.desiredEngineValue
      : migrationEngine(options.authoritative, 'authoritative engine');
    const shadow = options.shadow === undefined || options.shadow === null
      ? null
      : migrationShadowEngine(options.shadow);
    if (shadow !== null && options.shadowMode !== 'read-only') {
      throw new TypeError('migration shadow must be explicitly read-only');
    }
    if (shadow === authoritative) {
      throw new TypeError('migration shadow must differ from the authoritative engine');
    }
    this.activeSession = Object.freeze({
      id: nonEmptyString(sessionId, 'session ID'),
      engine: authoritative,
      shadow,
      shadowMode: shadow === null ? null : 'read-only',
    });
    return this.probe();
  }

  public recordEffect(
    role: 'authoritative' | 'shadow',
    effectValue: PatchMapMigrationEffect,
  ): PatchMapMigrationEffectResult {
    this.assertMounted();
    const effect = migrationEffect(effectValue);
    if (role === 'shadow') {
      if (this.activeSession?.shadow === null) {
        throw new Error('PatchMap migration shadow is not mounted');
      }
      this.suppressedShadowEffectCountValue += 1;
      return Object.freeze({
        effect,
        role,
        published: false,
        suppressed: true,
      });
    }
    if (role !== 'authoritative') {
      throw new TypeError('migration effect role must be authoritative or shadow');
    }
    this.effectCountsValue[effect] += 1;
    this.authoritativeEffectCountValue += 1;
    return Object.freeze({
      effect,
      role,
      published: true,
      suppressed: false,
    });
  }

  public evaluateCanary(
    input: Readonly<{
      cohortsPercent: readonly number[];
      guardedBlockers: readonly PatchMapMigrationBlocker[];
      failures?: readonly PatchMapMigrationBlocker[];
    }>,
  ): PatchMapMigrationCohortResult {
    this.assertAlive();
    exactNumberArray(
      input.cohortsPercent,
      PATCH_MAP_MIGRATION_COHORTS,
      'migration cohorts',
    );
    const guardedBlockers = blockerArray(
      input.guardedBlockers,
      'guarded blockers',
    );
    exactStringArray(
      guardedBlockers,
      PATCH_MAP_MIGRATION_BLOCKERS,
      'migration blockers',
    );
    const failures = blockerArray(input.failures ?? [], 'cohort failures');
    const firstFailure = failures[0] ?? null;
    const stoppedAtPercent = firstFailure === null
      ? null
      : PATCH_MAP_MIGRATION_COHORTS[0];
    const completedCohorts = firstFailure === null
      ? [...PATCH_MAP_MIGRATION_COHORTS]
      : [];
    this.cohortValue = Object.freeze({
      guardedBlockers: Object.freeze([...guardedBlockers]),
      failures: Object.freeze([...failures]),
      completedCohorts: Object.freeze(completedCohorts),
      stoppedAtPercent,
      promotionAllowed: firstFailure === null,
    });
    return this.cohortValue;
  }

  public requestRollback(
    input: Readonly<{
      from: PatchMapMigrationEngine;
      to: PatchMapMigrationEngine;
      effectiveAt: 'next-remount';
    }>,
  ): PatchMapMigrationProbe {
    this.assertMounted();
    const from = migrationEngine(input.from, 'rollback source engine');
    const to = migrationEngine(input.to, 'rollback target engine');
    if (input.effectiveAt !== 'next-remount') {
      throw new TypeError('migration rollback may only apply at next-remount');
    }
    if (this.activeSession?.engine !== from) {
      throw new Error('migration rollback source is not the active engine');
    }
    if (from === to) {
      throw new TypeError('migration rollback must select a different engine');
    }
    this.desiredEngineValue = to;
    this.rollbackPendingValue = true;
    return this.probe();
  }

  public recordTriggerState(stateValue: PatchMapMigrationTriggerState): void {
    this.assertMounted();
    const state = triggerState(stateValue);
    this.triggerStatesValue.push(state);
  }

  public beginGesture(gestureId: string): void {
    this.assertMounted();
    const id = nonEmptyString(gestureId, 'gesture ID');
    if (this.activeGestures.has(id)) {
      throw new Error(`migration gesture already active: ${id}`);
    }
    this.activeGestures.add(id);
  }

  public endGesture(gestureId: string): boolean {
    this.assertMounted();
    return this.activeGestures.delete(nonEmptyString(gestureId, 'gesture ID'));
  }

  public remountSession(nextSessionId: string): PatchMapMigrationProbe {
    this.assertMounted();
    const sessionId = nonEmptyString(nextSessionId, 'session ID');
    this.activeGestures.clear();
    this.activeSession = null;
    this.rollbackPendingValue = false;
    return this.mountSession(sessionId, {
      authoritative: this.desiredEngineValue,
    });
  }

  public unmountSession(): boolean {
    this.assertAlive();
    if (this.activeSession === null) return false;
    this.activeGestures.clear();
    this.activeSession = null;
    return true;
  }

  public probe(): PatchMapMigrationProbe {
    const active = this.activeSession;
    return Object.freeze({
      revision: PATCH_MAP_MIGRATION_REVISION,
      desiredEngine: this.desiredEngineValue,
      activeEngine: active?.engine ?? null,
      shadowEngine: active?.shadow ?? null,
      shadowMode: active?.shadowMode ?? null,
      activeSessionId: active?.id ?? null,
      activeLifecycleCount: active === null ? 0 : 1,
      canvasCount: active === null ? 0 : 1,
      activeCanvasesPerHostSlot: active === null ? 0 : 1,
      shadowCanvasCount: 0,
      activeSessionHotSwapCount: 0,
      authoritativeEngineCountPerSession: active === null ? 0 : 1,
      authoritativeEffectCount: this.authoritativeEffectCountValue,
      shadowEffectCount: 0,
      suppressedShadowEffectCount: this.suppressedShadowEffectCountValue,
      effectCounts: Object.freeze({ ...this.effectCountsValue }),
      cohort: this.cohortValue,
      rollbackPending: this.rollbackPendingValue,
      triggerStates: Object.freeze([...this.triggerStatesValue]),
      activeGestureCount: this.activeGestures.size,
      staleGestureCount: 0,
      replayedGestureCount: 0,
      retainedCallbackCount: 0,
      destroyed: this.destroyedValue,
    });
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.activeGestures.clear();
    this.activeSession = null;
    this.triggerStatesValue.length = 0;
    this.cohortValue = null;
    this.rollbackPendingValue = false;
    this.destroyedValue = true;
    return true;
  }

  private assertMounted(): void {
    this.assertAlive();
    if (this.activeSession === null) {
      throw new Error('PatchMap migration session is not mounted');
    }
  }

  private assertAlive(): void {
    if (this.destroyedValue) {
      throw new Error('PatchMap migration authority is destroyed');
    }
  }
}

function createEffectCounts(): Record<PatchMapMigrationEffect, number> {
  return {
    selection: 0,
    command: 0,
    history: 0,
    persistence: 0,
    callback: 0,
    analytics: 0,
  };
}

function migrationEngine(
  value: PatchMapMigrationEngine,
  label: string,
): PatchMapMigrationEngine {
  if (value !== 'core-v2' && value !== 'previous') {
    throw new TypeError(`${label} must be core-v2 or previous`);
  }
  return value;
}

function migrationShadowEngine(
  value: PatchMapMigrationShadowEngine,
): PatchMapMigrationShadowEngine {
  if (value !== 'comparison' && value !== 'previous') {
    throw new TypeError('shadow engine must be comparison or previous');
  }
  return value;
}

function migrationEffect(value: PatchMapMigrationEffect): PatchMapMigrationEffect {
  if (!EFFECT_SET.has(value)) {
    throw new TypeError(`unsupported migration effect ${String(value)}`);
  }
  return value;
}

function blockerArray(
  value: unknown,
  label: string,
): readonly PatchMapMigrationBlocker[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const entries: readonly unknown[] = value;
  const seen = new Set<string>();
  return Object.freeze(entries.map((entry) => {
    if (
      typeof entry !== 'string' ||
      !BLOCKER_SET.has(entry) ||
      seen.has(entry)
    ) {
      throw new TypeError(`${label} contains invalid or duplicate blocker ${String(entry)}`);
    }
    seen.add(entry);
    return entry as PatchMapMigrationBlocker;
  }));
}

function triggerState(
  value: PatchMapMigrationTriggerState,
): PatchMapMigrationTriggerState {
  if (!TRIGGER_STATE_SET.has(value)) {
    throw new TypeError(`unsupported migration trigger state ${String(value)}`);
  }
  return value;
}

function exactNumberArray(
  actual: readonly number[],
  expected: readonly number[],
  label: string,
): void {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new TypeError(`${label} must equal ${expected.join(',')}`);
  }
}

function exactStringArray(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new TypeError(`${label} must equal ${expected.join(',')}`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}
