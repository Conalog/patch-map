import {
  PATCH_MAP_TEXT_PROFILE,
  PatchMapTextLayoutError,
  type PatchMapBidiLine,
  type PatchMapBidiRun,
  type PatchMapMissingGlyphObservation,
  type PatchMapTextAutoFont,
  type PatchMapTextBounds,
  type PatchMapTextDiagnostic,
  type PatchMapTextDirection,
  type PatchMapTextFontRun,
  type PatchMapTextFrame,
  type PatchMapTextLayout,
  type PatchMapTextLayoutOptions,
  type PatchMapTextOverflow,
  type PatchMapTextRendererRoute,
} from './text-layout/contracts';
import { emptyBidiLine, resolveBidiLines } from './text-layout/bidi';
import {
  buildFontRuns,
  chooseRendererRoute,
  collectMissingGlyphs,
  collectSupportDiagnostics,
  collectUnpairedSurrogates,
  resolveFontPolicy,
  validateOptions,
} from './text-layout/font-diagnostics';
import {
  chooseFontSize,
  joinClusters,
  joinRawClusters,
  measurePatchMapGraphemeAdvance,
  produceLayoutCore,
  segmentPatchMapGraphemes,
  semanticPrecisionExceeded,
} from './text-layout/segmentation-wrapping';
import {
  textContentSignature,
  textLayoutSignature,
  textStyleSignature,
} from './text-layout/signatures';
import {
  DEFAULT_BASELINE,
  DEFAULT_FONT_SIZE,
  MAX_SEMANTIC_ADVANCE,
  assertFinite,
  bounds,
  deepFreeze,
  freeze,
  maximum,
  resolveLineHeightPx,
  saturatingMultiply,
} from './text-layout/shared';

/**
 * Produce the browser-independent semantic layout used by parser, hit testing,
 * renderer publication, and expected-blind product probes.
 */
export function layoutPatchMapText(options: PatchMapTextLayoutOptions): PatchMapTextLayout {
  validateOptions(options);
  const diagnostics: PatchMapTextDiagnostic[] = [];
  collectUnpairedSurrogates(options.source, diagnostics);
  collectSupportDiagnostics(options, diagnostics);

  const layoutSource = options.source.replace(/\r\n?/gu, '\n');
  const fontPolicy = resolveFontPolicy(options);
  const split = options.split ?? 0;
  const wordWrapWidthPx = options.wordWrapWidthPx ?? null;
  const contentFrame = options.contentFrame
    ? freeze({ width: options.contentFrame.width, height: options.contentFrame.height })
    : null;
  const effectiveWordWrapWidthPx =
    options.autoFont !== undefined && contentFrame !== null && wordWrapWidthPx !== null
      ? Math.min(wordWrapWidthPx, contentFrame.width)
      : wordWrapWidthPx;
  const breakWords = options.breakWords ?? false;
  const overflow = options.overflow ?? 'visible';
  const letterSpacingPx = options.letterSpacingPx ?? 0;
  const fontSizePx = chooseFontSize(
    options,
    layoutSource,
    options.lineHeightPx,
    letterSpacingPx,
    effectiveWordWrapWidthPx,
  );
  const lineHeightPx = resolveLineHeightPx(fontSizePx, options.lineHeightPx);
  const alphabeticBaselinePx =
    options.alphabeticBaselinePx ?? (fontSizePx / DEFAULT_FONT_SIZE) * DEFAULT_BASELINE;

  const core = produceLayoutCore({
    source: options.source,
    layoutSource,
    split,
    wordWrapWidthPx: effectiveWordWrapWidthPx,
    breakWords,
    overflow,
    contentFrame,
    fontSizePx,
    lineHeightPx,
    letterSpacingPx,
  });
  const naturalWidth = maximum(core.naturalLineAdvancesPx);
  const naturalHeight = saturatingMultiply(core.lines.length, lineHeightPx);
  const width = maximum(core.lineAdvancesPx);
  const height = saturatingMultiply(core.visibleLines.length, lineHeightPx);
  if (
    naturalWidth === MAX_SEMANTIC_ADVANCE ||
    naturalHeight === MAX_SEMANTIC_ADVANCE ||
    width === MAX_SEMANTIC_ADVANCE ||
    height === MAX_SEMANTIC_ADVANCE ||
    core.naturalLineAdvancesPx.includes(MAX_SEMANTIC_ADVANCE) ||
    core.lineAdvancesPx.includes(MAX_SEMANTIC_ADVANCE) ||
    semanticPrecisionExceeded(
      core.layoutGraphemes,
      fontSizePx,
      letterSpacingPx,
      lineHeightPx,
      core.lines.length,
    )
  ) {
    diagnostics.push(
      freeze({
        code: 'SEMANTIC_PRECISION_SATURATED',
        severity: 'unsupported',
        detail: `semantic advance exceeded exact precision and saturated at ${String(MAX_SEMANTIC_ADVANCE)}`,
      }),
    );
  }
  const origin = options.origin ?? { x: 0, y: 0 };
  const naturalLayoutBounds = bounds(0, 0, naturalWidth, naturalHeight);
  const layoutBounds = bounds(0, 0, width, height);
  const ownerLocalBounds = bounds(origin.x, origin.y, width, height);
  const bidiLines = resolveBidiLines(core.lines);
  const bidi = bidiLines[0] ?? emptyBidiLine();
  const missingGlyphs = collectMissingGlyphs(options.source);
  const sourceFontRuns = buildFontRuns({
    text: options.source,
    normalizedCarriageReturnIsBoundary: true,
    fontSizePx,
    autoFont: options.autoFont !== undefined,
    fontPolicy,
  });
  const visibleFontRuns =
    core.visibleText === options.source && !options.source.includes('\r')
      ? sourceFontRuns
      : buildFontRuns({
          text: core.visibleText,
          normalizedCarriageReturnIsBoundary: false,
          fontSizePx,
          autoFont: options.autoFont !== undefined,
          fontPolicy,
        });
  const fontRuns = overflow === 'ellipsis' ? visibleFontRuns : sourceFontRuns;
  const rendererRoute = chooseRendererRoute(
    core.visibleText,
    visibleFontRuns,
    options.advancedStyle ?? false,
  );
  const hardLines = Object.freeze(core.hardLines.map(joinRawClusters));
  const splitLines = Object.freeze(core.splitLines.map(joinRawClusters));
  const lines = Object.freeze(core.lines.map(joinRawClusters));
  const visibleLines = Object.freeze(core.visibleLines.map(joinClusters));
  const frozenDiagnostics = Object.freeze(diagnostics);

  const semanticStyle = {
    fontSizePx,
    lineHeightPx,
    alphabeticBaselinePx,
    letterSpacingPx,
    requestedFont: options.requestedFont ?? null,
    requestedFontUnavailable: fontPolicy.requestedFontUnavailable,
    split,
    wordWrapWidthPx,
    ...(effectiveWordWrapWidthPx !== wordWrapWidthPx ? { effectiveWordWrapWidthPx } : {}),
    breakWords,
    overflow,
    contentFrame,
    rendererRoute,
  };
  const contentSignature = textContentSignature(
    options.source,
    layoutSource,
    core.visibleText,
  );
  const styleSignature = textStyleSignature(semanticStyle);
  const layoutSignature = textLayoutSignature({
    contentSignature,
    styleSignature,
    graphemes: core.sourceGraphemes,
    lines,
    visibleLines,
    layoutBounds,
    ownerLocalBounds,
    bidiLines,
    fontRuns,
    sourceFontRuns,
    visibleFontRuns,
    diagnostics: frozenDiagnostics,
  });

  return Object.freeze({
    profile: PATCH_MAP_TEXT_PROFILE,
    source: options.source,
    layoutSource,
    sourcePreserved: true,
    unicodeNormalizationApplied: false,
    graphemes: core.sourceGraphemes,
    layoutGraphemes: core.layoutGraphemes,
    hardLines,
    splitLines,
    lines,
    visibleLines,
    visibleText: core.visibleText,
    lineCount: core.lines.length,
    baseDirection: bidi.baseDirection,
    bidiRunsLogical: bidi.logicalRuns,
    bidiRunsVisualOrder: bidi.visualRuns,
    logicalToVisual: bidi.logicalToVisual,
    bidiLines,
    fontRuns,
    sourceFontRuns,
    visibleFontRuns,
    missingGlyphs,
    fontSizePx,
    lineHeightPx,
    alphabeticBaselinePx,
    letterSpacingPx,
    split,
    wordWrapWidthPx,
    breakWords,
    overflow,
    contentFrame,
    naturalLayoutBounds,
    layoutBounds,
    ownerLocalBounds,
    lineAdvancesPx: core.lineAdvancesPx,
    rendererRoute,
    contentSignature,
    styleSignature,
    layoutSignature,
    diagnostics: frozenDiagnostics,
  });
}

