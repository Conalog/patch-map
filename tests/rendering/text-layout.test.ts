import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_TEXT_PROFILE,
  PatchMapTextLayoutError,
  layoutPatchMapText,
  measurePatchMapGraphemeAdvance,
  relocatePatchMapTextLayout,
  segmentPatchMapGraphemes,
  type PatchMapTextLayoutOptions,
} from '../../src/semantic/text-layout';

describe('PatchMap deterministic Unicode semantic layout', () => {
  it('pins the supported Unicode profile and ASCII semantic advance frame', () => {
    const result = layoutPatchMapText({ source: 'ASCII' });

    expect(result.profile).toEqual({
      id: 'patch-map-unicode-cell-fonts/1',
      unicodeVersion: '16.0.0',
      grapheme: 'UAX-29-revision-45',
      lineBreak: 'UAX-14-revision-53-default-with-CJ-as-NS',
      bidi: 'UAX-9-revision-50',
      locale: 'und',
      baseDirection: 'auto',
      sourceNormalization: 'none',
      layoutLineEndingNormalization: 'CRLF-and-CR-to-LF',
      semanticCoverage: 'patch-map-supported-unicode-subset/1',
      scalarFallback: 'valid-scalars-default-to-atomic-other',
      lineBreakCoverage: 'hard-break-preserved-space-ideographic-and-explicit-breakWords',
      supplementaryAdvanceUnit: 'per-nonzero-scalar-inside-grapheme',
      baseFont: 'unifont-base-16.0.04',
      upperFont: 'unifont-upper-16.0.04',
      missingGlyph: 'patch-map-missing-glyph-box/1',
      ellipsisMarker: 'patch-map-ellipsis-marker/1',
    });
    expect(result.graphemes).toEqual(['A', 'S', 'C', 'I', 'I']);
    expect(result.lines).toEqual(['ASCII']);
    expect(result.visibleText).toBe('ASCII');
    expect(result.fontRuns).toEqual([{ text: 'ASCII', font: 'unifont-base-16.0.04' }]);
    expect(result.layoutBounds).toEqual({ x: 0, y: 0, width: 40, height: 20 });
    expect(result.rendererRoute).toBe('bitmap-text');
    expect(result.diagnostics).toEqual([]);
  });

  it('scales omitted line height from the resolved font size without changing explicit input', () => {
    const defaultSize = layoutPatchMapText({ source: 'A\nB' });
    const largeOmitted = layoutPatchMapText({
      source: '구조물 높이\n0.8~3.2m',
      fontSizePx: 52,
      requestedFont: 'FiraCode',
      availableRequestedFonts: ['FiraCode'],
      wordWrapWidthPx: null,
    });
    const largeExplicit = layoutPatchMapText({
      source: 'A\nB',
      fontSizePx: 52,
      lineHeightPx: 20,
    });

    expect(defaultSize.lineHeightPx).toBe(20);
    expect(defaultSize.layoutBounds.height).toBe(40);
    expect(largeOmitted.lineHeightPx).toBe(65);
    expect(largeOmitted.layoutBounds.height).toBe(130);
    expect(largeExplicit.lineHeightPx).toBe(20);
    expect(largeExplicit.layoutBounds.height).toBe(40);
  });

  it('preserves exact source while normalizing CRLF and CR only for layout', () => {
    const crlf = layoutPatchMapText({ source: 'A\r\nB' });
    const cr = layoutPatchMapText({ source: 'A\rB' });
    const mixed = layoutPatchMapText({ source: 'A\rB\nC' });

    expect(crlf.source).toBe('A\r\nB');
    expect(crlf.layoutSource).toBe('A\nB');
    expect(crlf.graphemes).toEqual(['A', '\r\n', 'B']);
    expect(crlf.lines).toEqual(['A', 'B']);
    expect(crlf.visibleText).toBe('A\nB');
    expect(crlf.fontRuns).toEqual([
      { text: 'A', font: 'unifont-base-16.0.04' },
      { text: 'B', font: 'unifont-base-16.0.04' },
    ]);
    expect(crlf.sourceFontRuns).toBe(crlf.fontRuns);
    expect(crlf.visibleFontRuns).toEqual([
      { text: 'A\nB', font: 'unifont-base-16.0.04' },
    ]);
    expect(crlf.layoutBounds).toEqual({ x: 0, y: 0, width: 8, height: 40 });
    expect(cr.layoutSource).toBe('A\nB');
    expect(cr.source).toBe('A\rB');
    expect(mixed.sourceFontRuns).toEqual([
      { text: 'A', font: 'unifont-base-16.0.04' },
      { text: 'B\nC', font: 'unifont-base-16.0.04' },
    ]);
    expect(mixed.visibleFontRuns).toEqual([
      { text: 'A\nB\nC', font: 'unifont-base-16.0.04' },
    ]);
  });

  it('segments family emoji, skin tone, combining marks, flags, and Hangul without native Intl', () => {
    expect(segmentPatchMapGraphemes('👨‍👩‍👧‍👦👍🏽')).toEqual(['👨‍👩‍👧‍👦', '👍🏽']);
    expect(segmentPatchMapGraphemes('é')).toEqual(['é']);
    expect(segmentPatchMapGraphemes('🇰🇷🇺🇸')).toEqual(['🇰🇷', '🇺🇸']);
    expect(segmentPatchMapGraphemes('각')).toEqual(['각']);

    const emoji = layoutPatchMapText({ source: '👨‍👩‍👧‍👦👍🏽' });
    expect(emoji.graphemes).toEqual(['👨‍👩‍👧‍👦', '👍🏽']);
    expect(emoji.fontRuns).toEqual([
      { text: '👨‍👩‍👧‍👦👍🏽', font: 'unifont-upper-16.0.04' },
    ]);
    expect(emoji.layoutBounds).toEqual({ x: 0, y: 0, width: 96, height: 20 });
    expect(layoutPatchMapText({ source: 'é' }).layoutBounds).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 20,
    });
  });

  it('wraps CJK at pinned opportunities and long Latin only when breakWords is enabled', () => {
    const cjk = layoutPatchMapText({ source: '漢字かな交じり文', wordWrapWidthPx: 64 });
    const long = layoutPatchMapText({
      source: 'ABCDEFGHIJ',
      wordWrapWidthPx: 32,
      breakWords: true,
    });
    const unbroken = layoutPatchMapText({
      source: 'ABCDEFGHIJ',
      wordWrapWidthPx: 32,
      breakWords: false,
    });

    expect(cjk.lines).toEqual(['漢字かな', '交じり文']);
    expect(cjk.visibleText).toBe('漢字かな\n交じり文');
    expect(cjk.layoutBounds).toEqual({ x: 0, y: 0, width: 64, height: 40 });
    expect(long.lines).toEqual(['ABCD', 'EFGH', 'IJ']);
    expect(long.layoutBounds).toEqual({ x: 0, y: 0, width: 32, height: 60 });
    expect(unbroken.lines).toEqual(['ABCDEFGHIJ']);
    expect(unbroken.layoutBounds.width).toBe(80);
  });

  it('preserves multiline and repeated spaces and gives empty text one line box', () => {
    const multiline = layoutPatchMapText({ source: 'A\nB\nC' });
    const spaces = layoutPatchMapText({ source: 'A  B', whiteSpace: 'preserve' });
    const empty = layoutPatchMapText({ source: '' });

    expect(multiline.lines).toEqual(['A', 'B', 'C']);
    expect(multiline.fontRuns).toEqual([
      { text: 'A\nB\nC', font: 'unifont-base-16.0.04' },
    ]);
    expect(multiline.layoutBounds).toEqual({ x: 0, y: 0, width: 8, height: 60 });
    expect(spaces.graphemes).toEqual(['A', ' ', ' ', 'B']);
    expect(spaces.layoutBounds.width).toBe(32);
    expect(empty.lines).toEqual(['']);
    expect(empty.visibleText).toBe('');
    expect(empty.layoutBounds).toEqual({ x: 0, y: 0, width: 0, height: 20 });
  });

  it('derives automatic RTL base direction, logical/visual runs, and exact mapping', () => {
    const result = layoutPatchMapText({ source: 'مرحبا world' });

    expect(result.baseDirection).toBe('rtl');
    expect(result.bidiRunsLogical).toEqual([
      { text: 'مرحبا ', level: 1, direction: 'rtl', logicalStart: 0, logicalEnd: 6 },
      { text: 'world', level: 2, direction: 'ltr', logicalStart: 6, logicalEnd: 11 },
    ]);
    expect(result.bidiRunsVisualOrder).toEqual([
      { text: 'world', level: 2, direction: 'ltr', logicalStart: 6, logicalEnd: 11 },
      { text: 'مرحبا ', level: 1, direction: 'rtl', logicalStart: 0, logicalEnd: 6 },
    ]);
    expect(result.logicalToVisual).toEqual([10, 9, 8, 7, 6, 5, 0, 1, 2, 3, 4]);
    expect(result.layoutBounds).toEqual({ x: 0, y: 0, width: 88, height: 20 });
    expect(result.rendererRoute).toBe('pixi-text');
  });

  it('keeps European and Arabic-Indic digit graphemes in logical order inside RTL text', () => {
    for (const digits of ['123', '١٢٣', '۱۲۳']) {
      const result = layoutPatchMapText({ source: `مرحبا ${digits}` });

      expect(result.baseDirection).toBe('rtl');
      expect(result.bidiRunsLogical).toEqual([
        { text: 'مرحبا ', level: 1, direction: 'rtl', logicalStart: 0, logicalEnd: 6 },
        { text: digits, level: 2, direction: 'ltr', logicalStart: 6, logicalEnd: 9 },
      ]);
      expect(result.logicalToVisual).toEqual([8, 7, 6, 5, 4, 3, 0, 1, 2]);
      expect(result.diagnostics).toEqual([]);
    }

    const ltr = layoutPatchMapText({ source: 'CPU 123' });
    expect(ltr.baseDirection).toBe('ltr');
    expect(ltr.bidiRunsLogical).toEqual([
      { text: 'CPU ', level: 0, direction: 'ltr', logicalStart: 0, logicalEnd: 4 },
      { text: '123', level: 2, direction: 'ltr', logicalStart: 4, logicalEnd: 7 },
    ]);
    expect(ltr.logicalToVisual).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('uses deterministic font fallback independently of system fonts', () => {
    const unavailable = layoutPatchMapText({
      source: 'fallback',
      requestedFont: 'PatchMapMissingRequestedFont',
    });
    const available = layoutPatchMapText({
      source: 'ASCII',
      requestedFont: 'FixtureFont',
      availableRequestedFonts: ['FixtureFont'],
    });

    expect(unavailable.fontRuns).toEqual([
      {
        text: 'fallback',
        font: 'unifont-base-16.0.04',
        fallbackReason: 'requested-font-unavailable',
      },
    ]);
    expect(unavailable.layoutBounds.width).toBe(64);
    expect(unavailable.rendererRoute).toBe('pixi-text');
    expect(available.fontRuns).toEqual([
      { text: 'ASCII', font: 'FixtureFont' },
    ]);
    expect(available.visibleFontRuns).toEqual([{ text: 'ASCII', font: 'FixtureFont' }]);
    expect(available.rendererRoute).toBe('pixi-text');
  });

  it('applies visible, hidden, and ellipsis overflow without splitting a grapheme', () => {
    const shared = { source: 'ABCDEFGHIJ', contentFrame: { width: 32, height: 20 } } as const;
    const visible = layoutPatchMapText({ ...shared, overflow: 'visible' });
    const hidden = layoutPatchMapText({ ...shared, overflow: 'hidden' });
    const ellipsis = layoutPatchMapText({ ...shared, overflow: 'ellipsis' });
    const emojiHidden = layoutPatchMapText({
      source: 'A👨‍👩‍👧‍👦B',
      contentFrame: { width: 8, height: 20 },
      overflow: 'hidden',
    });

    expect(visible.visibleText).toBe('ABCDEFGHIJ');
    expect(visible.layoutBounds).toEqual({ x: 0, y: 0, width: 80, height: 20 });
    expect(hidden.visibleText).toBe('ABCD');
    expect(hidden.layoutBounds).toEqual({ x: 0, y: 0, width: 32, height: 20 });
    expect(hidden.naturalLayoutBounds.width).toBe(80);
    expect(hidden.fontRuns).toEqual([
      { text: 'ABCDEFGHIJ', font: 'unifont-base-16.0.04' },
    ]);
    expect(hidden.visibleFontRuns).toEqual([
      { text: 'ABCD', font: 'unifont-base-16.0.04' },
    ]);
    expect(ellipsis.visibleText).toBe('ABC…');
    expect(ellipsis.fontRuns).toEqual([
      { text: 'ABC', font: 'unifont-base-16.0.04' },
      { text: '…', font: 'patch-map-ellipsis-marker/1' },
    ]);
    expect(ellipsis.layoutBounds).toEqual({ x: 0, y: 0, width: 32, height: 20 });
    expect(emojiHidden.visibleText).toBe('A');
    expect(
      layoutPatchMapText({
        source: 'AB',
        contentFrame: { width: 4, height: 20 },
        overflow: 'ellipsis',
      }).layoutBounds,
    ).toEqual({ x: 0, y: 0, width: 0, height: 20 });
  });

  it('selects the largest inclusive automatic font candidate and makes ties deterministic', () => {
    const boundary = layoutPatchMapText({
      source: 'ABCD',
      contentFrame: { width: 32, height: 20 },
      autoFont: { minPx: 8, maxPx: 18 },
    });
    const tie = layoutPatchMapText({
      source: 'AB',
      contentFrame: { width: 16, height: 20 },
      autoFont: { minPx: 12, maxPx: 16 },
    });
    const noneFits = layoutPatchMapText({
      source: 'ABCDEFGHIJ',
      contentFrame: { width: 1, height: 20 },
      autoFont: { minPx: 8, maxPx: 16 },
      overflow: 'visible',
    });

    expect(boundary.fontSizePx).toBe(16);
    expect(boundary.fontRuns).toEqual([
      { text: 'ABCD', font: 'unifont-base-16.0.04', fontSizePx: 16 },
    ]);
    expect(boundary.layoutBounds).toEqual({ x: 0, y: 0, width: 32, height: 20 });
    expect(tie.fontSizePx).toBe(16);
    expect(noneFits.fontSizePx).toBe(8);
    expect(noneFits.layoutBounds.width).toBe(40);
  });

  it('resolves omitted line height for every automatic-font candidate', () => {
    const omitted = layoutPatchMapText({
      source: 'A\nB',
      contentFrame: { width: 100, height: 100 },
      autoFont: { minPx: 8, maxPx: 64 },
    });
    const explicit = layoutPatchMapText({
      source: 'A\nB',
      lineHeightPx: 20,
      contentFrame: { width: 100, height: 100 },
      autoFont: { minPx: 8, maxPx: 64 },
    });

    expect(omitted.fontSizePx).toBe(40);
    expect(omitted.lineHeightPx).toBe(50);
    expect(omitted.naturalLayoutBounds.height).toBe(100);
    expect(explicit.fontSizePx).toBe(64);
    expect(explicit.lineHeightPx).toBe(20);
    expect(explicit.naturalLayoutBounds.height).toBe(40);
  });

  it('fits the production multiline FiraCode autoFont fixture in both dimensions', () => {
    const result = layoutPatchMapText({
      source: 'INV2\nDC2\nMPPT4\nSTR4\n7',
      requestedFont: 'FiraCode',
      availableRequestedFonts: ['FiraCode'],
      wordWrapWidthPx: 32,
      breakWords: false,
      contentFrame: { width: 32, height: 72 },
      autoFont: { minPx: 8, maxPx: 14 },
    });

    expect(result.fontSizePx).toBe(11);
    expect(result.lineHeightPx).toBe(13.75);
    expect(result.visibleLines).toEqual(['INV2', 'DC2', 'MPPT4', 'STR4', '7']);
    expect(result.layoutBounds).toEqual({ x: 0, y: 0, width: 27.5, height: 68.75 });
  });

  it('uses resolved omitted line height for overflow line limits', () => {
    const omitted = layoutPatchMapText({
      source: 'A\nB\nC',
      fontSizePx: 52,
      contentFrame: { width: 100, height: 129 },
      overflow: 'hidden',
    });
    const explicit = layoutPatchMapText({
      source: 'A\nB\nC',
      fontSizePx: 52,
      lineHeightPx: 20,
      contentFrame: { width: 100, height: 129 },
      overflow: 'hidden',
    });

    expect(omitted.lineHeightPx).toBe(65);
    expect(omitted.visibleLines).toEqual(['A']);
    expect(omitted.layoutBounds.height).toBe(65);
    expect(explicit.visibleLines).toEqual(['A', 'B', 'C']);
    expect(explicit.layoutBounds.height).toBe(60);
  });

  it('replaces declared missing glyphs while preserving exact source and run identity', () => {
    const source = 'missing:\u{10ffff}';
    const result = layoutPatchMapText({ source });

    expect(result.source).toBe(source);
    expect(result.lines).toEqual([source]);
    expect(result.visibleText).toBe('missing:□');
    expect(result.fontRuns).toEqual([
      { text: 'missing:', font: 'unifont-base-16.0.04' },
      { text: '\u{10ffff}', font: 'patch-map-missing-glyph-box/1' },
    ]);
    expect(result.missingGlyphs).toEqual([
      { codePoint: 'U+10FFFF', identity: 'patch-map-missing-glyph-box/1', count: 1 },
    ]);
    expect(result.layoutBounds).toEqual({ x: 0, y: 0, width: 80, height: 20 });
  });

  it('implements positive split by grapheme and treats negative split as a no-op', () => {
    const zero = layoutPatchMapText({ source: 'AB😀CD', split: 0 });
    const positive = layoutPatchMapText({ source: 'AB😀CD', split: 2 });
    const negative = layoutPatchMapText({ source: 'AB😀CD', split: -1 });

    expect(zero.lines).toEqual(['AB😀CD']);
    expect(zero.layoutBounds).toEqual({ x: 0, y: 0, width: 48, height: 20 });
    expect(positive.lines).toEqual(['AB', '😀C', 'D']);
    expect(positive.layoutBounds).toEqual({ x: 0, y: 0, width: 24, height: 60 });
    expect(negative.lines).toEqual(zero.lines);
    expect(negative.layoutBounds).toEqual(zero.layoutBounds);
  });

  it('matches standalone and patched international product specimens', () => {
    const initial = layoutPatchMapText({
      source: 'A\r\n中😀é',
      requestedFont: 'Unifont',
      fontSizePx: 16,
      lineHeightPx: 20,
      letterSpacingPx: 0,
      contentFrame: { width: 100, height: 60 },
    });
    const patched = layoutPatchMapText({
      source: 'مرحبا world',
      requestedFont: 'Unifont',
      fontSizePx: 16,
      lineHeightPx: 20,
      letterSpacingPx: 0,
      contentFrame: { width: 100, height: 60 },
    });
    const rapid = layoutPatchMapText({ source: 'final中' });

    expect(initial.source).toBe('A\r\n中😀é');
    expect(initial.lines).toEqual(['A', '中😀é']);
    expect(initial.layoutBounds).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(patched.lines).toEqual(['مرحبا world']);
    expect(patched.layoutBounds).toEqual({ x: 0, y: 0, width: 88, height: 20 });
    expect(patched.naturalLayoutBounds).toEqual(patched.layoutBounds);
    expect(rapid.visibleText).toBe('final中');
    expect(rapid.layoutBounds).toEqual({ x: 0, y: 0, width: 56, height: 20 });
  });

  it('applies cluster letter spacing, caller-owned origin, and semantic route rules', () => {
    const result = layoutPatchMapText({
      source: 'AB',
      letterSpacingPx: 2,
      origin: { x: 219, y: 135 },
    });
    const international = layoutPatchMapText({ source: '中😀é\nمرحبا' });

    expect(result.layoutBounds.width).toBe(18);
    expect(result.ownerLocalBounds).toEqual({ x: 219, y: 135, width: 18, height: 20 });
    expect(international.lines).toEqual(['中😀é', 'مرحبا']);
    expect(international.layoutBounds).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(international.rendererRoute).toBe('pixi-text');
  });

  it('relocates a completed layout with the exact direct-origin signature', () => {
    const options = {
      source: 'مرحبا 123\nAB😀',
      fontSizePx: 16,
      lineHeightPx: 20,
      letterSpacingPx: 1,
      wordWrapWidthPx: 96,
      breakWords: true,
    } as const;
    const base = layoutPatchMapText(options);
    const relocated = relocatePatchMapTextLayout(base, { x: 219, y: 135 });
    const direct = layoutPatchMapText({ ...options, origin: { x: 219, y: 135 } });

    expect(relocated).toEqual(direct);
    expect(relocated.layoutSignature).toBe(direct.layoutSignature);
    expect(relocated.lines).toBe(base.lines);
    expect(relocated.bidiLines).toBe(base.bidiLines);
    expect(relocated.fontRuns).toBe(base.fontRuns);
    expect(base.ownerLocalBounds).toEqual({
      x: 0,
      y: 0,
      width: base.layoutBounds.width,
      height: base.layoutBounds.height,
    });
    expect(Object.isFrozen(relocated)).toBe(true);
    expect(relocatePatchMapTextLayout(relocated, { x: 219, y: 135 })).toBe(relocated);
  });

  it('keeps every advance and bounds field finite and nonnegative with negative spacing', () => {
    const overlapping = layoutPatchMapText({
      source: 'ABCD',
      letterSpacingPx: -100,
      wordWrapWidthPx: 4,
      breakWords: true,
    });

    expect(overlapping.lineAdvancesPx.every((advance) => Number.isFinite(advance))).toBe(true);
    expect(overlapping.lineAdvancesPx.every((advance) => advance >= 0)).toBe(true);
    expect(overlapping.layoutBounds.width).toBeGreaterThanOrEqual(0);
    expect(overlapping.naturalLayoutBounds.width).toBeGreaterThanOrEqual(0);
    expect(overlapping.ownerLocalBounds.width).toBeGreaterThanOrEqual(0);
  });

  it('reports authoritative bidi facts per normalized, wrapped semantic line', () => {
    const result = layoutPatchMapText({ source: 'ABC\nمرحبا world' });

    expect(result.bidiLines).toHaveLength(2);
    expect(result.bidiLines[0]).toMatchObject({
      lineIndex: 0,
      source: 'ABC',
      baseDirection: 'ltr',
      logicalToVisual: [0, 1, 2],
    });
    expect(result.bidiLines[1]).toMatchObject({
      lineIndex: 1,
      source: 'مرحبا world',
      baseDirection: 'rtl',
      logicalToVisual: [10, 9, 8, 7, 6, 5, 0, 1, 2, 3, 4],
    });
    expect(result.baseDirection).toBe('ltr');
    expect(result.logicalToVisual).toEqual([0, 1, 2]);
  });

  it('declares deterministic fallback coverage and diagnoses unimplemented line-break classes', () => {
    const supportedDefaultOther = layoutPatchMapText({ source: 'ЖΩ' });
    const unsupportedLineBreak = layoutPatchMapText({
      source: 'alpha-beta',
      wordWrapWidthPx: 32,
      breakWords: false,
    });

    expect(supportedDefaultOther.profile.semanticCoverage).toBe(
      'patch-map-supported-unicode-subset/1',
    );
    expect(supportedDefaultOther.diagnostics).toEqual([]);
    expect(unsupportedLineBreak.diagnostics).toContainEqual({
      code: 'UNSUPPORTED_LINE_BREAK_CLASS',
      severity: 'unsupported',
      sourceIndex: 5,
      detail: 'U+002D uses a line-break class outside the pinned PatchMap subset',
    });
  });

  it('deep-freezes detached deterministic output and does not mutate options', () => {
    const options: PatchMapTextLayoutOptions = {
      source: 'ABCD',
      contentFrame: { width: 32, height: 20 },
      autoFont: { minPx: 8, maxPx: 18 },
      availableRequestedFonts: ['Unifont'],
    };
    const before = structuredClone(options);
    const first = layoutPatchMapText(options);
    const second = layoutPatchMapText(options);

    expect(options).toEqual(before);
    expect(first).toEqual(second);
    expect(first.layoutSignature).toBe(second.layoutSignature);
    expect(first.contentSignature).toBe(second.contentSignature);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lines)).toBe(true);
    expect(Object.isFrozen(first.layoutBounds)).toBe(true);
    expect(Object.isFrozen(first.fontRuns[0])).toBe(true);
    expect(PATCH_MAP_TEXT_PROFILE).toBe(first.profile);
  });

  it('emits explicit unsupported diagnostics for unpaired surrogates', () => {
    const high = layoutPatchMapText({ source: `A${String.fromCharCode(0xd800)}B` });
    const low = layoutPatchMapText({ source: String.fromCharCode(0xdc00) });

    expect(high.diagnostics).toEqual([
      {
        code: 'UNPAIRED_SURROGATE',
        severity: 'unsupported',
        sourceIndex: 1,
        detail: 'unpaired high surrogate has no Unicode scalar semantic mapping',
      },
    ]);
    expect(low.diagnostics[0]?.code).toBe('UNPAIRED_SURROGATE');
  });

  it('rejects unsupported option branches instead of invoking native behavior', () => {
    let rejection: unknown;
    try {
      layoutPatchMapText({ source: 'A', whiteSpace: 'collapse' as 'preserve' });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(PatchMapTextLayoutError);
    expect(rejection).toMatchObject({
      code: 'UNSUPPORTED_TEXT_OPTION',
      inputPath: '$.whiteSpace',
      detail: 'only preserve whitespace is supported',
    });
    expect(() =>
      layoutPatchMapText({ source: 'A', autoFont: { minPx: 8, maxPx: 18 } }),
    ).toThrow('automatic font sizing requires a content frame');
    expect(() => layoutPatchMapText({ source: 'A', split: 0.5 })).toThrow(
      'UNSUPPORTED_TEXT_OPTION at $.split',
    );
  });

  it('keeps semantic advances independent from normalization and browser raster metrics', () => {
    expect(measurePatchMapGraphemeAdvance('A')).toBe(8);
    expect(measurePatchMapGraphemeAdvance('中')).toBe(16);
    expect(measurePatchMapGraphemeAdvance('😀')).toBe(16);
    expect(measurePatchMapGraphemeAdvance('é')).toBe(8);
    expect(measurePatchMapGraphemeAdvance('👍🏽')).toBe(32);
    expect(measurePatchMapGraphemeAdvance('AB', 8)).toBe(8);
  });

  it('searches a safe-integer automatic-font range logarithmically and returns the exact boundary', () => {
    const startedAt = performance.now();
    const result = layoutPatchMapText({
      source: 'ABCD',
      contentFrame: { width: 32, height: 20 },
      autoFont: { minPx: 1, maxPx: Number.MAX_SAFE_INTEGER },
    });

    expect(result.fontSizePx).toBe(16);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it('keeps automatic-font selection exact with wrapping and negative spacing', () => {
    const source = 'ABCDEFGHIJ';
    const frame = { width: 32, height: 60 } as const;
    const fitting = Array.from({ length: 121 }, (_, index) => index + 8).filter((fontSizePx) => {
      const candidate = layoutPatchMapText({
        source,
        fontSizePx,
        letterSpacingPx: -1,
        wordWrapWidthPx: 32,
        breakWords: true,
      });
      return (
        candidate.naturalLayoutBounds.width <= frame.width &&
        candidate.naturalLayoutBounds.height <= frame.height
      );
    });
    const expected = fitting.at(-1) ?? 8;
    const result = layoutPatchMapText({
      source,
      letterSpacingPx: -1,
      wordWrapWidthPx: 32,
      breakWords: true,
      contentFrame: frame,
      autoFont: { minPx: 8, maxPx: 128 },
    });

    expect(result.fontSizePx).toBe(expected);
  });

  it('pins auto-font wrapping to the frame so a larger rewrap cannot create a fit island', () => {
    const result = layoutPatchMapText({
      source: 'AA AA',
      wordWrapWidthPx: 25,
      breakWords: false,
      contentFrame: { width: 18, height: 100 },
      autoFont: { minPx: 8, maxPx: 64 },
    });

    expect(result.wordWrapWidthPx).toBe(25);
    expect(result.fontSizePx).toBe(12);
    expect(result.naturalLayoutBounds.width).toBeLessThanOrEqual(18);
    expect(result.naturalLayoutBounds.height).toBeLessThanOrEqual(100);
  });

  it('handles adversarial long wrap, neutral bidi, and RI segmentation inputs linearly', () => {
    const startedAt = performance.now();
    const wrapped = layoutPatchMapText({
      source: 'A'.repeat(20_000),
      wordWrapWidthPx: 32,
      breakWords: true,
    });
    const neutrals = layoutPatchMapText({ source: ' '.repeat(20_000) });
    const regionalIndicators = segmentPatchMapGraphemes('🇦'.repeat(20_000));

    expect(wrapped.lineCount).toBe(5_000);
    expect(wrapped.layoutBounds).toEqual({ x: 0, y: 0, width: 32, height: 100_000 });
    expect(neutrals.logicalToVisual).toHaveLength(20_000);
    expect(neutrals.logicalToVisual[0]).toBe(0);
    expect(neutrals.logicalToVisual.at(-1)).toBe(19_999);
    expect(regionalIndicators).toHaveLength(10_000);
    expect(regionalIndicators[0]).toBe('🇦🇦');
    expect(performance.now() - startedAt).toBeLessThan(20_000);
  });

  it('keeps specialized signature streams byte-equivalent to canonical sorted JSON', () => {
    const corpus: readonly PatchMapTextLayoutOptions[] = [
      { source: 'CPU 123' },
      {
        source: '中😀é\nمرحبا',
        requestedFont: 'Missing Sans',
        availableRequestedFonts: [],
        wordWrapWidthPx: 42,
        breakWords: true,
      },
      {
        source: 'AA AA',
        wordWrapWidthPx: 25,
        contentFrame: { width: 18, height: 100 },
        autoFont: { minPx: 8, maxPx: 64 },
        overflow: 'ellipsis',
        origin: { x: 12, y: -4 },
      },
      { source: `A${String.fromCharCode(0xd800)}B` },
      { source: 'quote" slash\\ tab\t separator\u2028' },
    ];

    for (const options of corpus) {
      const result = layoutPatchMapText(options);
      const effectiveWordWrapWidthPx =
        options.autoFont !== undefined &&
        options.contentFrame !== undefined &&
        result.wordWrapWidthPx !== null
          ? Math.min(result.wordWrapWidthPx, options.contentFrame.width)
          : result.wordWrapWidthPx;
      const requestedFontUnavailable =
        options.requestedFont !== undefined &&
        result.sourceFontRuns.some(
          ({ fallbackReason }) => fallbackReason === 'requested-font-unavailable',
        );
      expect(result.contentSignature).toBe(referenceSignature('text-content/v1', {
        source: options.source,
        layoutSource: result.layoutSource,
        visibleText: result.visibleText,
      }));
      expect(result.styleSignature).toBe(referenceSignature('text-style/v1', {
        fontSizePx: result.fontSizePx,
        lineHeightPx: result.lineHeightPx,
        alphabeticBaselinePx: result.alphabeticBaselinePx,
        letterSpacingPx: result.letterSpacingPx,
        requestedFont: options.requestedFont ?? null,
        requestedFontUnavailable,
        split: result.split,
        wordWrapWidthPx: result.wordWrapWidthPx,
        ...(effectiveWordWrapWidthPx !== result.wordWrapWidthPx
          ? { effectiveWordWrapWidthPx }
          : {}),
        breakWords: result.breakWords,
        overflow: result.overflow,
        contentFrame: result.contentFrame,
        rendererRoute: result.rendererRoute,
      }));
      expect(result.layoutSignature).toBe(referenceSignature('text-layout/v1', {
        contentSignature: result.contentSignature,
        styleSignature: result.styleSignature,
        graphemes: result.graphemes,
        lines: result.lines,
        visibleLines: result.visibleLines,
        layoutBounds: result.layoutBounds,
        ownerLocalBounds: result.ownerLocalBounds,
        bidiLines: result.bidiLines,
        fontRuns: result.fontRuns,
        sourceFontRuns: result.sourceFontRuns,
        visibleFontRuns: result.visibleFontRuns,
        diagnostics: result.diagnostics,
      }));
    }
  });

  it('saturates extreme finite arithmetic with an explicit precision diagnostic', () => {
    const result = layoutPatchMapText({
      source: 'AB\nCD',
      fontSizePx: Number.MAX_VALUE,
      lineHeightPx: Number.MAX_VALUE,
      letterSpacingPx: -Number.MAX_VALUE,
      wordWrapWidthPx: Number.MAX_VALUE,
      breakWords: true,
    });

    expect(result.lineAdvancesPx.every(Number.isFinite)).toBe(true);
    expect(result.lineAdvancesPx.every((advance) => advance >= 0)).toBe(true);
    expect(Object.values(result.layoutBounds).every(Number.isFinite)).toBe(true);
    expect(Object.values(result.naturalLayoutBounds).every(Number.isFinite)).toBe(true);
    expect(Object.values(result.ownerLocalBounds).every(Number.isFinite)).toBe(true);
    expect(result.layoutBounds.width).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(result.layoutBounds.height).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.diagnostics).toContainEqual({
      code: 'SEMANTIC_PRECISION_SATURATED',
      severity: 'unsupported',
      detail: `semantic advance exceeded exact precision and saturated at ${String(Number.MAX_SAFE_INTEGER)}`,
    });
  });
});

function referenceSignature(prefix: string, value: unknown): string {
  const source = referenceStableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}`;
}

function referenceStableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(referenceStableSerialize).join(',')}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${referenceStableSerialize(record[key])}`)
    .join(',')}}`;
}
