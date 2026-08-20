import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import type {
  PatchMapLogicalPresentationLayerInput,
  PatchMapPresentationLayerChange,
} from '../presentation-layers';
import type {
  PatchMapPresentationApi,
  PatchMapPresentationLayer,
  PatchMapPresentationPaint,
  PatchMapPresentationSetResult,
  PatchMapPresentationTargetsInput,
  PatchMapTarget,
  PatchMapTargetSet,
} from './contracts';

interface PresentationTargetSetAuthority {
  readonly logical: readonly PatchMapLogicalTargetSnapshot[];
  readonly logicalByKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>;
}

export interface PatchMapPresentationDeveloperHost {
  setPresentationLayer(
    input: PatchMapLogicalPresentationLayerInput,
  ): PatchMapPresentationLayerChange;
  clearPresentationLayer(key: string): PatchMapPresentationLayerChange;
}

export interface PatchMapPresentationDeveloperDependencies {
  targetSetAuthority(targets: PatchMapTargetSet): PresentationTargetSetAuthority;
}

export function createPatchMapPresentationApi(
  host: PatchMapPresentationDeveloperHost,
  dependencies: PatchMapPresentationDeveloperDependencies,
): PatchMapPresentationApi {
  return Object.freeze({
    set(keyInput: string, layerInput: PatchMapPresentationLayer): PatchMapPresentationSetResult {
      const key = nonEmptyString(keyInput, 'presentation key');
      const layer = exactRecord(layerInput, ['scope', 'targets', 'matched', 'unmatched'], 'layer');
      const scopeValue = dataProperty(layer, 'scope', 'layer');
      const targetsValue = dataProperty(layer, 'targets', 'layer');
      const matchedValue = dataProperty(layer, 'matched', 'layer');
      const unmatchedValue = dataProperty(layer, 'unmatched', 'layer');
      if (scopeValue === undefined) throw new TypeError('layer.scope is required');
      if (targetsValue === undefined) throw new TypeError('layer.targets is required');
      if (matchedValue === undefined && unmatchedValue === undefined) {
        throw new TypeError('layer requires matched or unmatched paint');
      }
      const scope = dependencies.targetSetAuthority(scopeValue as PatchMapTargetSet);
      const requested = normalizeRequestedTargets(
        targetsValue as PatchMapPresentationTargetsInput,
        dependencies,
      );
      const matched: PatchMapLogicalTargetSnapshot[] = [];
      let ignoredTargetCount = 0;
      for (const targetKey of requested.keys) {
        const target = scope.logicalByKey.get(targetKey);
        if (target === undefined) ignoredTargetCount += 1;
        else matched.push(target);
      }
      const matchedPaint = normalizePaint(matchedValue, 'layer.matched');
      const unmatchedPaint = normalizePaint(unmatchedValue, 'layer.unmatched');
      const change = host.setPresentationLayer(Object.freeze({
        key,
        scopeToken: scopeValue as object,
        scope: scope.logical,
        matched: Object.freeze(matched),
        matchedAlphaMultiplier: matchedPaint?.alphaMultiplier ?? 1,
        unmatchedAlphaMultiplier: unmatchedPaint?.alphaMultiplier ?? 1,
      }));
      return Object.freeze({
        changed: change.changed,
        revision: change.revision,
        scopeCount: scope.logical.length,
        targetCount: requested.keys.length,
        matchedCount: matched.length,
        unmatchedCount: scope.logical.length - matched.length,
        ignoredTargetCount,
      });
    },
    clear(keyInput: string): boolean {
      const key = nonEmptyString(keyInput, 'presentation key');
      return host.clearPresentationLayer(key).changed;
    },
  });
}

function normalizeRequestedTargets(
  input: PatchMapPresentationTargetsInput,
  dependencies: PatchMapPresentationDeveloperDependencies,
): Readonly<{ readonly keys: readonly string[] }> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    try {
      const authority = dependencies.targetSetAuthority(input as PatchMapTargetSet);
      return Object.freeze({
        keys: Object.freeze([...new Set(authority.logical.map(({ key }) => key))]),
      });
    } catch (error) {
      if (looksLikeTargetSet(input)) throw error;
    }
  }
  const values = Array.isArray(input) ? detachedArray(input, 'layer.targets') : [input];
  if (values.length === 0) return Object.freeze({ keys: Object.freeze([]) });
  const firstKind = typeof values[0];
  if (firstKind !== 'string' && firstKind !== 'object') {
    throw new TypeError('layer.targets must contain strings or PatchMapTarget objects');
  }
  if (values.some((value) => typeof value !== firstKind || value === null)) {
    throw new TypeError('layer.targets cannot mix strings and PatchMapTarget objects');
  }

  const keys = new Set<string>();
  if (firstKind === 'string') {
    values.forEach((value, index) => {
      const id = nonEmptyString(value as string, `layer.targets[${index}]`);
      keys.add(`element:${id}`);
    });
  } else {
    values.forEach((value, index) => {
      const target = normalizeTarget(value, `layer.targets[${index}]`);
      keys.add(target.componentId === undefined
        ? `element:${target.id}`
        : `component:${target.id}/${target.componentId}`);
    });
  }

  return Object.freeze({ keys: Object.freeze([...keys]) });
}

function normalizeTarget(value: unknown, path: string): PatchMapTarget {
  const record = exactRecord(value, ['id', 'componentId'], path);
  const id = nonEmptyString(dataProperty(record, 'id', path), `${path}.id`);
  const componentIdValue = dataProperty(record, 'componentId', path);
  if (componentIdValue === undefined) return Object.freeze({ id });
  return Object.freeze({
    id,
    componentId: nonEmptyString(componentIdValue, `${path}.componentId`),
  });
}

function normalizePaint(value: unknown, path: string): PatchMapPresentationPaint | null {
  if (value === undefined) return null;
  const record = exactRecord(value, ['alphaMultiplier'], path);
  const alphaMultiplier = dataProperty(record, 'alphaMultiplier', path);
  if (typeof alphaMultiplier !== 'number' || !Number.isFinite(alphaMultiplier)) {
    throw new TypeError(`${path}.alphaMultiplier must be a finite number`);
  }
  if (alphaMultiplier < 0 || alphaMultiplier > 1) {
    throw new RangeError(`${path}.alphaMultiplier must be between zero and one`);
  }
  return Object.freeze({ alphaMultiplier });
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${path} contains an unknown field`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${path}.${key} must be an enumerable data property`);
    }
  }
  return value as Readonly<Record<string, unknown>>;
}

function dataProperty(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor)) {
    throw new TypeError(`${path}.${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function detachedArray(value: readonly unknown[], path: string): readonly unknown[] {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) {
    throw new TypeError(`${path}.length must be a data property`);
  }
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(`${path}.length must be a non-negative safe integer`);
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${path}[${index}] must be an enumerable data property`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function looksLikeTargetSet(value: object): boolean {
  return Reflect.ownKeys(value).some((key) => key === 'matches' || key === 'count');
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}
