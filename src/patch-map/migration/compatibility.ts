import {
  materializePatchMapDataset,
  validatePatchMapDatasetReferences,
  type PatchMapDatasetMaterialization,
} from '../semantic/dataset';
import {
  PATCH_MAP_MIGRATION_REVISION,
  PatchMapMigrationError,
  type PatchMapCompatibilityMaterialization,
  type PatchMapPersistenceExport,
} from './contracts';

const LEGACY_ROOT_FIELDS = new Set([
  'kind',
  'id',
  'x',
  'y',
  'width',
  'height',
  'label',
]);

/**
 * Compatibility boundary for the approved PATCH MAP profile. Canonical
 * arrays still go through the strict materializer. The only legacy object
 * admitted is the pinned generic-item shape; out-of-profile objects fail with
 * an exact path instead of being guessed or silently dropped.
 */
export function materializePatchMapCompatibilityDataset(
  input: unknown,
): PatchMapCompatibilityMaterialization {
  if (Array.isArray(input)) {
    const canonicalDataset = cloneSerializableArray(input, '$');
    const materialization = materializePatchMapDataset(canonicalDataset);
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
  const materialization = materializePatchMapDataset(canonicalDataset);
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
export function preparePatchMapPersistenceExport(
  input: unknown,
  options: Readonly<{ strictReferences?: boolean }> = {},
): PatchMapPersistenceExport {
  if (!Array.isArray(input)) {
    throw new PatchMapMigrationError(
      'INVALID_EXPORT_ROOT',
      '$',
      'persisted PatchMap data must use the unversioned array root',
    );
  }
  const detached = cloneSerializableArray(input, '$');
  const materialization = materializePatchMapDataset(detached);
  if (options.strictReferences !== false) {
    validatePatchMapDatasetReferences(materialization.dataset);
  }
  const serialized = JSON.stringify(materialization.dataset);
  return Object.freeze({
    revision: PATCH_MAP_MIGRATION_REVISION,
    rootKind: 'array',
    dataset: materialization.dataset,
    serialized,
    semanticHash: materialization.semanticHash,
  });
}

export function assertPatchMapSemanticRoundtrip(
  before: Readonly<{ semanticHash: string }>,
  after: Readonly<{ semanticHash: string }>,
): void {
  if (
    typeof before.semanticHash !== 'string' ||
    typeof after.semanticHash !== 'string' ||
    before.semanticHash !== after.semanticHash
  ) {
    throw new PatchMapMigrationError(
      'SEMANTIC_MISMATCH',
      '$',
      'persistence roundtrip changed the canonical semantic hash',
    );
  }
}

function freezeCompatibilityResult(
  sourceKind: PatchMapCompatibilityMaterialization['sourceKind'],
  canonicalDataset: readonly unknown[],
  materialization: PatchMapDatasetMaterialization,
): PatchMapCompatibilityMaterialization {
  return Object.freeze({
    revision: PATCH_MAP_MIGRATION_REVISION,
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
  throw new PatchMapMigrationError('INVALID_LEGACY_ROOT', path, detail);
}

function serializableFail(path: string, detail: string): never {
  throw new PatchMapMigrationError('NON_SERIALIZABLE_VALUE', path, detail);
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
