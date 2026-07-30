export const PATCH_MAP_OPERATIONS_REVISION = 'core-v2-operations/1' as const;
export const PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION =
  'core-v2-runtime-diagnostics/1' as const;
export const PATCH_MAP_EXTRACTION_SECURITY_REVISION =
  'core-v2-extraction-security/1' as const;

const DEFAULT_DIAGNOSTIC_CAPACITY = 100;
const MAX_DIAGNOSTIC_CAPACITY = 100;
const EMPTY_REVISION_STAMP = Object.freeze({
  lifecycleGeneration: 0,
  sceneRevision: 0,
  viewRevision: 0,
  interactionRevision: 0,
});
const DISABLED_RUNTIME_DIAGNOSTICS = Object.freeze({
  revision: PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION,
  enabled: false,
  capacity: 0,
  records: Object.freeze([]),
  current: null,
});

export interface PatchMapOperationsRevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

export interface PatchMapOperationalDiagnosticInput {
  readonly code: string;
  readonly category: string;
  readonly operation: string;
  readonly lifecycleGeneration?: number;
  readonly sceneRevision?: number;
  readonly revisionStamp?: PatchMapOperationsRevisionStamp;
  readonly logicalId?: string | null;
  readonly recoverable?: boolean;
  readonly retryable?: boolean;
  readonly appliedCount?: number;
  readonly missingCount?: number;
  readonly unchangedCount?: number;
  readonly details?: unknown;
}

export interface PatchMapSanitizedDiagnostic {
  readonly code: string;
  readonly category: string;
  readonly operation: string;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId: string | null;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
  readonly sanitizedHash: string;
}

export interface PatchMapOperationalEventInput {
  readonly type: string;
  readonly operation: string;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId?: string | null;
  readonly counts?: Readonly<Record<string, number>>;
  readonly details?: unknown;
}

export interface PatchMapOperationalEvent {
  readonly type: string;
  readonly operation: string;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId: string | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly sanitizedHash: string;
}

export interface PatchMapOperationalCallbackControl {
  enqueue(id: string, action: () => void): void;
}

export type PatchMapOperationalCallback = (
  event: PatchMapOperationalEvent,
  control: PatchMapOperationalCallbackControl,
) => void;

export interface PatchMapOperationalSubscription {
  readonly id: string;
  dispose(): boolean;
}

export interface PatchMapOperationalDispatchResult {
  readonly deliveredCount: number;
  readonly callbackFailureCount: number;
  readonly queuedActionCount: number;
  readonly queuedActionFailureCount: number;
}

export interface PatchMapRuntimeDiagnosticsState {
  readonly instanceId: string | null;
  readonly lifecycle: string;
  readonly backend: Readonly<{
    readonly kind: string | null;
    readonly lossState: string;
  }>;
  readonly revisions: PatchMapOperationsRevisionStamp;
  readonly counts: Readonly<{
    readonly roots: number;
    readonly elements: number;
    readonly components: number;
    readonly materialized: number;
    readonly text: number;
    readonly relations: number;
  }>;
  readonly activeWork: Readonly<{
    readonly gestures: number;
    readonly animations: number;
    readonly pendingAssets: number;
    readonly pendingWork: number;
  }>;
  readonly resources: Readonly<{
    readonly canvases: number;
    readonly listeners: number;
    readonly observers: number;
    readonly tickers: number;
    readonly textureLeases: number;
    readonly callbackRegistrations: number;
  }>;
  readonly cleanup: Readonly<{
    readonly destroyed: boolean;
    readonly released: boolean;
  }>;
}

export interface PatchMapRuntimeDiagnosticRecord extends PatchMapRuntimeDiagnosticsState {
  readonly package: Readonly<{
    readonly version: string;
    readonly digest: string | null;
  }>;
  readonly sequence: number;
  readonly lastAction: Readonly<{
    readonly operation: string;
    readonly status: 'completed' | 'failed';
  }> | null;
  readonly lastError: PatchMapSanitizedDiagnostic | null;
}

export interface PatchMapRuntimeDiagnosticsSnapshot {
  readonly revision: typeof PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION;
  readonly enabled: boolean;
  readonly capacity: number;
  readonly records: readonly PatchMapRuntimeDiagnosticRecord[];
  readonly current: PatchMapRuntimeDiagnosticRecord | null;
}

