import type { ParsePatchMapResult } from '../contracts';
import type { PatchMapAffineMatrix } from '../semantic/geometry';
import type { RootFragment } from './contracts';

export interface StableParseIndexes {
  readonly entityById: ReadonlyMap<string, number>;
  readonly elementByPath: ReadonlyMap<string, number>;
  readonly componentByPath: ReadonlyMap<string, number>;
}

export const ROOT_FRAGMENTS_CACHE = new WeakMap<
  ParsePatchMapResult,
  readonly RootFragment[]
>();
export const STABLE_PARSE_INDEX_CACHE = new WeakMap<
  ParsePatchMapResult,
  StableParseIndexes
>();
export const DIRECT_ANGLE_LOCAL_AFFINE_CACHE = new WeakMap<
  ParsePatchMapResult,
  Map<string, PatchMapAffineMatrix>
>();
export const STRUCTURAL_CHANGED_ENTITY_IDS_CACHE = new WeakMap<
  ParsePatchMapResult,
  readonly string[]
>();

/** Exact projection membership/value delta retained by a structural parse. */
export function patchMapStructuralChangedEntityIds(
  parsed: ParsePatchMapResult,
): readonly string[] | null {
  return STRUCTURAL_CHANGED_ENTITY_IDS_CACHE.get(parsed) ?? null;
}

export function stableParseIndexes(previous: ParsePatchMapResult): StableParseIndexes | null {
  const cached = STABLE_PARSE_INDEX_CACHE.get(previous);
  if (cached !== undefined) return cached;
  const entityById = uniqueIndex(previous.document.entities, ({ id }) => id);
  const elementByPath = uniqueIndex(previous.identity.elements, ({ sourcePath }) => sourcePath);
  const componentByPath = uniqueIndex(
    previous.identity.components,
    ({ componentPath }) => componentPath,
  );
  if (entityById === null || elementByPath === null || componentByPath === null) {
    return null;
  }
  const indexes = Object.freeze({
    entityById,
    elementByPath,
    componentByPath,
  });
  STABLE_PARSE_INDEX_CACHE.set(previous, indexes);
  return indexes;
}

function uniqueIndex<Value>(
  values: readonly Value[],
  keyFor: (value: Value) => string,
): ReadonlyMap<string, number> | null {
  const result = new Map<string, number>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) return null;
    const key = keyFor(value);
    if (result.has(key)) return null;
    result.set(key, index);
  }
  return result;
}
