import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  CORE_V2_BITMAP_TEXT_MAX_CODE_UNITS,
  CORE_V2_TEXT_RENDER_ROUTE_REVISION,
  selectCoreV2TextRenderRoute,
} from '../../src/core-v2/semantic/text-render-route';
import type {
  CoreV2BitmapTextCapabilityProof,
  CoreV2TextGlyphResolution,
  CoreV2TextRenderRouteInput,
  CoreV2TextRenderStyle,
} from '../../src/core-v2/semantic/text-render-route';

const SIMPLE_STYLE: CoreV2TextRenderStyle = Object.freeze({
  fontFamily: 'Fira Code',
  fontSize: 16,
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 20,
  letterSpacing: 0,
  advancedFeatures: Object.freeze([]),
});

const NO_GLYPH_FALLBACK: CoreV2TextGlyphResolution = Object.freeze({
  missingGlyphCount: 0,
  fallbackGlyphCount: 0,
});

const ASCII_GLYPHS = Object.freeze(Array.from(
  { length: 0x7f - 0x20 },
  (_, index) => String.fromCodePoint(index + 0x20),
));

describe('Core v2 pure Pixi text renderer-route policy', () => {
  it.each([
    ['CPU 42%', 1],
    ['0123456789', 1],
    ['line one\nline two', 2],
  ])('uses bitmap-text for bounded simple content with complete proof: %s', (text, lineCount) => {
    const decision = selectCoreV2TextRenderRoute(input(text));

    expect(decision).toMatchObject({
      revision: CORE_V2_TEXT_RENDER_ROUTE_REVISION,
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
        noFallbackGlyphs: true,
      },
    });
  });

  it('fails closed when finite atlas coverage is absent or incomplete', () => {
    const unproven = selectCoreV2TextRenderRoute(input('AB', { bitmapCapability: null }));
    const incomplete = selectCoreV2TextRenderRoute(input('AB', {
      bitmapCapability: capability({ glyphs: ['A'] }),
    }));

    expect(unproven).toMatchObject({
      route: 'fallback-text',
      reason: 'atlas-coverage-unproven',
      capabilities: {
        finiteAtlasProven: false,
        atlasCoverageComplete: false,
      },
    });
    expect(unproven.atlas.uncoveredGlyphs).toEqual(['A', 'B']);
    expect(incomplete).toMatchObject({
      route: 'fallback-text',
      reason: 'atlas-glyph-missing',
      capabilities: {
        finiteAtlasProven: true,
        atlasCoverageComplete: false,
      },
    });
    expect(incomplete.atlas.uncoveredGlyphs).toEqual(['B']);
  });

  it('keeps the 128-code-unit bound inclusive and routes longer content to fallback', () => {
    const boundary = 'x'.repeat(CORE_V2_BITMAP_TEXT_MAX_CODE_UNITS);
    const overlong = `${boundary}x`;

    expect(selectCoreV2TextRenderRoute(input(boundary)).route).toBe('bitmap-text');
    expect(selectCoreV2TextRenderRoute(input(overlong))).toMatchObject({
      route: 'fallback-text',
      reason: 'content-over-limit',
      content: { codeUnitCount: CORE_V2_BITMAP_TEXT_MAX_CODE_UNITS + 1 },
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
    const style: CoreV2TextRenderStyle = { ...SIMPLE_STYLE, ...changes };
    const decision = selectCoreV2TextRenderRoute(input('CPU 42', { style }));

    expect(decision).toMatchObject({
      route: 'fallback-text',
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
    const denied = selectCoreV2TextRenderRoute(input(text, {
      bitmapCapability: capability({ multiline: false }),
    }));
    const provenStyle: CoreV2TextRenderStyle = {
      ...SIMPLE_STYLE,
      fontWeight: 700,
      lineHeight: 22,
      letterSpacing: 1,
    };
    const explicitlyProven = selectCoreV2TextRenderRoute(input('TOTAL 42', {
      style: provenStyle,
      bitmapCapability: capability({ style: provenStyle }),
    }));

    expect(denied).toMatchObject({
      route: 'fallback-text',
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
  ])('routes %s content through guarded fallback', (_label, text, reason, fact) => {
    const decision = selectCoreV2TextRenderRoute(input(text, {
      bitmapCapability: capability({ glyphs: glyphsIn(text) }),
    }));

    expect(decision.route).toBe('fallback-text');
    expect(decision.reasons).toContain(reason);
    expect(decision.content[fact as keyof typeof decision.content]).toBe(true);
    expect(decision.capabilities.simpleContent).toBe(false);
  });

  it('permits a precomposed Latin glyph only when the finite atlas contains it', () => {
    const text = 'café 42';
    const decision = selectCoreV2TextRenderRoute(input(text, {
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

  it('routes independently observed missing or fallback glyph runs to fallback', () => {
    const missing = selectCoreV2TextRenderRoute(input('CPU', {
      glyphResolution: { missingGlyphCount: 1, fallbackGlyphCount: 0 },
    }));
    const fallback = selectCoreV2TextRenderRoute(input('CPU', {
      glyphResolution: { missingGlyphCount: 0, fallbackGlyphCount: 2 },
    }));

    expect(missing).toMatchObject({
      route: 'fallback-text',
      reason: 'missing-glyphs',
      capabilities: { noMissingGlyphs: false },
    });
    expect(fallback).toMatchObject({
      route: 'fallback-text',
      reason: 'fallback-glyphs',
      capabilities: { noFallbackGlyphs: false },
    });
  });

  it('fails closed on an ambiguous atlas proof instead of inferring glyph support', () => {
    const invalid = capability({ glyphs: ['CPU'] });
    const decision = selectCoreV2TextRenderRoute(input('CPU', {
      bitmapCapability: invalid,
    }));

    expect(decision).toMatchObject({
      route: 'fallback-text',
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
    const first = selectCoreV2TextRenderRoute(routeInput);
    const second = selectCoreV2TextRenderRoute(routeInput);

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

  it('stays pure and independent from Pixi classes and the legacy coarse predicate', async () => {
    const source = await readFile(
      new URL('../../src/core-v2/semantic/text-render-route.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]pixi(?:\.js)?['"]/u);
    expect(source).not.toContain('new BitmapText');
    expect(source).not.toContain('new Text');
    expect(source).not.toContain('isBitmapTextSafe');
  });
});

function input(
  text: string,
  overrides: Partial<CoreV2TextRenderRouteInput> = {},
): CoreV2TextRenderRouteInput {
  return {
    text,
    style: SIMPLE_STYLE,
    glyphResolution: NO_GLYPH_FALLBACK,
    bitmapCapability: capability(),
    ...overrides,
  };
}

function capability(
  overrides: Partial<CoreV2BitmapTextCapabilityProof> = {},
): CoreV2BitmapTextCapabilityProof {
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