export interface PatchMapOperationsProbe {
  readonly revision: typeof PATCH_MAP_OPERATIONS_REVISION;
  readonly collectionEnabled: boolean;
  readonly telemetryEnabled: boolean;
  readonly capacity: number;
  readonly recordCount: number;
  readonly diagnosticObserverCount: number;
  readonly telemetryObserverCount: number;
  readonly callbackRegistrations: number;
  readonly queuedActionCount: number;
  readonly disposed: boolean;
  readonly lastCallbackFailure: PatchMapSanitizedDiagnostic | null;
}

export interface PatchMapOperationsAuthorityOptions {
  readonly collectionEnabled?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly capacity?: number;
  readonly instanceId?: string;
  readonly packageVersion?: string;
  readonly packageDigest?: string | null;
  readonly logger?: (diagnostic: PatchMapSanitizedDiagnostic) => void;
}

interface CallbackEntry<T> {
  readonly id: string;
  readonly callback: T;
  active: boolean;
}

interface QueuedAction {
  readonly id: string;
  readonly action: () => void;
}

/**
 * Instance-local production diagnostics and host callback authority.
 *
 * Customer values are consumed only by the bounded hash projection. Raw
 * details are never retained or returned by this authority.
 */
export class PatchMapOperationsAuthority {
  private collectionEnabled: boolean;
  private telemetryEnabled: boolean;
  private readonly capacity: number;
  private instanceId: string | null;
  private readonly packageVersion: string;
  private readonly packageDigest: string | null;
  private readonly logger: ((diagnostic: PatchMapSanitizedDiagnostic) => void) | null;
  private readonly diagnosticObservers = new Map<
    string,
    CallbackEntry<(diagnostic: PatchMapSanitizedDiagnostic) => void>
  >();
  private readonly telemetryObservers = new Map<string, CallbackEntry<PatchMapOperationalCallback>>();
  private readonly records: PatchMapRuntimeDiagnosticRecord[] = [];
  private readonly queuedActions: QueuedAction[] = [];
  private sequence = 0;
  private deliveryDepth = 0;
  private disposed = false;
  private lastAction: PatchMapRuntimeDiagnosticRecord['lastAction'] = null;
  private lastError: PatchMapSanitizedDiagnostic | null = null;
  private lastCallbackFailure: PatchMapSanitizedDiagnostic | null = null;

  public constructor(options: PatchMapOperationsAuthorityOptions = {}) {
    this.collectionEnabled = options.collectionEnabled ?? false;
    this.telemetryEnabled = options.telemetryEnabled ?? false;
    this.capacity = normalizeCapacity(options.capacity ?? DEFAULT_DIAGNOSTIC_CAPACITY);
    this.instanceId = options.instanceId === undefined
      ? null
      : controlledValue(options.instanceId, 'instance');
    this.packageVersion = controlledValue(options.packageVersion ?? '0.10.0', 'unknown');
    this.packageDigest = normalizeDigest(options.packageDigest ?? null);
    this.logger = options.logger ?? null;
  }

  public get isCollectionEnabled(): boolean {
    return this.collectionEnabled;
  }

  public isInstanceCompatible(instanceId: string): boolean {
    const normalized = controlledValue(instanceId, 'instance');
    return this.instanceId === null || this.instanceId === normalized;
  }

  public configureInstance(instanceId: string): void {
    const normalized = controlledValue(instanceId, 'instance');
    if (this.instanceId !== null && this.instanceId !== normalized) {
      throw new Error('PatchMap operations instance identity cannot change');
    }
    this.instanceId = normalized;
  }

