import {
  PATCH_MAP_TEXT_PROFILE,
  type PatchMapMissingGlyphObservation,
  type PatchMapTextDiagnostic,
  type PatchMapTextFontRun,
  type PatchMapTextLayoutOptions,
  type PatchMapTextRendererRoute,
} from './contracts';
import {
  DEFAULT_BASELINE,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  ELLIPSIS,
  EXPLICIT_MISSING_CODE_POINTS,
  assertFinite,
  assertFiniteNonNegative,
  assertFinitePositive,
  freeze,
  unsupported,
} from './shared';
import {
  scalarTokens,
  segmentPatchMapGraphemes,
} from './segmentation-wrapping';

export interface FontPolicy {
  readonly requestedFont: string | null;
  readonly requestedFontUnavailable: boolean;
}

export function buildFontRuns(input: Readonly<{
  text: string;
  normalizedCarriageReturnIsBoundary: boolean;
  fontSizePx: number;
  autoFont: boolean;
  fontPolicy: FontPolicy;
}>): readonly PatchMapTextFontRun[] {
  const graphemes = segmentPatchMapGraphemes(input.text);
  const runs: PatchMapTextFontRun[] = [];
  let currentText = '';
  let currentFont = '';

  const flush = (): void => {
    if (currentText.length === 0) return;
    runs.push(
      freeze({
        text: currentText,
        font: currentFont,
        ...(input.autoFont ? { fontSizePx: input.fontSizePx } : {}),
        ...(input.fontPolicy.requestedFontUnavailable
          ? { fallbackReason: 'requested-font-unavailable' as const }
          : {}),
      }),
    );
    currentText = '';
    currentFont = '';
  };

  for (const grapheme of graphemes) {
    if (
      input.normalizedCarriageReturnIsBoundary &&
      (grapheme === '\r' || grapheme === '\r\n')
    ) {
      flush();
      continue;
    }
    const font = fontForGrapheme(grapheme, input.fontPolicy);
    if (font !== currentFont && currentText.length > 0) flush();
    currentFont = font;
    currentText += grapheme;
  }
  flush();
  return Object.freeze(runs);
}

function fontForGrapheme(grapheme: string, policy: FontPolicy): string {
  if (grapheme === ELLIPSIS) return PATCH_MAP_TEXT_PROFILE.ellipsisMarker;
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint !== undefined && EXPLICIT_MISSING_CODE_POINTS.has(codePoint)) {
      return PATCH_MAP_TEXT_PROFILE.missingGlyph;
    }
  }
  if (
    policy.requestedFont !== null &&
    policy.requestedFont !== 'Unifont' &&
    !policy.requestedFontUnavailable
  ) {
    return policy.requestedFont;
  }
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint !== undefined && codePoint > 0xffff) return PATCH_MAP_TEXT_PROFILE.upperFont;
  }
  return PATCH_MAP_TEXT_PROFILE.baseFont;
}

export function collectMissingGlyphs(source: string): readonly PatchMapMissingGlyphObservation[] {
  const counts = new Map<number, number>();
  for (const symbol of source) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint !== undefined && EXPLICIT_MISSING_CODE_POINTS.has(codePoint)) {
      counts.set(codePoint, (counts.get(codePoint) ?? 0) + 1);
    }
  }
  return Object.freeze(
    [...counts.entries()].map(([codePoint, count]) =>
      freeze({
        codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        identity: PATCH_MAP_TEXT_PROFILE.missingGlyph,
        count,
      }),
    ),
  );
}

export function chooseRendererRoute(
  visibleText: string,
  fontRuns: readonly PatchMapTextFontRun[],
  advancedStyle: boolean,
): PatchMapTextRendererRoute {
  if (
    !advancedStyle &&
    !visibleText.includes('\n') &&
    /^[\u0020-\u007e]*$/u.test(visibleText) &&
    fontRuns.every(
      (run) =>
        run.font === PATCH_MAP_TEXT_PROFILE.baseFont && run.fallbackReason === undefined,
    )
  ) {
    return 'bitmap-text';
  }
  return 'pixi-text';
}

export function resolveFontPolicy(options: PatchMapTextLayoutOptions): FontPolicy {
  const requestedFont = options.requestedFont ?? null;
  return freeze({
    requestedFont,
    requestedFontUnavailable:
      requestedFont !== null &&
      requestedFont !== 'Unifont' &&
      !(options.availableRequestedFonts ?? []).includes(requestedFont),
  });
}

