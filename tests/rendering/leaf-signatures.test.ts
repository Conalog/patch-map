import { describe, expect, it } from 'vitest';

import type { PatchMapTextProjection } from '../../src/parsing/contracts';
import {
  RenderAlign,
  type RenderStoreView,
} from '../../src/dense/renderer-types';
import {
  freezeTextAttachedSignatures,
  freezeTextRendererProbe,
  sameTextAttachedSignatures,
  stableSerializeLeafValue,
  textRendererSignature,
  textSemanticSignatures,
} from '../../src/rendering/leaf-signatures';
import type { PatchMapTextRenderStyle } from '../../src/semantic/text-render-route';

describe('PatchMap leaf render signatures', () => {
  it('serializes JSON records by stable key order and rejects non-JSON objects', () => {
    expect(stableSerializeLeafValue({ z: 1, a: [true, null, 'x'] })).toBe(
      '{"a":[true,null,"x"],"z":1}',
    );
    expect(stableSerializeLeafValue({ a: [true, null, 'x'], z: 1 })).toBe(
      '{"a":[true,null,"x"],"z":1}',
    );
    expect(() => stableSerializeLeafValue(new Date(0))).toThrow(
      'asset descriptor must contain JSON values',
    );
  });

  it('uses semantic projection signatures or deterministic dense fallbacks', () => {
    const store = {
      text: ['A'],
      fontFamily: [''],
      fontSize: [14],
      fontWeight: [500],
      align: [RenderAlign.Center],
      width: [80],
      height: [24],
    } as unknown as RenderStoreView;
    const dense = textSemanticSignatures(store, 0, null);
    const projected = textSemanticSignatures(store, 0, {
      contentSignature: 'content',
      styleSignature: 'style',
      layoutSignature: 'layout',
    } as PatchMapTextProjection);

    expect(dense).toEqual({
      content: '["dense-text-content/v1","A"]',
      style: '["dense-text-style/v1","Arial",14,500,1]',
      layout: '["dense-text-layout/v1","A","Arial",14,500,1,80,24]',
    });
    expect(projected).toEqual({ content: 'content', style: 'style', layout: 'layout' });
    expect(Object.isFrozen(dense)).toBe(true);
    expect(Object.isFrozen(projected)).toBe(true);
  });

  it('freezes attached publication snapshots and compares their exact renderer identity', () => {
    const semantic = Object.freeze({ content: 'c', style: 's', layout: 'l' });
    const attached = freezeTextAttachedSignatures(semantic, 'renderer-a');
    const equivalent = freezeTextAttachedSignatures(semantic, 'renderer-a');
    const different = freezeTextAttachedSignatures(semantic, 'renderer-b');
    const probe = freezeTextRendererProbe({
      entityId: 'label',
      attachedRoute: 'pixi-text',
      objectKind: 'pixi-text',
      routeDecisionReason: 'atlas-coverage-unproven',
      objectCount: 1,
      semanticSignatures: semantic,
      attachedSignatures: attached,
      lastRenderedSignatures: attached,
      publicationStatus: 'current',
      lastRenderedFrame: 7,
      staleGlyphCount: 0,
    });

    expect(sameTextAttachedSignatures(attached, equivalent)).toBe(true);
    expect(sameTextAttachedSignatures(attached, different)).toBe(false);
    expect(sameTextAttachedSignatures(null, null)).toBe(true);
    expect(Object.isFrozen(probe)).toBe(true);
    expect(Object.isFrozen(probe.semanticSignatures)).toBe(true);
    expect(Object.isFrozen(probe.attachedSignatures)).toBe(true);
    expect(probe.attachedSignatures).not.toBe(attached);
  });

  it('keeps renderer signatures stable across authored record key order', () => {
    const style: PatchMapTextRenderStyle = Object.freeze({
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 400,
      fontStyle: 'normal',
      lineHeight: 20,
      letterSpacing: 0,
      advancedFeatures: Object.freeze(['stroke']),
    });
    const left = textRendererSignature(
      'pixi-text',
      null,
      'label',
      style,
      'left',
      { strokeWidth: 2, stroke: '#fff' },
      0xffffffff,
      1,
    );
    const right = textRendererSignature(
      'pixi-text',
      null,
      'label',
      style,
      'left',
      { stroke: '#fff', strokeWidth: 2 },
      0xffffffff,
      1,
    );

    expect(left).toBe(right);
  });

  it('attaches justify to the exact dense and renderer signatures', () => {
    const store = {
      text: ['A B\nC D'],
      fontFamily: ['FiraCode'],
      fontSize: [16],
      fontWeight: [400],
      align: [RenderAlign.Justify],
      width: [80],
      height: [40],
    } as unknown as RenderStoreView;
    const dense = textSemanticSignatures(store, 0, null);
    const style: PatchMapTextRenderStyle = Object.freeze({
      fontFamily: 'FiraCode',
      fontSize: 16,
      fontWeight: 400,
      fontStyle: 'normal',
      lineHeight: 20,
      letterSpacing: 0,
      advancedFeatures: Object.freeze(['align:justify']),
    });
    const renderer = textRendererSignature(
      'pixi-text',
      null,
      'A B\nC D',
      style,
      'justify',
      { align: 'justify' },
      0xffffffff,
      1,
    );

    expect(dense.style).toContain(',3]');
    expect(renderer).toContain('"align":"justify"');
  });
});
