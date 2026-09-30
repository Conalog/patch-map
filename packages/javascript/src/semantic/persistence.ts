import {
  materializePatchMapDataset,
  validatePatchMapDatasetReferences,
} from './dataset';
import { isPlainRecord } from '../shared/plain-record';

export type PatchMapPersistenceDiagnosticCode =
  | 'INVALID_EXPORT_ROOT'
  | 'NON_SERIALIZABLE_VALUE';

/** A rejected dataset serialization. No persistence write has occurred. */
export class PatchMapPersistenceError extends Error {
  public readonly category = 'INVALID_INPUT' as const;
  public readonly code: PatchMapPersistenceDiagnosticCode;
  public readonly datasetPath: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount = 0;
  public readonly unchangedCount = 0;

  public constructor(
    code: PatchMapPersistenceDiagnosticCode,
    datasetPath: string,
    detail: string,
  ) {
    super(`${code} at ${datasetPath}: ${detail}`);
    this.name = 'PatchMapPersistenceError';
    this.code = code;
    this.datasetPath = datasetPath;
  }
}

/**
 * Validate and serialize a detached canonical dataset without performing a
 * write. Strict mode also rejects dangling semantic references.
 */
export function serializePatchMapDataset(
  input: unknown,
  options: Readonly<{ strictReferences?: boolean }> = {},
): string {
  if (!Array.isArray(input)) {
    persistenceFail(
      'INVALID_EXPORT_ROOT',
      '$',
      'persisted PatchMap data must use an array root',
    );
  }
  const detached = cloneSerializableArray(input, '$');
  const materialization = materializePatchMapDataset(detached);
  if (options.strictReferences !== false) {
    validatePatchMapDatasetReferences(materialization.dataset);
  }
  return JSON.stringify(materialization.dataset);
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
    if (!Number.isFinite(value)) persistenceFail(
      'NON_SERIALIZABLE_VALUE',
      path,
      'number must be finite',
    );
    return value;
  }
  if (typeof value !== 'object') {
    persistenceFail(
      'NON_SERIALIZABLE_VALUE',
      path,
      `unsupported ${typeof value} value`,
    );
  }
  if (ancestors.has(value)) {
    persistenceFail('NON_SERIALIZABLE_VALUE', path, 'cyclic values are not serializable');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          persistenceFail(
            'NON_SERIALIZABLE_VALUE',
            `${path}[${index}]`,
            'array holes are not serializable',
          );
        }
        clone.push(cloneSerializable(value[index], `${path}[${index}]`, ancestors));
      }
      return Object.freeze(clone);
    }
    if (!isPlainRecord(value)) {
      persistenceFail(
        'NON_SERIALIZABLE_VALUE',
        path,
        'value must be a plain JSON object or array',
      );
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      persistenceFail(
        'NON_SERIALIZABLE_VALUE',
        path,
        'symbol-keyed properties are not serializable',
      );
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !('value' in descriptor)) {
        persistenceFail(
          'NON_SERIALIZABLE_VALUE',
          `${path}.${key}`,
          'accessor properties are not serializable',
        );
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

function persistenceFail(
  code: PatchMapPersistenceDiagnosticCode,
  path: string,
  detail: string,
): never {
  throw new PatchMapPersistenceError(code, path, detail);
}
