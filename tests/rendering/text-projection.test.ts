import { readFileSync } from 'node:fs';

import catalogProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { createPatchMapRenderTextSpecimens } from '../../lab/contract/render-text-fixtures';
import { parsePatchMap } from '../../src/patch-map/parser';
import {
  materializePatchMapDataset,
  type PatchMapDatasetError,
} from '../../src/patch-map/semantic/dataset';

describe('PatchMap deterministic text projection', () => {
  it('keeps component text on one semantic-layout pass followed by signature-safe relocation', () => {
    const componentSource = readFileSync(
      new URL('../../src/patch-map/parser/component-text-lowering.ts', import.meta.url),
      'utf8',
    );
    const branchStart = componentSource.indexOf("  if (type === 'text') {");
    const branchEnd = componentSource.indexOf('\n  warn(\n', branchStart);
    const componentTextBranch = componentSource.slice(branchStart, branchEnd);

    expect(branchStart).toBeGreaterThanOrEqual(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(componentTextBranch.match(/\bsemanticTextLayout\(/gu)).toHaveLength(1);
    expect(componentTextBranch.match(/\brelocatePatchMapTextLayout\(/gu)).toHaveLength(1);
  });

  it('keeps the standalone authored frame separate from natural geometry and affine inputs', () => {
    const input = catalogProfiles.datasets['standalone-text'];
    const before = structuredClone(input);
    const parsed = parsePatchMap(materializePatchMapDataset(input).dataset);
    const text = parsed.projection.textsByEntityId?.text;
    const entity = parsed.document.entities.find(({ id }) => id === 'text');
    const geometry = parsed.projection.byEntityId.text;

    expect(input).toEqual(before);
    expect(text).toMatchObject({
      entityId: 'text',
      targetKind: 'element',
      source: 'A\r\n中😀é',
      layoutSource: 'A\n中😀é',
      contentFrame: { width: 100, height: 60 },
      naturalLayoutBounds: { x: 0, y: 0, width: 40, height: 40 },
      layoutBounds: { x: 0, y: 0, width: 40, height: 40 },
      ownerLocalBounds: { x: 0, y: 0, width: 40, height: 40 },
      lines: ['A', '中😀é'],
      placement: null,
      contentOrientation: 'follow-item',
    });
    expect(entity).toMatchObject({
      kind: 'text',
      id: 'text',
      text: 'A\n中😀é',
      width: 40,
      height: 40,
      rotation: 15,
    });
    expect(geometry).toMatchObject({
      entityId: 'text',
      localBounds: [0, 0, 40, 40],
      rotationDegrees: 15,
    });
    expect(geometry?.affine[4]).toBe(10);
    expect(geometry?.affine[5]).toBe(20);
    expect(Object.isFrozen(text)).toBe(true);
    expect(Object.isFrozen(text?.contentFrame)).toBe(true);
    expect(Object.isFrozen(text?.authoredStyle)).toBe(true);
  });

  it('projects empty, wrapped, requested-font fallback, and rapid text as distinct stable shapes', () => {
    const materialized = materializePatchMapDataset(catalogProfiles.datasets['standalone-text']);
    const first = parsePatchMap(materialized.dataset);
    const second = parsePatchMap(materialized.dataset);
    const texts = first.projection.textsByEntityId ?? {};

    expect(first.identity.entityIds).toEqual(second.identity.entityIds);
    expect(first.projection.textsByEntityId).toEqual(second.projection.textsByEntityId);
    expect(texts['empty-text']).toMatchObject({
      source: '',
      lines: [''],
      layoutBounds: { x: 0, y: 0, width: 0, height: 20 },
    });
    expect(texts['long-text']).toMatchObject({
      source: 'ABCDEFGHIJ',
      lines: ['ABCD', 'EFGH', 'IJ'],
      visibleText: 'ABCD\nEFGH\nIJ',
      layoutBounds: { x: 0, y: 0, width: 32, height: 60 },
      wordWrapWidthPx: 32,
      breakWords: true,
    });
    expect(texts['missing-font']).toMatchObject({
      source: 'fallback',
      rendererRoute: 'pixi-text',
    });
    expect(texts['missing-font']?.visibleFontRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({ fallbackReason: 'requested-font-unavailable' }),
    ]));
    expect(texts['rapid-text']).toMatchObject({
      source: 'old',
      layoutBounds: { x: 0, y: 0, width: 24, height: 20 },
    });

    const patched = structuredClone(materialized.dataset) as unknown as Array<Record<string, unknown>>;
    const rapid = patched.find(({ id }) => id === 'rapid-text');
    if (!rapid) throw new Error('rapid text fixture missing');
    rapid.text = 'final中';
    const next = parsePatchMap(patched);
    expect(next.identity.entityIds).toEqual(first.identity.entityIds);
    expect(next.identity.entitySourceById['rapid-text']).toEqual(
      first.identity.entitySourceById['rapid-text'],
    );
    expect(next.projection.textsByEntityId?.['rapid-text']?.layoutSignature).not.toBe(
      texts['rapid-text']?.layoutSignature,
    );
  });

  it('preserves zero and positive grapheme split plus bidi component identity', () => {
    const parsed = parsePatchMap(
      materializePatchMapDataset(catalogProfiles.datasets['item-text-corpus']).dataset,
    );
    const texts = parsed.projection.textsByEntityId ?? {};
    const zero = texts['item-a::text:zero'];
    const positive = texts['item-a::text:positive'];
    const bidi = texts['item-a::text:bidi'];

    expect(zero).toMatchObject({
      ownerId: 'item-a',
      componentId: 'zero',
      source: 'AB😀CD',
      graphemes: ['A', 'B', '😀', 'C', 'D'],
      split: 0,
      splitLines: ['AB😀CD'],
      contentFrame: { width: 240, height: 160 },
    });
    expect(positive).toMatchObject({
      componentId: 'positive',
      split: 2,
      splitLines: ['AB', '😀C', 'D'],
      layoutBounds: { x: 0, y: 0, width: 24, height: 60 },
    });
    expect(bidi).toMatchObject({
      componentId: 'bidi',
      source: 'ABC مرحبا 😀',
      baseDirection: 'ltr',
      rendererRoute: 'pixi-text',
    });
    expect(parsed.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'text-split-degraded',
    }));
    expect(Object.keys(texts)).toEqual([
      'item-a::text:zero',
      'item-a::text:positive',
      'item-a::text:bidi',
    ]);
  });

  it('rejects negative text split at materialization and direct parsing', () => {
    const input = [{
      type: 'item',
      id: 'item-a',
      size: 100,
      components: [{
        type: 'text',
        id: 'label',
        text: 'AB',
        split: -1,
      }],
    }];

    expect(() => materializePatchMapDataset(input)).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].components[0].split',
      }),
    );
    expect(() => parsePatchMap(input)).toThrow('Text split must be a nonnegative safe integer');
  });

  it('derives all supplemental placement, auto-font, wrap, overflow, and upright facts from product input', () => {
    const results = new Map(createPatchMapRenderTextSpecimens().map((specimen) => {
      const parsed = parsePatchMap(materializePatchMapDataset(specimen.dataset).dataset);
      const text = parsed.projection.textsByEntityId?.[
        `${specimen.target.ownerId}::text:${specimen.target.id}`
      ];
      return [specimen.id, { parsed, text }] as const;
    }));

    expect(results.get('placed')?.text).toMatchObject({
      source: 'AB',
      placement: 'right-bottom',
      margin: { top: 5, right: 5, bottom: 5, left: 5 },
      ownerLocalBounds: { x: 219, y: 135, width: 16, height: 20 },
      color: 0xff0000ff,
    });
    expect(results.get('auto')?.text).toMatchObject({
      source: 'ABCD',
      fontSizePx: 16,
      contentFrame: { width: 32, height: 20 },
      layoutBounds: { x: 0, y: 0, width: 32, height: 20 },
    });
    expect(results.get('wrap')?.text).toMatchObject({
      source: 'ABCDEFGHIJ',
      lines: ['ABCD', 'EFGH', 'IJ'],
      wordWrapWidthPx: 32,
      layoutBounds: { x: 0, y: 0, width: 32, height: 60 },
    });
    expect(results.get('overflow-visible')?.text).toMatchObject({
      overflow: 'visible',
      visibleText: 'ABCDEFGHIJ',
      layoutBounds: { x: 0, y: 0, width: 80, height: 20 },
    });
    expect(results.get('overflow-hidden')?.text).toMatchObject({
      overflow: 'hidden',
      visibleText: 'ABCD',
      layoutBounds: { x: 0, y: 0, width: 32, height: 20 },
    });
    expect(results.get('overflow-ellipsis')?.text).toMatchObject({
      overflow: 'ellipsis',
      visibleText: 'ABC…',
      layoutBounds: { x: 0, y: 0, width: 32, height: 20 },
    });
    expect(results.get('upright')?.text).toMatchObject({
      source: 'AB',
      placement: 'center',
      contentOrientation: 'upright',
      layoutBounds: { x: 0, y: 0, width: 16, height: 20 },
    });
    expect(results.get('upright')?.parsed.projection.byEntityId[
      'patch-map-ren011-upright::text:upright'
    ]).toMatchObject({
      rotationDegrees: 37,
      contentOrientation: 'upright',
      localBounds: [0, 0, 16, 20],
    });
  });

  it('detaches and freezes text style while surfacing unsupported Unicode diagnostics', () => {
    const style = { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20, letterSpacing: 1 };
    const input = [{
      type: 'text',
      id: 'unsupported',
      text: `A${String.fromCharCode(0xd800)}B`,
      style,
    }];
    const parsed = parsePatchMap(input);
    const text = parsed.projection.textsByEntityId?.unsupported;

    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(style)).toBe(false);
    expect(text?.authoredStyle).toEqual(style);
    expect(text?.authoredStyle).not.toBe(style);
    expect(Object.isFrozen(text?.authoredStyle)).toBe(true);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'text-layout-unsupported',
      path: '$[0].text[1]',
    }));
  });

  it('applies the current default font when the direct parser receives no style object', () => {
    const parsed = parsePatchMap([{ type: 'text', id: 'default-font', text: 'Ready' }]);

    expect(parsed.projection.textsByEntityId?.['default-font']).toMatchObject({
      sourceFontRuns: [{ text: 'Ready', font: 'FiraCode' }],
      visibleFontRuns: [{ text: 'Ready', font: 'FiraCode' }],
      rendererRoute: 'pixi-text',
    });
    expect(parsed.document.entities[0]).toMatchObject({
      id: 'default-font',
      fontSize: 16,
    });
  });

  it('keeps authored FiraCode immutable while routing it to the exact built-in family', () => {
    const style = { fontFamily: 'FiraCode', fontSize: 52, fontWeight: 600 };
    const input = [{
      type: 'text',
      id: 'authored-font-family',
      text: '구조물 높이\n0.8~3.2m',
      style,
    }];
    const parsed = parsePatchMap(input);
    const text = parsed.projection.textsByEntityId?.['authored-font-family'];

    expect(input[0]?.style).toBe(style);
    expect(style).toEqual({ fontFamily: 'FiraCode', fontSize: 52, fontWeight: 600 });
    expect(text?.authoredStyle).toEqual(style);
    expect(text?.authoredStyle).not.toBe(style);
    expect(text).toMatchObject({
      sourceFontRuns: [{ text: '구조물 높이\n0.8~3.2m', font: 'FiraCode' }],
      fontSizePx: 52,
      lineHeightPx: 65,
    });
  });

  it('shares omitted line-height resolution across standalone and component text', () => {
    const source = '구조물 높이\n0.8~3.2m';
    const parsed = parsePatchMap([{
      type: 'text',
      id: 'standalone-large',
      text: source,
      style: { fontFamily: 'FiraCode', fontSize: 52 },
    }, {
      type: 'item',
      id: 'text-owner',
      size: { width: 400, height: 200 },
      components: [{
        type: 'text',
        id: 'component-large',
        text: source,
        style: { fontFamily: 'FiraCode', fontSize: 52 },
      }],
    }]);
    const standalone = parsed.projection.textsByEntityId?.['standalone-large'];
    const component = parsed.projection.textsByEntityId?.['text-owner::text:component-large'];

    expect(standalone).toMatchObject({
      fontSizePx: 52,
      lineHeightPx: 65,
      layoutBounds: { height: 130 },
      rendererRoute: 'pixi-text',
    });
    expect(component).toMatchObject({
      fontSizePx: 52,
      lineHeightPx: 65,
      layoutBounds: { height: 130 },
      rendererRoute: 'pixi-text',
    });
    expect(component?.fontSizePx).toBe(standalone?.fontSizePx);
    expect(component?.lineHeightPx).toBe(standalone?.lineHeightPx);
    expect(component?.rendererRoute).toBe(standalone?.rendererRoute);
  });
});