export function validateOptions(options: PatchMapTextLayoutOptions): void {
  if (typeof options.source !== 'string') unsupported('$.source', 'text source must be a string');
  assertFinitePositive(options.fontSizePx ?? DEFAULT_FONT_SIZE, '$.fontSizePx');
  assertFinitePositive(options.lineHeightPx ?? DEFAULT_LINE_HEIGHT, '$.lineHeightPx');
  assertFiniteNonNegative(options.alphabeticBaselinePx ?? DEFAULT_BASELINE, '$.alphabeticBaselinePx');
  assertFinite(options.letterSpacingPx ?? 0, '$.letterSpacingPx');
  if (!Number.isSafeInteger(options.split ?? 0)) {
    unsupported('$.split', 'split must be a safe integer');
  }
  if (options.wordWrapWidthPx !== undefined && options.wordWrapWidthPx !== null) {
    assertFiniteNonNegative(options.wordWrapWidthPx, '$.wordWrapWidthPx');
  }
  if (options.whiteSpace !== undefined && options.whiteSpace !== 'preserve') {
    unsupported('$.whiteSpace', 'only preserve whitespace is supported');
  }
  if (options.overflow !== undefined && !['visible', 'hidden', 'ellipsis'].includes(options.overflow)) {
    unsupported('$.overflow', 'overflow must be visible, hidden, or ellipsis');
  }
  if (options.contentFrame) {
    assertFiniteNonNegative(options.contentFrame.width, '$.contentFrame.width');
    assertFiniteNonNegative(options.contentFrame.height, '$.contentFrame.height');
  }
  if (options.origin) {
    assertFinite(options.origin.x, '$.origin.x');
    assertFinite(options.origin.y, '$.origin.y');
  }
  if (options.autoFont) {
    if (!Number.isSafeInteger(options.autoFont.minPx) || !Number.isSafeInteger(options.autoFont.maxPx)) {
      unsupported('$.autoFont', 'automatic font bounds must be safe integer pixels');
    }
    if (options.autoFont.minPx <= 0 || options.autoFont.maxPx < options.autoFont.minPx) {
      unsupported('$.autoFont', 'automatic font bounds must be positive and ordered');
    }
    if (!options.contentFrame) {
      unsupported('$.autoFont', 'automatic font sizing requires a content frame');
    }
  }
}

export function collectUnpairedSurrogates(source: string, diagnostics: PatchMapTextDiagnostic[]): void {
  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
      } else {
        diagnostics.push(
          freeze({
            code: 'UNPAIRED_SURROGATE',
            severity: 'unsupported',
            sourceIndex: index,
            detail: 'unpaired high surrogate has no Unicode scalar semantic mapping',
          }),
        );
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      diagnostics.push(
        freeze({
          code: 'UNPAIRED_SURROGATE',
          severity: 'unsupported',
          sourceIndex: index,
          detail: 'unpaired low surrogate has no Unicode scalar semantic mapping',
        }),
      );
    }
  }
}

export function collectSupportDiagnostics(
  options: PatchMapTextLayoutOptions,
  diagnostics: PatchMapTextDiagnostic[],
): void {
  const wrappedSubsetApplies =
    options.wordWrapWidthPx !== undefined &&
    options.wordWrapWidthPx !== null &&
    options.breakWords !== true;
  for (const token of scalarTokens(options.source)) {
    if (token.codePoint >= 0xd800 && token.codePoint <= 0xdfff) continue;
    if (
      token.graphemeClass === 'Control' &&
      token.codePoint !== 0x0009 &&
      token.codePoint !== 0x000a &&
      token.codePoint !== 0x000d
    ) {
      diagnostics.push(
        freeze({
          code: 'UNSUPPORTED_CODE_POINT_CLASS',
          severity: 'unsupported',
          sourceIndex: token.sourceIndex,
          detail: `${formatCodePoint(token.codePoint)} uses a control class outside the pinned PatchMap subset`,
        }),
      );
      continue;
    }
    if (wrappedSubsetApplies && requiresUnimplementedLineBreakClass(token.codePoint)) {
      diagnostics.push(
        freeze({
          code: 'UNSUPPORTED_LINE_BREAK_CLASS',
          severity: 'unsupported',
          sourceIndex: token.sourceIndex,
          detail: `${formatCodePoint(token.codePoint)} uses a line-break class outside the pinned PatchMap subset`,
        }),
      );
    }
  }
}

function requiresUnimplementedLineBreakClass(codePoint: number): boolean {
  return (
    (codePoint >= 0x0021 && codePoint <= 0x002f) ||
    (codePoint >= 0x003a && codePoint <= 0x0040) ||
    (codePoint >= 0x005b && codePoint <= 0x005e) ||
    codePoint === 0x0060 ||
    (codePoint >= 0x007b && codePoint <= 0x007e) ||
    (codePoint >= 0x2000 && codePoint <= 0x206f) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    codePoint > 0xffff
  );
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}
