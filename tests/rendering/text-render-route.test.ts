import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_BITMAP_TEXT_MAX_CODE_UNITS,
  PATCH_MAP_TEXT_RENDER_ROUTE_REVISION,
  selectPatchMapTextRenderRoute,
} from '../../src/patch-map/semantic/text-render-route';
import type {
  PatchMapBitmapTextCapabilityProof,
  PatchMapTextGlyphResolution,
  PatchMapTextRenderRouteInput,
  PatchMapTextRenderStyle,
} from '../../src/patch-map/semantic/text-render-route';

const SIMPLE_STYLE: PatchMapTextRenderStyle = Object.freeze({
  fontFamily: 'FiraCode',
  fontSize: 16,
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 20,
  letterSpacing: 0,
  advancedFeatures: Object.freeze([]),
});

const NO_GLYPH_FALLBACK: PatchMapTextGlyphResolution = Object.freeze({
  missingGlyphCount: 0,
  fontFallbackGlyphCount: 0,
});

const ASCII_GLYPHS = Object.freeze(Array.from(
  { length: 0x7f - 0x20 },
  (_, index) => String.fromCodePoint(index + 0x20),
));

describe('PatchMap pure Pixi text renderer-route policy', () => {
  it.each([
    ['CPU 42%', 1],
    ['0123456789', 1],
    ['line one\nline two', 2],
  ])('uses bitmap-text for bounded simple content with complete proof: %s', (text, lineCount) => {
    const decision = selectPatchMapTextRenderRoute(input(text));

    expect(decision).toMatchObject({
      revision: PATCH_MAP_TEXT_RENDER_ROUTE_REVISION,
      route: 'bitmap-text',
      reason: 'bitmap-capability-proven',
      reasons: ['bitmap-capability-proven'],
      content: {
        codeUnitCount: text.length,
        lineCount,
        containsCjk: false,
        containsBidi: false,
        containsEmoji: false,
        containsCombiningSequence: false,
      },
      capabilities: {
        contentWithinLimit: true,
        simpleContent: true,
        finiteAtlasProven: true,
        atlasCoverageComplete: true,
        styleCapabilityProven: true,
        styleCompatible: true,
        multilineSupported: true,
        noMissingGlyphs: true,
        noFontFallbackGlyphs: true,
      },
    });
  });

  it('fails closed when finite atlas coverage is absent or incomplete', () => {
    const unproven = selectPatchMapTextRenderRoute(input('AB', { bitmapCapability: null }));
    const incomplete = selectPatchMapTextRenderRoute(input('AB', {
      bitmapCapability: capability({ glyphs: ['A'] }),
    }));

    expect(unproven).toMatchObject({
      route: 'pixi-text',
      reason: 'atlas-coverage-unproven',
      capabilities: {
        finiteAtlasProven: false,
        atlasCoverageComplete: false,
      },
    });
    expect(unproven.atlas.uncoveredGlyphs).toEqual(['A', 'B']);
    expect(incomplete).toMatchObject({
      route: 'pixi-text',
      reason: 'atlas-glyph-missing',
      capabilities: {
        finiteAtlasProven: true,
        atlasCoverageComplete: false,
      },
    });
    expect(incomplete.atlas.uncoveredGlyphs).toEqual(['B']);
  });

  it('keeps the 128-code-unit bound inclusive and routes longer content to Pixi Text', () => {
    const boundary = 'x'.repeat(PATCH_MAP_BITMAP_TEXT_MAX_CODE_UNITS);
    const overlong = `${boundary}x`;

    expect(selectPatchMapTextRenderRoute(input(boundary)).route).toBe('bitmap-text');
    expect(selectPatchMapTextRenderRoute(input(overlong))).toMatchObject({
      route: 'pixi-text',
      reason: 'content-over-limit',
      content: { codeUnitCount: PATCH_MAP_BITMAP_TEXT_MAX_CODE_UNITS + 1 },
      capabilities: { contentWithinLimit: false },
    });
  });

  it.each([
    ['fontWeight', { fontWeight: 700 }, 'fontWeight'],
    ['fontStyle', { fontStyle: 'italic' as const }, 'fontStyle'],
    ['lineHeight', { lineHeight: 22 }, 'lineHeight'],
    ['letterSpacing', { letterSpacing: 1 }, 'letterSpacing'],
    ['advanced style', { advancedFeatures: ['stroke'] }, 'advanced:stroke'],
  ])('guards an unproven %s variation', (_label, changes, mismatch) => {
    const style: PatchMapTextRenderStyle = { ...SIMPLE_STYLE, ...changes };
    const decision = selectPatchMapTextRenderRoute(input('CPU 42', { style }));

    expect(decision).toMatchObject({
      route: 'pixi-text',
      reason: 'unsupported-style',
      capabilities: {
        styleCapabilityProven: true,
        styleCompatible: false,
      },
    });
    expect(decision.atlas.styleMismatches).toContain(mismatch);
  });

  it('requires an explicit multiline capability while accepting its exact style proof', () => {
    const text = 'first\nsecond';
    const denied = selectPatchMapTextRenderRoute(input(text, {
      bitmapCapability: capability({ multiline: false }),
    }));
    const provenStyle: PatchMapTextRenderStyle = {
      ...SIMPLE_STYLE,
      fontWeight: 700,
      lineHeight: 22,
      letterSpacing: 1,
    };
    const explicitlyProven = selectPatchMapTextRenderRoute(input('TOTAL 42', {
      style: provenStyle,
      bitmapCapability: capability({ style: provenStyle }),
    }));

    expect(denied).toMatchObject({
      route: 'pixi-text',
      reason: 'multiline-unsupported',
      capabilities: { multilineSupported: false },
    });
    expect(explicitlyProven).toMatchObject({
      route: 'bitmap-text',
      capabilities: { styleCompatible: true },
    });
  });

  it.each([
    ['CJK', '상태 中', 'cjk-content', 'containsCjk'],
    ['Arabic/bidi', 'مرحبا world', 'bidi-content', 'containsBidi'],
    ['bidi control', `abc${String.fromCodePoint(0x202e)}def`, 'bidi-content', 'containsBidi'],
    ['emoji', 'ready 😀', 'emoji-content', 'containsEmoji'],
    ['combining sequence', `e${String.fromCodePoint(0x0301)}`, 'combining-sequence', 'containsCombiningSequence'],
    ['unsupported script', 'Привет', 'unsupported-script', 'containsUnsupportedScript'],
  ])('routes %s content through Pixi Text', (_label, text, reason, fact) => {
    const decision = selectPatchMapTextRenderRoute(input(text, {
      bitmapCapability: capability({ glyphs: glyphsIn(text) }),
    }));

    expect(decision.route).toBe('pixi-text');
    expect(decision.reasons).toContain(reason);
    expect(decision.content[fact as keyof typeof decision.content]).toBe(true);
    expect(decision.capabilities.simpleContent).toBe(false);
  });

  it('permits a precomposed Latin glyph only when the finite atlas contains it', () => {
    const text = 'café 42';
    const decision = selectPatchMapTextRenderRoute(input(text, {
      bitmapCapability: capability({ glyphs: glyphsIn(text) }),
    }));

    expect(decision).toMatchObject({
      route: 'bitmap-text',
      content: {
        containsNonAscii: true,
        containsCombiningSequence: false,
        containsUnsupportedScript: false,
      },
    });
  });

  it('routes missing or font-family fallback glyph runs to Pixi Text', () => {
    const missing = selectPatchMapTextRenderRoute(input('CPU', {
      glyphResolution: { missingGlyphCount: 1, fontFallbackGlyphCount: 0 },
    }));
    const fontFallbackDecision = selectPatchMapTextRenderRoute(input('CPU', {
      glyphResolution: { missingGlyphCount: 0, fontFallbackGlyphCount: 2 },
    }));

    expect(missing).toMatchObject({
      route: 'pixi-text',
      reason: 'missing-glyphs',
      capabilities: { noMissingGlyphs: false },
    });
    expect(fontFallbackDecision).toMatchObject({
      route: 'pixi-text',
      reason: 'font-fallback-glyphs',
      capabilities: { noFontFallbackGlyphs: false },
    });
  });

  it('fails closed on an ambiguous atlas proof instead of inferring glyph support', () => {
    const invalid = capability({ glyphs: ['CPU'] });
    const decision = selectPatchMapTextRenderRoute(input('CPU', {
      bitmapCapability: invalid,
    }));

    expect(decision).toMatchObject({
      route: 'pixi-text',
      reason: 'atlas-capability-invalid',
      capabilities: {
        finiteAtlasProven: false,
        atlasCoverageComplete: false,
      },
    });
  });

  it('returns detached, deeply immutable and repeatable semantic sidecar facts', () => {
    const mutableStyle = { ...SIMPLE_STYLE, advancedFeatures: [] as string[] };
    const mutableGlyphs = [...ASCII_GLYPHS];
    const routeInput = input('CPU 42', {
      style: mutableStyle,
      bitmapCapability: capability({ glyphs: mutableGlyphs }),
    });
    const before = JSON.stringify(routeInput);
    const first = selectPatchMapTextRenderRoute(routeInput);
    const second = selectPatchMapTextRenderRoute(routeInput);

    expect(JSON.stringify(routeInput)).toBe(before);

    mutableStyle.advancedFeatures.push('dropShadow');
    mutableGlyphs.splice(0, mutableGlyphs.length);

    expect(JSON.stringify(routeInput)).not.toBe(before);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.route).toBe('bitmap-text');
    expect(first.atlas.glyphCount).toBe(ASCII_GLYPHS.length);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.reasons)).toBe(true);
    expect(Object.isFrozen(first.content)).toBe(true);
    expect(Object.isFrozen(first.atlas)).toBe(true);
    expect(Object.isFrozen(first.atlas.uncoveredGlyphs)).toBe(true);
    expect(Object.isFrozen(first.atlas.styleMismatches)).toBe(true);
    expect(Object.isFrozen(first.atlas.unsupportedStyleFeatures)).toBe(true);
    expect(Object.isFrozen(first.capabilities)).toBe(true);
  });

  it('stays pure and independent from Pixi classes', async () => {
    const source = await readFile(
      new URL('../../src/patch-map/semantic/text-render-route.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]pixi(?:\.js)?['"]/u);
    expect(source).not.toContain('new BitmapText');
    expect(source).not.toContain('new Text');
  });
});

function input(
  text: string,
  overrides: Partial<PatchMapTextRenderRouteInput> = {},
): PatchMapTextRenderRouteInput {
  return {
    text,
    style: SIMPLE_STYLE,
    glyphResolution: NO_GLYPH_FALLBACK,
    bitmapCapability: capability(),
    ...overrides,
  };
}

function capability(
  overrides: Partial<PatchMapBitmapTextCapabilityProof> = {},
): PatchMapBitmapTextCapabilityProof {
  return {
    coverage: 'proven',
    atlasId: 'fira-code-ascii-16-400',
    glyphs: ASCII_GLYPHS,
    style: SIMPLE_STYLE,
    multiline: true,
    ...overrides,
  };
}

function glyphsIn(text: string): readonly string[] {
  return [...new Set([...text].filter((glyph) => glyph !== '\n' && glyph !== '\r'))];
}