  public setCollectionEnabled(enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('PatchMap operations collection flag must be boolean');
    }
    const changed = this.collectionEnabled !== enabled;
    this.collectionEnabled = enabled;
    return changed;
  }

  public setTelemetryEnabled(enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('PatchMap operations telemetry flag must be boolean');
    }
    const changed = this.telemetryEnabled !== enabled;
    this.telemetryEnabled = enabled;
    return changed;
  }

  public noteAction(operation: string, status: 'completed' | 'failed' = 'completed'): void {
    this.lastAction = Object.freeze({
      operation: controlledValue(operation, 'unknown'),
      status,
    });
  }

  public reportDiagnostic(
    input: PatchMapOperationalDiagnosticInput,
  ): PatchMapSanitizedDiagnostic {
    const diagnostic = redactPatchMapOperationalDiagnostic(input);
    this.lastError = diagnostic;
    this.noteAction(diagnostic.operation, 'failed');
    if (this.logger !== null) {
      try {
        this.logger(diagnostic);
      } catch {
        // A host logger is observational and never owns product state.
      }
    }
    this.deliverDiagnostic(diagnostic);
    if (this.telemetryEnabled && !this.disposed) {
      this.dispatchTelemetry(
        telemetryFromDiagnostic(diagnostic),
        true,
      );
    }
    return diagnostic;
  }

  public subscribeDiagnostics(
    id: string,
    callback: (diagnostic: PatchMapSanitizedDiagnostic) => void,
  ): PatchMapOperationalSubscription {
    return this.registerCallback(
      this.diagnosticObservers,
      id,
      callback,
      'diagnostic observer',
    );
  }

  public subscribeTelemetry(
    id: string,
    callback: PatchMapOperationalCallback,
  ): PatchMapOperationalSubscription {
    return this.registerCallback(
      this.telemetryObservers,
      id,
      callback,
      'telemetry observer',
    );
  }

  public emitTelemetry(
    input: PatchMapOperationalEventInput,
  ): PatchMapOperationalDispatchResult {
    if (!this.telemetryEnabled || this.disposed) return emptyDispatchResult();
    return this.dispatchTelemetry(redactPatchMapOperationalEvent(input), false);
  }

  public captureRuntimeDiagnostics(
    state: PatchMapRuntimeDiagnosticsState,
  ): PatchMapRuntimeDiagnosticsSnapshot {
    if (!this.collectionEnabled) return DISABLED_RUNTIME_DIAGNOSTICS;
    const record = deepFreeze({
      package: {
        version: this.packageVersion,
        digest: this.packageDigest,
      },
      instanceId: this.instanceId ?? state.instanceId,
      lifecycle: controlledValue(state.lifecycle, 'unknown'),
      backend: {
        kind: state.backend.kind === null
          ? null
          : controlledValue(state.backend.kind, 'unknown'),
        lossState: controlledValue(state.backend.lossState, 'unknown'),
      },
      revisions: normalizeRevisionStamp(state.revisions),
      counts: normalizeCountRecord(state.counts),
      activeWork: normalizeCountRecord(state.activeWork),
      resources: normalizeCountRecord(state.resources),
      cleanup: {
        destroyed: state.cleanup.destroyed === true,
        released: state.cleanup.released === true,
      },
      sequence: ++this.sequence,
      lastAction: this.lastAction,
      lastError: this.lastError,
    } satisfies PatchMapRuntimeDiagnosticRecord);
    this.records.push(record);
    if (this.records.length > this.capacity) this.records.shift();
    return deepFreeze({
      revision: PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION,
      enabled: true,
      capacity: this.capacity,
      records: [...this.records],
      current: record,
    });
  }

  public exportEvidence(): Readonly<{
    readonly revision: typeof PATCH_MAP_OPERATIONS_REVISION;
    readonly diagnostics: readonly PatchMapSanitizedDiagnostic[];
    readonly runtimeRecords: readonly PatchMapRuntimeDiagnosticRecord[];
  }> {
    return deepFreeze({
      revision: PATCH_MAP_OPERATIONS_REVISION,
      diagnostics: this.lastError === null ? [] : [this.lastError],
      runtimeRecords: [...this.records],
    });
  }

  public probe(): PatchMapOperationsProbe {
    return Object.freeze({
      revision: PATCH_MAP_OPERATIONS_REVISION,
      collectionEnabled: this.collectionEnabled,
      telemetryEnabled: this.telemetryEnabled,
      capacity: this.capacity,
      recordCount: this.records.length,
      diagnosticObserverCount: activeCount(this.diagnosticObservers),
      telemetryObserverCount: activeCount(this.telemetryObservers),
      callbackRegistrations:
        activeCount(this.diagnosticObservers) + activeCount(this.telemetryObservers),
      queuedActionCount: this.queuedActions.length,
      disposed: this.disposed,
      lastCallbackFailure: this.lastCallbackFailure,
    });
  }

  public disposeCallbacks(): boolean {
    const changed = !this.disposed
      || this.diagnosticObservers.size > 0
      || this.telemetryObservers.size > 0
      || this.queuedActions.length > 0;
    this.disposed = true;
    deactivate(this.diagnosticObservers);
    deactivate(this.telemetryObservers);
    this.diagnosticObservers.clear();
    this.telemetryObservers.clear();
    this.queuedActions.splice(0);
    return changed;
  }

  private registerCallback<T>(
    registry: Map<string, CallbackEntry<T>>,
    idValue: string,
    callback: T,
    label: string,
  ): PatchMapOperationalSubscription {
    if (this.disposed) throw new Error(`PatchMap ${label} authority is disposed`);
    if (typeof callback !== 'function') throw new TypeError(`${label} must be a function`);
    const id = controlledValue(idValue, label);
    if (registry.has(id)) throw new Error(`Duplicate PatchMap ${label} ${id}`);
    const entry: CallbackEntry<T> = { id, callback, active: true };
    registry.set(id, entry);
    return Object.freeze({
      id,
      dispose: (): boolean => {
        if (!entry.active) return false;
        entry.active = false;
        registry.delete(id);
        return true;
      },
    });
  }

  private deliverDiagnostic(diagnostic: PatchMapSanitizedDiagnostic): void {
    const snapshot = [...this.diagnosticObservers.values()];
    for (const entry of snapshot) {
      if (!entry.active || !this.diagnosticObservers.has(entry.id)) continue;
      try {
        entry.callback(diagnostic);
      } catch {
        // Diagnostic observer failures are deliberately not recursively reported.
      }
    }
  }

  private dispatchTelemetry(
    event: PatchMapOperationalEvent,
    suppressFailureTelemetry: boolean,
  ): PatchMapOperationalDispatchResult {
    const snapshot = [...this.telemetryObservers.values()];
    let deliveredCount = 0;
    let callbackFailureCount = 0;
    let queuedActionFailureCount = 0;
    const queueStart = this.queuedActions.length;
    this.deliveryDepth += 1;
    try {
      for (const entry of snapshot) {
        if (!entry.active || !this.telemetryObservers.has(entry.id)) continue;
        deliveredCount += 1;
        try {
          entry.callback(event, Object.freeze({
            enqueue: (id: string, action: () => void): void => {
              if (typeof action !== 'function') {
                throw new TypeError('PatchMap queued host action must be a function');
              }
              this.queuedActions.push({
                id: controlledValue(id, 'queued-action'),
                action,
              });
            },
          }));
        } catch (error) {
          callbackFailureCount += 1;
          const failure = redactPatchMapOperationalDiagnostic({
            code: 'HOST_CALLBACK_FAILURE',
            category: 'HOST_CALLBACK_FAILURE',
            operation: `telemetry:${event.type}`,
            revisionStamp: event.revisionStamp,
            logicalId: entry.id,
            recoverable: true,
            retryable: false,
            details: error,
          });
          this.lastCallbackFailure = failure;
          this.lastError = failure;
          this.noteAction(failure.operation, 'failed');
          if (!suppressFailureTelemetry) {
            if (this.logger !== null) {
              try {
                this.logger(failure);
              } catch {
                // Host logging cannot interrupt deterministic delivery.
              }
            }
            this.deliverDiagnostic(failure);
          }
        }
      }
    } finally {
      this.deliveryDepth -= 1;
    }
    const queuedActionCount = this.queuedActions.length - queueStart;
    if (this.deliveryDepth === 0) {
      while (this.queuedActions.length > 0) {
        const queued = this.queuedActions.shift();
        if (queued === undefined) break;
        try {
          queued.action();
        } catch (error) {
          queuedActionFailureCount += 1;
          const failure = redactPatchMapOperationalDiagnostic({
            code: 'HOST_CALLBACK_FAILURE',
            category: 'HOST_CALLBACK_FAILURE',
            operation: `queued:${queued.id}`,
            revisionStamp: event.revisionStamp,
            logicalId: queued.id,
            recoverable: true,
            retryable: false,
            details: error,
          });
          this.lastError = failure;
          this.lastCallbackFailure = failure;
          this.noteAction(failure.operation, 'failed');
          if (this.logger !== null) {
            try {
              this.logger(failure);
            } catch {
              // A host logger cannot re-enter queued telemetry delivery.
            }
          }
          this.deliverDiagnostic(failure);
        }
      }
    }
    return Object.freeze({
      deliveredCount,
      callbackFailureCount,
      queuedActionCount,
      queuedActionFailureCount,
    });
  }
}

