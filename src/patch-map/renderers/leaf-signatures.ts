import type { PatchMapTextProjection } from '../contracts';
import {
  RenderAlign,
  type RenderStoreView,
} from '../dense/renderer-types';
import type {
  PatchMapTextRenderRoute,
  PatchMapTextRenderStyle,
} from '../semantic/text-render-route';
import type {
  PatchMapTextAttachedSignatures,
  PatchMapTextRendererProbe,
  PatchMapTextSemanticSignatures,
} from './types';

export function textSemanticSignatures(
  store: RenderStoreView,
  slot: number,
  projection: PatchMapTextProjection | null,
): PatchMapTextSemanticSignatures {
  if (projection !== null) {
    return freezeTextSemanticSignatures({
      content: projection.contentSignature,
      style: projection.styleSignature,
      layout: projection.layoutSignature,
    });
  }
  const text = store.text[slot] ?? '';
  const style = [
    store.fontFamily[slot] || 'Arial',
    store.fontSize[slot] ?? 16,
    store.fontWeight[slot] ?? 400,
    store.align[slot] ?? RenderAlign.Left,
  ];
  return freezeTextSemanticSignatures({
    content: stableSerializeLeafValue(['dense-text-content/v1', text]),
    style: stableSerializeLeafValue(['dense-text-style/v1', ...style]),
    layout: stableSerializeLeafValue([
      'dense-text-layout/v1',
      text,
      ...style,
      store.width[slot] ?? 0,
      store.height[slot] ?? 0,
    ]),
  });
}

export function textRendererSignature(
  route: PatchMapTextRenderRoute,
  atlasId: string | null,
  text: string,
  style: PatchMapTextRenderStyle,
  align: 'left' | 'center' | 'right',
  authoredStyle: PatchMapTextProjection['authoredStyle'] | null,
  packedColor: number,
  alpha: number,
): string {
  return stableSerializeLeafValue({
    revision: 'core-v2-text-renderer/1',
    route,
    atlasId,
    text,
    style,
    align,
    authoredStyle,
    paint: { packedColor, alpha },
  });
}

export function freezeTextSemanticSignatures(
  signatures: PatchMapTextSemanticSignatures,
): PatchMapTextSemanticSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
  });
}

export function freezeTextAttachedSignatures(
  semantic: PatchMapTextSemanticSignatures,
  renderer: string,
): PatchMapTextAttachedSignatures {
  return Object.freeze({
    content: semantic.content,
    style: semantic.style,
    layout: semantic.layout,
    renderer,
  });
}

export function sameTextAttachedSignatures(
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

export function freezeTextRendererProbe(
  probe: PatchMapTextRendererProbe,
): PatchMapTextRendererProbe {
  return Object.freeze({
    ...probe,
    semanticSignatures: freezeTextSemanticSignatures(probe.semanticSignatures),
    attachedSignatures: probe.attachedSignatures === null
      ? null
      : freezeTextAttachedSignatures(probe.attachedSignatures, probe.attachedSignatures.renderer),
    lastRenderedSignatures: probe.lastRenderedSignatures === null
      ? null
      : freezeTextAttachedSignatures(
          probe.lastRenderedSignatures,
          probe.lastRenderedSignatures.renderer,
        ),
  });
}

export function stableSerializeLeafValue(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeLeafValue).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerializeLeafValue(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('asset descriptor must contain JSON values');
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
