import {
  PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION,
  type PatchMapOperationalDiagnosticInput,
  type PatchMapOperationalDispatchResult,
  type PatchMapOperationalEvent,
  type PatchMapOperationalEventInput,
  type PatchMapOperationsRevisionStamp,
  type PatchMapRuntimeDiagnosticsSnapshot,
  type PatchMapSanitizedDiagnostic,
} from './contracts';

export const DEFAULT_DIAGNOSTIC_CAPACITY = 100;
const MAX_DIAGNOSTIC_CAPACITY = 100;
const EMPTY_REVISION_STAMP = Object.freeze({
  lifecycleGeneration: 0,
  sceneRevision: 0,
  viewRevision: 0,
  interactionRevision: 0,
});
export const DISABLED_RUNTIME_DIAGNOSTICS: PatchMapRuntimeDiagnosticsSnapshot = Object.freeze({
  revision: PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION,
  enabled: false,
  capacity: 0,
  records: Object.freeze([]),
  current: null,
});

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

export function telemetryFromDiagnostic(
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

export function emptyDispatchResult(): PatchMapOperationalDispatchResult {
  return Object.freeze({
    deliveredCount: 0,
    callbackFailureCount: 0,
    queuedActionCount: 0,
    queuedActionFailureCount: 0,
  });
}

export function normalizeRevisionStamp(
  value: PatchMapOperationsRevisionStamp,
): PatchMapOperationsRevisionStamp {
  return Object.freeze({
    lifecycleGeneration: nonNegativeCount(value.lifecycleGeneration),
    sceneRevision: nonNegativeCount(value.sceneRevision),
    viewRevision: nonNegativeCount(value.viewRevision),
    interactionRevision: nonNegativeCount(value.interactionRevision),
  });
}

export function normalizeCountRecord<T extends Readonly<Record<string, number>>>(
  input: T,
): T {
  const output: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    output[controlledValue(key, 'count')] = nonNegativeCount(input[key] ?? 0);
  }
  return Object.freeze(output) as T;
}

export function normalizeCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIAGNOSTIC_CAPACITY) {
    throw new RangeError(`PatchMap diagnostic capacity must be between 1 and ${MAX_DIAGNOSTIC_CAPACITY}`);
  }
  return value;
}

export function normalizeDigest(value: string | null): string | null {
  if (value === null) return null;
  return /^[a-f0-9]{64}$/u.test(value) ? value : `hash:${boundedHash(value)}`;
}

export function controlledValue(value: string, fallback: string): string {
  return /^[A-Za-z0-9_.:/-]{1,128}$/u.test(value) ? value : fallback;
}

function nonNegativeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return value;
}

export function boundedHash(value: unknown): string {
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

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