export type PatchMapExtractionReadability =
  | 'readable'
  | 'tainted'
  | 'readback-failed';

export interface PatchMapExtractionSecurityProbe {
  readonly revision: typeof PATCH_MAP_EXTRACTION_SECURITY_REVISION;
  readonly trackedAssetCount: number;
  readonly unreadableAssetCount: number;
  readonly code: 'EXTRACTION_TAINTED' | 'EXTRACTION_READBACK_FAILED' | null;
  readonly sanitizedAssetId: string | null;
}

/**
 * Renderer-independent asset readability ledger. Asset loaders register only
 * logical ownership and readability; source URLs and bytes never enter it.
 */
export class PatchMapExtractionSecurityAuthority {
  private readonly assets = new Map<string, PatchMapExtractionReadability>();

  public setAssetReadability(
    logicalAssetId: string,
    readability: PatchMapExtractionReadability,
  ): void {
    const id = controlledValue(logicalAssetId, 'asset');
    if (!['readable', 'tainted', 'readback-failed'].includes(readability)) {
      throw new TypeError('Unknown PatchMap extraction readability');
    }
    this.assets.set(id, readability);
  }

  public deleteAsset(logicalAssetId: string): boolean {
    return this.assets.delete(controlledValue(logicalAssetId, 'asset'));
  }

