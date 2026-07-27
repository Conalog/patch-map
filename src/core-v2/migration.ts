import {
  materializeCoreV2Dataset,
  validateCoreV2DatasetReferences,
  type CoreV2DatasetMaterialization,
  type CoreV2Element,
} from './semantic/dataset';

export const CORE_V2_MIGRATION_REVISION = 'core-v2-migration/1' as const;

export const CORE_V2_MIGRATION_COHORTS = Object.freeze([
  1,
  10,
  50,
  100,
] as const);

export const CORE_V2_MIGRATION_EFFECTS = Object.freeze([
  'selection',
  'command',
  'history',
  'persistence',
  'callback',
  'analytics',
] as const);

export const CORE_V2_MIGRATION_BLOCKERS = Object.freeze([
  'semantic-mismatch',
  'runtime-error',
  'performance-budget',
  'cleanup-budget',
] as const);

export type CoreV2MigrationEngine = 'core-v2' | 'previous';
export type CoreV2MigrationShadowEngine = 'comparison' | 'previous';
export type CoreV2MigrationEffect =
  (typeof CORE_V2_MIGRATION_EFFECTS)[number];
export type CoreV2MigrationBlocker =
  (typeof CORE_V2_MIGRATION_BLOCKERS)[number];
export type CoreV2MigrationTriggerState =
  | 'idle'
  | 'load-failure'
  | 'update'
  | 'gesture'
  | 'remount';
export type CoreV2MigrationDiagnosticCode =
  | 'INVALID_LEGACY_ROOT'
  | 'NON_SERIALIZABLE_VALUE'
  | 'INVALID_EXPORT_ROOT'
  | 'SEMANTIC_MISMATCH';

export class CoreV2MigrationError extends Error {
  public readonly category = 'INVALID_INPUT' as const;
  public readonly code: CoreV2MigrationDiagnosticCode;
  public readonly datasetPath: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount = 0;
  public readonly unchangedCount = 0;

  public constructor(
    code: CoreV2MigrationDiagnosticCode,
    datasetPath: string,
    detail: string,
  ) {
    super(`${code} at ${datasetPath}: ${detail}`);
    this.name = 'CoreV2MigrationError';
    this.code = code;
    this.datasetPath = datasetPath;
  }
}

export interface CoreV2CompatibilityMaterialization {
  readonly revision: typeof CORE_V2_MIGRATION_REVISION;
  readonly sourceKind: 'canonical-array' | 'legacy-generic-item';
  /**
   * Schema-compatible detached input for Engine.loadDataset or persistence.
   * This deliberately preserves the minimal canonical representation instead
   * of exposing materializer-added defaults as authored data.
   */
  readonly canonicalDataset: readonly unknown[];
  readonly materialization: CoreV2DatasetMaterialization;
  readonly semanticHash: string;
}

export interface CoreV2PersistenceExport {
  readonly revision: typeof CORE_V2_MIGRATION_REVISION;
  readonly rootKind: 'array';
  readonly dataset: readonly CoreV2Element[];
  readonly serialized: string;
  readonly semanticHash: string;
}

export interface CoreV2MigrationEffectResult {
  readonly effect: CoreV2MigrationEffect;
  readonly role: 'authoritative' | 'shadow';
  readonly published: boolean;
  readonly suppressed: boolean;
}

export interface CoreV2MigrationCohortResult {
  readonly guardedBlockers: readonly CoreV2MigrationBlocker[];
  readonly failures: readonly CoreV2MigrationBlocker[];
  readonly completedCohorts: readonly number[];
  readonly stoppedAtPercent: number | null;
  readonly promotionAllowed: boolean;
}

