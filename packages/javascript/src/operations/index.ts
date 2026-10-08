import {
  PATCH_MAP_OPERATIONS_REVISION,
  PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION,
  type PatchMapOperationalCallback,
  type PatchMapOperationalDiagnosticInput,
  type PatchMapOperationalDispatchResult,
  type PatchMapOperationalEvent,
  type PatchMapOperationalEventInput,
  type PatchMapOperationalSubscription,
  type PatchMapOperationsAuthorityOptions,
  type PatchMapOperationsProbe,
  type PatchMapRuntimeDiagnosticRecord,
  type PatchMapRuntimeDiagnosticsSnapshot,
  type PatchMapRuntimeDiagnosticsState,
  type PatchMapSanitizedDiagnostic,
} from './contracts';
import {
  DEFAULT_DIAGNOSTIC_CAPACITY,
  DISABLED_RUNTIME_DIAGNOSTICS,
  controlledValue,
  deepFreeze,
  emptyDispatchResult,
  normalizeCapacity,
  normalizeCountRecord,
  normalizeDigest,
  normalizeRevisionStamp,
  redactPatchMapOperationalDiagnostic,
  redactPatchMapOperationalEvent,
  telemetryFromDiagnostic,
} from './redaction-values';

export * from './contracts';
export { PatchMapExtractionSecurityAuthority } from './extraction-security-authority';
export {
  redactPatchMapOperationalDiagnostic,
  redactPatchMapOperationalEvent,
};

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
    const queuedActionCount = Math.max(0, this.queuedActions.length - queueStart);
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