  public clear(): void {
    this.assets.clear();
  }

  public preflight(): PatchMapExtractionSecurityProbe {
    let firstFailed: readonly [string, PatchMapExtractionReadability] | null = null;
    let unreadableAssetCount = 0;
    for (const entry of this.assets.entries()) {
      if (entry[1] === 'readable') continue;
      unreadableAssetCount += 1;
      if (firstFailed === null) firstFailed = entry;
    }
    const code = firstFailed === null
      ? null
      : firstFailed[1] === 'tainted'
        ? 'EXTRACTION_TAINTED'
        : 'EXTRACTION_READBACK_FAILED';
    return Object.freeze({
      revision: PATCH_MAP_EXTRACTION_SECURITY_REVISION,
      trackedAssetCount: this.assets.size,
      unreadableAssetCount,
      code,
      sanitizedAssetId: firstFailed === null
        ? null
        : `asset:${boundedHash(firstFailed[0])}`,
    });
  }
}

export function redactPatchMapOperationalDiagnostic(
  input: PatchMapOperationalDiagnosticInput,
): PatchMapSanitizedDiagnostic {
  const revisions = normalizeRevisionStamp(
    input.revisionStamp ?? {
      ...EMPTY_REVISION_STAMP,
      lifecycleGeneration: input.lifecycleGeneration ?? 0,
      sceneRevision: input.sceneRevision ?? 0,
    },
  );
  const logicalId = input.logicalId === undefined || input.logicalId === null
    ? null
    : controlledValue(input.logicalId, `id:${boundedHash(input.logicalId)}`);
  const stable = {
    code: controlledValue(input.code, 'INTERNAL_FAILURE'),
    category: controlledValue(input.category, 'INTERNAL_FAILURE'),
    operation: controlledValue(input.operation, 'unknown'),
    lifecycleGeneration: revisions.lifecycleGeneration,
    sceneRevision: revisions.sceneRevision,
    revisionStamp: revisions,
    logicalId,
    recoverable: input.recoverable === true,
    retryable: input.retryable === true,
    appliedCount: nonNegativeCount(input.appliedCount ?? 0),
    missingCount: nonNegativeCount(input.missingCount ?? 0),
    unchangedCount: nonNegativeCount(input.unchangedCount ?? 0),
  };
  return deepFreeze({
    ...stable,
    sanitizedHash: boundedHash({
      stable,
      details: input.details,
    }),
  });
}

export function redactPatchMapOperationalEvent(
  input: PatchMapOperationalEventInput,
): PatchMapOperationalEvent {
  const stable = {
    type: controlledValue(input.type, 'unknown'),
    operation: controlledValue(input.operation, 'unknown'),
    revisionStamp: normalizeRevisionStamp(input.revisionStamp),
    logicalId: input.logicalId === undefined || input.logicalId === null
      ? null
      : controlledValue(input.logicalId, `id:${boundedHash(input.logicalId)}`),
    counts: normalizeCountRecord(input.counts ?? {}),
  };
  return deepFreeze({
    ...stable,
    sanitizedHash: boundedHash({ stable, details: input.details }),
  });
}

