import type { PatchMapResolvedPresentationPolicy } from '../../presentation-policy';
import type {
  PatchMapTextAttachedSignatures,
  PatchMapTextRendererProbe,
  PatchMapTextSemanticSignatures,
} from '../types';

export function normalizePresentationPolicy(
  policy: PatchMapResolvedPresentationPolicy,
): PatchMapResolvedPresentationPolicy {
  if (!Number.isSafeInteger(policy.revision) || policy.revision < 1) {
    throw new RangeError('presentation policy revision must be a positive safe integer');
  }
  if (
    !Number.isFinite(policy.deEmphasisAlpha) ||
    policy.deEmphasisAlpha < 0 ||
    policy.deEmphasisAlpha > 1
  ) {
    throw new RangeError('presentation deEmphasisAlpha must be between zero and one');
  }
  return Object.freeze({
    revision: policy.revision,
    highlightedEntityIds: policy.highlightedEntityIds === null
      ? null
      : freezePresentationIds(policy.highlightedEntityIds, 'highlightedEntityIds'),
    deEmphasisAlpha: policy.deEmphasisAlpha,
    hiddenEntityIds: freezePresentationIds(policy.hiddenEntityIds, 'hiddenEntityIds'),
    fillOverrides: freezePresentationFillOverrides(policy.fillOverrides),
  });
}

export function samePresentationPolicy(
  left: PatchMapResolvedPresentationPolicy | null,
  right: PatchMapResolvedPresentationPolicy | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return left.revision === right.revision &&
    left.deEmphasisAlpha === right.deEmphasisAlpha &&
    sameOptionalStringArray(left.highlightedEntityIds, right.highlightedEntityIds) &&
    sameOrderedStrings(left.hiddenEntityIds, right.hiddenEntityIds) &&
    samePresentationFillOverrides(left.fillOverrides, right.fillOverrides);
}

export function freezeRendererTextSemanticSignatures(
  signatures: PatchMapTextSemanticSignatures,
): PatchMapTextSemanticSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
  });
}

export function freezeRendererTextProbe(
  probe: PatchMapTextRendererProbe,
): PatchMapTextRendererProbe {
  return Object.freeze({
    ...probe,
    semanticSignatures: freezeRendererTextSemanticSignatures(probe.semanticSignatures),
    attachedSignatures: probe.attachedSignatures === null
      ? null
      : freezeRendererTextAttachedSignatures(probe.attachedSignatures),
    lastRenderedSignatures: probe.lastRenderedSignatures === null
      ? null
      : freezeRendererTextAttachedSignatures(probe.lastRenderedSignatures),
  });
}

export function sameRendererTextSemanticSignatures(
  semantic: PatchMapTextSemanticSignatures,
  attached: PatchMapTextAttachedSignatures | null,
): boolean {
  return attached !== null &&
    semantic.content === attached.content &&
    semantic.style === attached.style &&
    semantic.layout === attached.layout;
}

export function sameRendererTextAttachedSignatures(
  left: PatchMapTextAttachedSignatures | null,
  right: PatchMapTextAttachedSignatures | null,
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.content === right.content &&
    left.style === right.style &&
    left.layout === right.layout &&
    left.renderer === right.renderer
  );
}

function freezePresentationFillOverrides(
  values: PatchMapResolvedPresentationPolicy['fillOverrides'],
): PatchMapResolvedPresentationPolicy['fillOverrides'] {
  if (!Array.isArray(values as unknown)) {
    throw new TypeError('fillOverrides must be an array');
  }
  const seen = new Set<string>();
  return Object.freeze(values.map((value, index) => {
    if (value === null || typeof value !== 'object') {
      throw new TypeError(`fillOverrides[${index}] must be an object`);
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
      throw new TypeError(`fillOverrides[${index}].id must be a non-empty string`);
    }
    if (seen.has(value.id)) {
      throw new RangeError(`fillOverrides contains duplicate id ${value.id}`);
    }
    if (
      !Number.isSafeInteger(value.packedColor) ||
      value.packedColor < 0 ||
      value.packedColor > 0xffffffff
    ) {
      throw new RangeError(
        `fillOverrides[${index}].packedColor must be a packed RGBA integer`,
      );
    }
    seen.add(value.id);
    return Object.freeze({ id: value.id, packedColor: value.packedColor >>> 0 });
  }).sort((left, right) => left.id.localeCompare(right.id)));
}

function freezePresentationIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const result = values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  });
  return Object.freeze([...new Set(result)].sort());
}

function samePresentationFillOverrides(
  left: PatchMapResolvedPresentationPolicy['fillOverrides'],
  right: PatchMapResolvedPresentationPolicy['fillOverrides'],
): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.id === right[index]?.id && value.packedColor === right[index]?.packedColor
  );
}

function sameOptionalStringArray(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  return left === null || right === null
    ? left === right
    : sameOrderedStrings(left, right);
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeRendererTextAttachedSignatures(
  signatures: PatchMapTextAttachedSignatures,
): PatchMapTextAttachedSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
    renderer: signatures.renderer,
  });
}
