import { readFileSync } from 'node:fs';

import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { createPatchMapRenderTextSpecimens } from '../../lab/patch-map/contract/render-text-fixtures';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';

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
    const parsed = parsePatchMapV010(materializePatchMapDataset(input).dataset);
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
    const first = parsePatchMapV010(materialized.dataset);
    const second = parsePatchMapV010(materialized.dataset);
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
      rendererRoute: 'fallback-text',
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
    const next = parsePatchMapV010(patched);
    expect(next.identity.entityIds).toEqual(first.identity.entityIds);
    expect(next.identity.entitySourceById['rapid-text']).toEqual(
      first.identity.entitySourceById['rapid-text'],
    );
    expect(next.projection.textsByEntityId?.['rapid-text']?.layoutSignature).not.toBe(
      texts['rapid-text']?.layoutSignature,
    );
  });

  it('preserves zero, positive, and negative grapheme split plus bidi component identity', () => {
    const parsed = parsePatchMapV010(
      materializePatchMapDataset(catalogProfiles.datasets['item-text-corpus']).dataset,
    );
    const texts = parsed.projection.textsByEntityId ?? {};
    const zero = texts['item-a::text:zero'];
    const positive = texts['item-a::text:positive'];
    const negative = texts['item-a::text:negative'];
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
    expect(negative).toMatchObject({
      componentId: 'negative',
      split: -1,
      splitLines: ['AB😀CD'],
      layoutBounds: { x: 0, y: 0, width: 48, height: 20 },
    });
    expect(bidi).toMatchObject({
      componentId: 'bidi',
      source: 'ABC مرحبا 😀',
      baseDirection: 'ltr',
      rendererRoute: 'fallback-text',
    });
    expect(parsed.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'text-split-degraded',
    }));
    expect(Object.keys(texts)).toEqual([
      'item-a::text:zero',
      'item-a::text:positive',
      'item-a::text:negative',
      'item-a::text:bidi',
    ]);
  });

  it('derives all supplemental placement, auto-font, wrap, overflow, and upright facts from product input', () => {
    const results = new Map(createPatchMapRenderTextSpecimens().map((specimen) => {
      const parsed = parsePatchMapV010(materializePatchMapDataset(specimen.dataset).dataset);
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
      'core-v2-ren011-upright::text:upright'
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
    const parsed = parsePatchMapV010(input);
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

  it('applies the v0.10 default font when the direct parser receives no style object', () => {
    const parsed = parsePatchMapV010([{ type: 'text', id: 'default-font', text: 'Ready' }]);

    expect(parsed.projection.textsByEntityId?.['default-font']).toMatchObject({
      sourceFontRuns: [{ text: 'Ready', font: 'Fira Code' }],
      visibleFontRuns: [{ text: 'Ready', font: 'Fira Code' }],
      rendererRoute: 'fallback-text',
    });
    expect(parsed.document.entities[0]).toMatchObject({
      id: 'default-font',
      fontSize: 16,
    });
  });

  it('shares omitted line-height resolution across standalone and component text', () => {
    const source = '구조물 높이\n0.8~3.2m';
    const parsed = parsePatchMapV010([{
      type: 'text',
      id: 'standalone-large',
      text: source,
      style: { fontFamily: 'Fira Code', fontSize: 52 },
    }, {
      type: 'item',
      id: 'text-owner',
      size: { width: 400, height: 200 },
      components: [{
        type: 'text',
        id: 'component-large',
        text: source,
        style: { fontFamily: 'Fira Code', fontSize: 52 },
      }],
    }]);
    const standalone = parsed.projection.textsByEntityId?.['standalone-large'];
    const component = parsed.projection.textsByEntityId?.['text-owner::text:component-large'];

    expect(standalone).toMatchObject({
      fontSizePx: 52,
      lineHeightPx: 65,
      layoutBounds: { height: 130 },
      rendererRoute: 'fallback-text',
    });
    expect(component).toMatchObject({
      fontSizePx: 52,
      lineHeightPx: 65,
      layoutBounds: { height: 130 },
      rendererRoute: 'fallback-text',
    });
    expect(component?.fontSizePx).toBe(standalone?.fontSizePx);
    expect(component?.lineHeightPx).toBe(standalone?.lineHeightPx);
    expect(component?.rendererRoute).toBe(standalone?.rendererRoute);
  });
});