function telemetryFromDiagnostic(
  diagnostic: PatchMapSanitizedDiagnostic,
): PatchMapOperationalEvent {
  return deepFreeze({
    type: 'diagnostic',
    operation: diagnostic.operation,
    revisionStamp: diagnostic.revisionStamp,
    logicalId: diagnostic.logicalId,
    counts: {
      applied: diagnostic.appliedCount,
      missing: diagnostic.missingCount,
      unchanged: diagnostic.unchangedCount,
    },
    sanitizedHash: diagnostic.sanitizedHash,
  });
}

function emptyDispatchResult(): PatchMapOperationalDispatchResult {
  return Object.freeze({
    deliveredCount: 0,
    callbackFailureCount: 0,
    queuedActionCount: 0,
    queuedActionFailureCount: 0,
  });
}

function normalizeRevisionStamp(
  value: PatchMapOperationsRevisionStamp,
): PatchMapOperationsRevisionStamp {
  return Object.freeze({
    lifecycleGeneration: nonNegativeCount(value.lifecycleGeneration),
    sceneRevision: nonNegativeCount(value.sceneRevision),
    viewRevision: nonNegativeCount(value.viewRevision),
    interactionRevision: nonNegativeCount(value.interactionRevision),
  });
}

function normalizeCountRecord<T extends Readonly<Record<string, number>>>(
  input: T,
): T {
  const output: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    output[controlledValue(key, 'count')] = nonNegativeCount(input[key] ?? 0);
  }
  return Object.freeze(output) as T;
}

function normalizeCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIAGNOSTIC_CAPACITY) {
    throw new RangeError(`PatchMap diagnostic capacity must be between 1 and ${MAX_DIAGNOSTIC_CAPACITY}`);
  }
  return value;
}

function normalizeDigest(value: string | null): string | null {
  if (value === null) return null;
  return /^[a-f0-9]{64}$/u.test(value) ? value : `hash:${boundedHash(value)}`;
}

function controlledValue(value: string, fallback: string): string {
  return /^[A-Za-z0-9_.:/-]{1,128}$/u.test(value) ? value : fallback;
}

function nonNegativeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return value;
}

function activeCount<T>(registry: ReadonlyMap<string, CallbackEntry<T>>): number {
  let count = 0;
  for (const entry of registry.values()) {
    if (entry.active) count += 1;
  }
  return count;
}

function deactivate<T>(registry: ReadonlyMap<string, CallbackEntry<T>>): void {
  for (const entry of registry.values()) entry.active = false;
}

function boundedHash(value: unknown): string {
  const text = boundedStableText(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function boundedStableText(value: unknown): string {
  const seen = new WeakSet<object>();
  let visited = 0;
  function visit(current: unknown, depth: number): unknown {
    if (visited >= 256) return '[LIMIT]';
    visited += 1;
    if (current === null) return null;
    if (typeof current === 'string') return current.slice(0, 1_024);
    if (typeof current === 'number') return Number.isFinite(current) ? current : '[NON_FINITE]';
    if (typeof current === 'boolean') return current;
    if (typeof current === 'bigint') return current.toString();
    if (typeof current === 'undefined') return '[UNDEFINED]';
    if (typeof current === 'symbol') return '[SYMBOL]';
    if (typeof current === 'function') return '[FUNCTION]';
    if (depth >= 6) return '[DEPTH]';
    if (seen.has(current)) return '[CYCLE]';
    seen.add(current);
    if (current instanceof Error) {
      return {
        name: controlledValue(current.name, 'Error'),
        cause: visit(current.cause, depth + 1),
      };
    }
    if (Array.isArray(current)) {
      return current.slice(0, 64).map((entry) => visit(entry, depth + 1));
    }
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(current).sort().slice(0, 64)) {
      output[key.slice(0, 128)] = visit(
        (current as Readonly<Record<string, unknown>>)[key],
        depth + 1,
      );
    }
    return output;
  }
  return JSON.stringify(visit(value, 0));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
