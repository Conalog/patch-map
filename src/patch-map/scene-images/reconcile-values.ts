import { normalizePatchMapAssetDescriptor } from '../assets';
import type {
  PatchMapImageProjection,
  PatchMapImageSourceKind,
  PatchMapProjectionIndex,
} from '../contracts';
import type { PatchMapAssetSource } from '../semantic/dataset';
import type {
  PatchMapSceneImageAssetBindingRequest as LeafAssetBindingRequest,
  PatchMapSceneImageReconcileResult,
} from './contracts';

export interface DesiredImage {
  readonly projection: PatchMapImageProjection;
  readonly request: LeafAssetBindingRequest;
  readonly requestSignature: string;
  readonly signature: string;
  readonly active: boolean;
}

interface RetainedImageTarget {
  readonly signature: string;
  readonly active: boolean;
}

interface RetainedImageBinding {
  readonly key: string;
  readonly requestSignature: string;
  readonly consumers: ReadonlyMap<string, number>;
}

export const EMPTY_RECONCILE_RESULT: PatchMapSceneImageReconcileResult = Object.freeze({
  added: Object.freeze([]),
  updated: Object.freeze([]),
  removed: Object.freeze([]),
  activated: Object.freeze([]),
  deactivated: Object.freeze([]),
  bindingsStarted: Object.freeze([]),
  bindingsRetired: Object.freeze([]),
});

export function normalizeDesiredImages(
  index: PatchMapProjectionIndex,
  activeEntityIds: ReadonlySet<string> | undefined,
): ReadonlyMap<string, DesiredImage> {
  const result = new Map<string, DesiredImage>();
  const bindingSignatures = new Map<string, string>();
  const images = index.imagesByEntityId;
  for (const entityId of Object.keys(images).sort()) {
    const projection = cloneProjection(entityId, images[entityId]!);
    const request = requestFor(projection);
    const requestSignature = stableSerialize(request);
    const previous = bindingSignatures.get(projection.bindingKey);
    if (previous !== undefined && previous !== requestSignature) {
      throw new TypeError(`image binding key collision: ${projection.bindingKey}`);
    }
    bindingSignatures.set(projection.bindingKey, requestSignature);
    const active = activeEntityIds?.has(entityId) ?? true;
    result.set(entityId, Object.freeze({
      projection,
      request,
      requestSignature,
      signature: [
        projection.bindingKey,
        requestSignature,
        projection.dimensionMode,
        projection.authoredSize ? 'authored-size' : 'derived-size',
      ].join('|'),
      active,
    }));
  }
  return result;
}

export function desiredActiveBindingSignatures(
  desired: ReadonlyMap<string, DesiredImage>,
): ReadonlyMap<string, string> {
  const signatures = new Map<string, string>();
  for (const image of desired.values()) {
    if (image.active) signatures.set(image.projection.bindingKey, image.requestSignature);
  }
  return signatures;
}

export function countActiveDesiredImages(desired: ReadonlyMap<string, DesiredImage>): number {
  let count = 0;
  for (const image of desired.values()) {
    if (image.active) count += 1;
  }
  return count;
}

/**
 * A retained binding is the only existing ownership that can survive the
 * detach pass. Validating it here keeps the commit phase free of collision
 * discovery after target mutation has started.
 */
export function assertPreparedBindingCompatibility(
  desired: ReadonlyMap<string, DesiredImage>,
  targets: ReadonlyMap<string, RetainedImageTarget>,
  bindings: ReadonlyMap<string, RetainedImageBinding>,
): void {
  const retainedBindingSignatures = new Map<string, string>();
  for (const binding of bindings.values()) {
    for (const consumerId of binding.consumers.keys()) {
      const target = targets.get(consumerId);
      const next = desired.get(consumerId);
      if (
        target &&
        next &&
        target.signature === next.signature &&
        target.active === next.active
      ) {
        retainedBindingSignatures.set(binding.key, binding.requestSignature);
        break;
      }
    }
  }
  for (const image of desired.values()) {
    if (!image.active) continue;
    const retainedSignature = retainedBindingSignatures.get(image.projection.bindingKey);
    if (retainedSignature !== undefined && retainedSignature !== image.requestSignature) {
      throw new TypeError(`image binding key collision: ${image.projection.bindingKey}`);
    }
  }
}

export function freezeReconcileResult(
  value: Omit<PatchMapSceneImageReconcileResult, never>,
): PatchMapSceneImageReconcileResult {
  return Object.freeze({
    added: Object.freeze(value.added),
    updated: Object.freeze(value.updated),
    removed: Object.freeze(value.removed),
    activated: Object.freeze(value.activated),
    deactivated: Object.freeze(value.deactivated),
    bindingsStarted: Object.freeze(value.bindingsStarted),
    bindingsRetired: Object.freeze(value.bindingsRetired),
  });
}

export function reconcileChanged(result: PatchMapSceneImageReconcileResult): boolean {
  return result.added.length > 0 ||
    result.updated.length > 0 ||
    result.removed.length > 0 ||
    result.activated.length > 0 ||
    result.deactivated.length > 0 ||
    result.bindingsStarted.length > 0 ||
    result.bindingsRetired.length > 0;
}

function cloneProjection(entityId: string, value: PatchMapImageProjection): PatchMapImageProjection {
  if (value.entityId !== entityId) throw new TypeError(`image projection identity mismatch: ${entityId}`);
  const bindingKey = nonempty(value.bindingKey, 'image binding key');
  const cacheIdentity = nonempty(value.cacheIdentity, 'image cache identity');
  const authoredSource = value.sourceKind === 'descriptor'
    ? normalizePatchMapAssetDescriptor(value.authoredSource)
    : nonemptyStringSource(value.authoredSource, value.sourceKind);
  return Object.freeze({
    entityId,
    authoredSource,
    bindingKey,
    cacheIdentity,
    sourceKind: value.sourceKind,
    authoredSize: value.authoredSize,
    dimensionMode: value.dimensionMode,
  });
}

function nonemptyStringSource(
  source: PatchMapAssetSource,
  kind: Exclude<PatchMapImageSourceKind, 'descriptor'>,
): string {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError(`${kind} image source must be a non-empty string`);
  }
  return source;
}

function requestFor(projection: PatchMapImageProjection): LeafAssetBindingRequest {
  if (projection.sourceKind === 'alias') {
    if (typeof projection.authoredSource !== 'string') {
      throw new TypeError('alias image source must be a string');
    }
    return Object.freeze({ kind: 'alias', alias: projection.authoredSource });
  }
  return Object.freeze({ kind: 'source', source: projection.authoredSource });
}

function nonempty(value: string, label: string): string {
  if (value.length === 0) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map(
    (key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  ).join(',')}}`;
}