export interface CoreV2MigrationProbe {
  readonly revision: typeof CORE_V2_MIGRATION_REVISION;
  readonly desiredEngine: CoreV2MigrationEngine;
  readonly activeEngine: CoreV2MigrationEngine | null;
  readonly shadowEngine: CoreV2MigrationShadowEngine | null;
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
  readonly effectCounts: Readonly<Record<CoreV2MigrationEffect, number>>;
  readonly cohort: CoreV2MigrationCohortResult | null;
  readonly rollbackPending: boolean;
  readonly triggerStates: readonly CoreV2MigrationTriggerState[];
  readonly activeGestureCount: number;
  readonly staleGestureCount: 0;
  readonly replayedGestureCount: 0;
  readonly retainedCallbackCount: 0;
  readonly destroyed: boolean;
}

interface ActiveMigrationSession {
  readonly id: string;
  readonly engine: CoreV2MigrationEngine;
  readonly shadow: CoreV2MigrationShadowEngine | null;
  readonly shadowMode: 'read-only' | null;
}

const LEGACY_ROOT_FIELDS = new Set([
  'kind',
  'id',
  'x',
  'y',
  'width',
  'height',
  'label',
]);
const EFFECT_SET = new Set<string>(CORE_V2_MIGRATION_EFFECTS);
const BLOCKER_SET = new Set<string>(CORE_V2_MIGRATION_BLOCKERS);
const TRIGGER_STATE_SET = new Set<string>([
  'idle',
  'load-failure',
  'update',
  'gesture',
  'remount',
]);

/**
 * Compatibility boundary for the approved PATCH MAP profile. Canonical
 * arrays still go through the strict materializer. The only legacy object
 * admitted is the pinned generic-item shape; out-of-profile objects fail with
 * an exact path instead of being guessed or silently dropped.
 */
export function materializeCoreV2CompatibilityDataset(
  input: unknown,
): CoreV2CompatibilityMaterialization {
  if (Array.isArray(input)) {
    const canonicalDataset = cloneSerializableArray(input, '$');
    const materialization = materializeCoreV2Dataset(canonicalDataset);
    return freezeCompatibilityResult(
      'canonical-array',
      canonicalDataset,
      materialization,
    );
  }

  const legacy = legacyRoot(input);
  const canonicalDataset = deepFreeze([{
    type: 'item',
    id: legacy.id,
    ...(legacy.label === undefined ? {} : { label: legacy.label }),
    size: {
      width: legacy.width,
      height: legacy.height,
    },
    attrs: {
      x: legacy.x,
      y: legacy.y,
    },
  }]);
  const materialization = materializeCoreV2Dataset(canonicalDataset);
  return freezeCompatibilityResult(
    'legacy-generic-item',
    canonicalDataset,
    materialization,
  );
}

/**
 * Validate an array-root persistence candidate without performing a write.
 * A caller may commit `serialized` only after this function returns.
 */
export function prepareCoreV2PersistenceExport(
  input: unknown,
  options: Readonly<{ strictReferences?: boolean }> = {},
): CoreV2PersistenceExport {
  if (!Array.isArray(input)) {
    throw new CoreV2MigrationError(
      'INVALID_EXPORT_ROOT',
      '$',
      'persisted Core v2 data must use the unversioned array root',
    );
  }
  const detached = cloneSerializableArray(input, '$');
  const materialization = materializeCoreV2Dataset(detached);
  if (options.strictReferences !== false) {
    validateCoreV2DatasetReferences(materialization.dataset);
  }
  const serialized = JSON.stringify(materialization.dataset);
  return Object.freeze({
    revision: CORE_V2_MIGRATION_REVISION,
    rootKind: 'array',
    dataset: materialization.dataset,
    serialized,
    semanticHash: materialization.semanticHash,
  });
}

export function assertCoreV2SemanticRoundtrip(
  before: Readonly<{ semanticHash: string }>,
  after: Readonly<{ semanticHash: string }>,
): void {
  if (
    typeof before.semanticHash !== 'string' ||
    typeof after.semanticHash !== 'string' ||
    before.semanticHash !== after.semanticHash
  ) {
    throw new CoreV2MigrationError(
      'SEMANTIC_MISMATCH',
      '$',
      'persistence roundtrip changed the canonical semantic hash',
    );
  }
}