/**
 * Relocate an already-computed semantic layout without repeating Unicode,
 * wrapping, bidi, font-run, or overflow work. The signature payload is shared
 * with layoutPatchMapText so this is exactly equivalent to supplying origin on
 * the original call.
 */
export function relocatePatchMapTextLayout(
  layout: PatchMapTextLayout,
  origin: Readonly<{ x: number; y: number }>,
): PatchMapTextLayout {
  assertFinite(origin.x, '$.origin.x');
  assertFinite(origin.y, '$.origin.y');
  if (
    layout.ownerLocalBounds.x === origin.x &&
    layout.ownerLocalBounds.y === origin.y
  ) {
    return layout;
  }
  const ownerLocalBounds = bounds(
    origin.x,
    origin.y,
    layout.layoutBounds.width,
    layout.layoutBounds.height,
  );
  const layoutSignature = textLayoutSignature({
    contentSignature: layout.contentSignature,
    styleSignature: layout.styleSignature,
    graphemes: layout.graphemes,
    lines: layout.lines,
    visibleLines: layout.visibleLines,
    layoutBounds: layout.layoutBounds,
    ownerLocalBounds,
    bidiLines: layout.bidiLines,
    fontRuns: layout.fontRuns,
    sourceFontRuns: layout.sourceFontRuns,
    visibleFontRuns: layout.visibleFontRuns,
    diagnostics: layout.diagnostics,
  });
  return deepFreeze({
    ...layout,
    ownerLocalBounds,
    layoutSignature,
  });
}

export {
  PATCH_MAP_TEXT_PROFILE,
  PatchMapTextLayoutError,
  measurePatchMapGraphemeAdvance,
  segmentPatchMapGraphemes,
};
export type {
  PatchMapBidiLine,
  PatchMapBidiRun,
  PatchMapMissingGlyphObservation,
  PatchMapTextAutoFont,
  PatchMapTextBounds,
  PatchMapTextDiagnostic,
  PatchMapTextDirection,
  PatchMapTextFontRun,
  PatchMapTextFrame,
  PatchMapTextLayout,
  PatchMapTextLayoutOptions,
  PatchMapTextOverflow,
  PatchMapTextRendererRoute,
};