/**
 * Host-facing, instance-local migration authority. It owns only cohort,
 * effect, and mount decisions; renderers and datasets stay with the host.
 */
export class CoreV2MigrationAuthority {
  private desiredEngineValue: CoreV2MigrationEngine;
  private activeSession: ActiveMigrationSession | null = null;
  private readonly effectCountsValue = createEffectCounts();
  private authoritativeEffectCountValue = 0;
  private suppressedShadowEffectCountValue = 0;
  private cohortValue: CoreV2MigrationCohortResult | null = null;
  private rollbackPendingValue = false;
  private readonly triggerStatesValue: CoreV2MigrationTriggerState[] = [];
  private readonly activeGestures = new Set<string>();
  private destroyedValue = false;

  public constructor(initialEngine: CoreV2MigrationEngine = 'core-v2') {
    this.desiredEngineValue = migrationEngine(initialEngine, 'initial engine');
  }

  public mountSession(
    sessionId: string,
    options: Readonly<{
      authoritative?: CoreV2MigrationEngine;
      shadow?: CoreV2MigrationShadowEngine | null;
      shadowMode?: 'read-only';
    }> = {},
  ): CoreV2MigrationProbe {
    this.assertAlive();
    if (this.activeSession !== null) {
      throw new Error('Core v2 migration session is already mounted');
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
    effectValue: CoreV2MigrationEffect,
  ): CoreV2MigrationEffectResult {
    this.assertMounted();
    const effect = migrationEffect(effectValue);
    if (role === 'shadow') {
      if (this.activeSession?.shadow === null) {
        throw new Error('Core v2 migration shadow is not mounted');
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
      guardedBlockers: readonly CoreV2MigrationBlocker[];
      failures?: readonly CoreV2MigrationBlocker[];
    }>,
  ): CoreV2MigrationCohortResult {
    this.assertAlive();
    exactNumberArray(
      input.cohortsPercent,
      CORE_V2_MIGRATION_COHORTS,
      'migration cohorts',
    );
    const guardedBlockers = blockerArray(
      input.guardedBlockers,
      'guarded blockers',
    );
    exactStringArray(
      guardedBlockers,
      CORE_V2_MIGRATION_BLOCKERS,
      'migration blockers',
    );
    const failures = blockerArray(input.failures ?? [], 'cohort failures');
    const firstFailure = failures[0] ?? null;
    const stoppedAtPercent = firstFailure === null
      ? null
      : CORE_V2_MIGRATION_COHORTS[0];
    const completedCohorts = firstFailure === null
      ? [...CORE_V2_MIGRATION_COHORTS]
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
      from: CoreV2MigrationEngine;
      to: CoreV2MigrationEngine;
      effectiveAt: 'next-remount';
    }>,
  ): CoreV2MigrationProbe {
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

  public recordTriggerState(stateValue: CoreV2MigrationTriggerState): void {
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

  public remountSession(nextSessionId: string): CoreV2MigrationProbe {
    this.assertMounted();
    this.activeGestures.clear();
    this.activeSession = null;
    this.rollbackPendingValue = false;
    return this.mountSession(nextSessionId, {
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

  public probe(): CoreV2MigrationProbe {
    const active = this.activeSession;
    return Object.freeze({
      revision: CORE_V2_MIGRATION_REVISION,
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
      throw new Error('Core v2 migration session is not mounted');
    }
  }

  private assertAlive(): void {
    if (this.destroyedValue) {
      throw new Error('Core v2 migration authority is destroyed');
    }
  }
}

function freezeCompatibilityResult(
  sourceKind: CoreV2CompatibilityMaterialization['sourceKind'],
  canonicalDataset: readonly unknown[],
  materialization: CoreV2DatasetMaterialization,
): CoreV2CompatibilityMaterialization {
  return Object.freeze({
    revision: CORE_V2_MIGRATION_REVISION,
    sourceKind,
    canonicalDataset,
    materialization,
    semanticHash: materialization.semanticHash,
  });
}

function legacyRoot(input: unknown): Readonly<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}> {
  if (!isPlainRecord(input)) {
    legacyFail('$', 'legacy root must be one plain generic-item object');
  }
  for (const key of Object.keys(input)) {
    if (!LEGACY_ROOT_FIELDS.has(key)) {
      legacyFail(`$.${key}`, `unknown legacy root field ${JSON.stringify(key)}`);
    }
  }
  if (input.kind !== 'generic-item') {
    legacyFail('$.kind', 'legacy root kind must be "generic-item"');
  }
  const id = legacyString(input.id, '$.id');
  const width = legacyNonnegativeNumber(input.width, '$.width');
  const height = legacyNonnegativeNumber(input.height, '$.height');
  const x = input.x === undefined ? 0 : legacyFiniteNumber(input.x, '$.x');
  const y = input.y === undefined ? 0 : legacyFiniteNumber(input.y, '$.y');
  const label = input.label === undefined
    ? undefined
    : legacyString(input.label, '$.label');
  return Object.freeze({
    id,
    x,
    y,
    width,
    height,
    ...(label === undefined ? {} : { label }),
  });
}

function cloneSerializableArray(
  value: readonly unknown[],
  path: string,
): readonly unknown[] {
  return cloneSerializable(value, path, new Set()) as readonly unknown[];
}

function cloneSerializable(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) serializableFail(path, 'number must be finite');
    return value;
  }
  if (typeof value !== 'object') {
    serializableFail(path, `unsupported ${typeof value} value`);
  }
  if (ancestors.has(value)) {
    serializableFail(path, 'cyclic values are not serializable');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          serializableFail(`${path}[${index}]`, 'array holes are not serializable');
        }
        clone.push(cloneSerializable(value[index], `${path}[${index}]`, ancestors));
      }
      return Object.freeze(clone);
    }
    if (!isPlainRecord(value)) {
      serializableFail(path, 'value must be a plain JSON object or array');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      serializableFail(path, 'symbol-keyed properties are not serializable');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !('value' in descriptor)) {
        serializableFail(`${path}.${key}`, 'accessor properties are not serializable');
      }
      Object.defineProperty(clone, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: cloneSerializable(descriptor.value, `${path}.${key}`, ancestors),
      });
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function createEffectCounts(): Record<CoreV2MigrationEffect, number> {
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
  value: CoreV2MigrationEngine,
  label: string,
): CoreV2MigrationEngine {
  if (value !== 'core-v2' && value !== 'previous') {
    throw new TypeError(`${label} must be core-v2 or previous`);
  }
  return value;
}

function migrationShadowEngine(
  value: CoreV2MigrationShadowEngine,
): CoreV2MigrationShadowEngine {
  if (value !== 'comparison' && value !== 'previous') {
    throw new TypeError('shadow engine must be comparison or previous');
  }
  return value;
}

function migrationEffect(value: CoreV2MigrationEffect): CoreV2MigrationEffect {
  if (!EFFECT_SET.has(value)) {
    throw new TypeError(`unsupported migration effect ${String(value)}`);
  }
  return value;
}

function blockerArray(
  value: unknown,
  label: string,
): readonly CoreV2MigrationBlocker[] {
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
    return entry as CoreV2MigrationBlocker;
  }));
}

function triggerState(
  value: CoreV2MigrationTriggerState,
): CoreV2MigrationTriggerState {
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

function legacyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    legacyFail(path, 'value must be a non-empty string');
  }
  return value;
}

function legacyFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    legacyFail(path, 'value must be finite');
  }
  return value;
}

function legacyNonnegativeNumber(value: unknown, path: string): number {
  const number = legacyFiniteNumber(value, path);
  if (number < 0) legacyFail(path, 'value must be nonnegative');
  return number;
}

function legacyFail(path: string, detail: string): never {
  throw new CoreV2MigrationError('INVALID_LEGACY_ROOT', path, detail);
}

function serializableFail(path: string, detail: string): never {
  throw new CoreV2MigrationError('NON_SERIALIZABLE_VALUE', path, detail);
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
