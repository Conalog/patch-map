import {
  CORE_V2_UNICODE_VERSION,
  coreV2GraphemeBreakClass,
  coreV2IsExtendedPictographic,
  coreV2IsFullWidth,
  coreV2IsHardBreak,
  coreV2IsLtrStrong,
  coreV2IsRtlStrong,
  coreV2IsZeroAdvance,
  type CoreV2GraphemeBreakClass,
} from './unicode-text-data';

export const CORE_V2_TEXT_PROFILE = Object.freeze({
  id: 'core-v2-unicode-cell-fonts/1',
  unicodeVersion: CORE_V2_UNICODE_VERSION,
  grapheme: 'UAX-29-revision-45',
  lineBreak: 'UAX-14-revision-53-default-with-CJ-as-NS',
  bidi: 'UAX-9-revision-50',
  locale: 'und',
  baseDirection: 'auto',
  sourceNormalization: 'none',
  layoutLineEndingNormalization: 'CRLF-and-CR-to-LF',
  semanticCoverage: 'core-v2-contract-declared-subset/1',
  scalarFallback: 'valid-scalars-default-to-atomic-other',
  lineBreakCoverage: 'hard-break-preserved-space-ideographic-and-explicit-breakWords',
  supplementaryAdvanceUnit: 'per-nonzero-scalar-inside-grapheme',
  baseFont: 'unifont-base-16.0.04',
  upperFont: 'unifont-upper-16.0.04',
  missingGlyph: 'core-v2-missing-glyph-box/1',
  ellipsisMarker: 'core-v2-ellipsis-marker/1',
} as const);

export type CoreV2TextOverflow = 'visible' | 'hidden' | 'ellipsis';
export type CoreV2TextDirection = 'ltr' | 'rtl';
export type CoreV2TextRendererRoute = 'bitmap-text' | 'fallback-text';
export type CoreV2TextBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export interface CoreV2TextFrame {
  readonly width: number;
  readonly height: number;
}

export interface CoreV2TextAutoFont {
  readonly minPx: number;
  readonly maxPx: number;
}

export interface CoreV2TextLayoutOptions {
  readonly source: string;
  readonly fontSizePx?: number;
  readonly lineHeightPx?: number;
  readonly alphabeticBaselinePx?: number;
  readonly letterSpacingPx?: number;
  readonly requestedFont?: string;
  readonly availableRequestedFonts?: readonly string[];
  readonly split?: number;
  readonly wordWrapWidthPx?: number | null;
  readonly breakWords?: boolean;
  readonly whiteSpace?: 'preserve';
  readonly contentFrame?: CoreV2TextFrame;
  readonly overflow?: CoreV2TextOverflow;
  readonly autoFont?: CoreV2TextAutoFont;
  readonly origin?: Readonly<{ x: number; y: number }>;
  readonly advancedStyle?: boolean;
}

export interface CoreV2TextDiagnostic {
  readonly code:
    | 'UNPAIRED_SURROGATE'
    | 'SEMANTIC_PRECISION_SATURATED'
    | 'UNSUPPORTED_CODE_POINT_CLASS'
    | 'UNSUPPORTED_LINE_BREAK_CLASS'
    | 'UNSUPPORTED_TEXT_OPTION';
  readonly severity: 'unsupported';
  readonly sourceIndex?: number;
  readonly detail: string;
}

/** Structured rejection for an option outside the pinned semantic profile. */
export class CoreV2TextLayoutError extends TypeError {
  public readonly code = 'UNSUPPORTED_TEXT_OPTION' as const;
  public readonly inputPath: string;
  public readonly detail: string;

  public constructor(inputPath: string, detail: string) {
    super(`UNSUPPORTED_TEXT_OPTION at ${inputPath}: ${detail}`);
    this.name = 'CoreV2TextLayoutError';
    this.inputPath = inputPath;
    this.detail = detail;
  }
}

export interface CoreV2TextFontRun {
  readonly text: string;
  readonly font: string;
  readonly fontSizePx?: number;
  readonly fallbackReason?: 'requested-font-unavailable';
}

export interface CoreV2MissingGlyphObservation {
  readonly codePoint: string;
  readonly identity: 'core-v2-missing-glyph-box/1';
  readonly count: number;
}

export interface CoreV2BidiRun {
  readonly text: string;
  readonly level: number;
  readonly direction: CoreV2TextDirection;
  readonly logicalStart: number;
  readonly logicalEnd: number;
}

export interface CoreV2BidiLine {
  readonly lineIndex: number;
  readonly source: string;
  readonly baseDirection: CoreV2TextDirection;
  readonly logicalRuns: readonly CoreV2BidiRun[];
  readonly visualRuns: readonly CoreV2BidiRun[];
  readonly logicalToVisual: readonly number[];
}

export interface CoreV2TextLayout {
  readonly profile: typeof CORE_V2_TEXT_PROFILE;
  readonly source: string;
  readonly layoutSource: string;
  readonly sourcePreserved: true;
  readonly unicodeNormalizationApplied: false;
  readonly graphemes: readonly string[];
  readonly layoutGraphemes: readonly string[];
  readonly hardLines: readonly string[];
  readonly splitLines: readonly string[];
  readonly lines: readonly string[];
  readonly visibleLines: readonly string[];
  readonly visibleText: string;
  readonly lineCount: number;
  readonly baseDirection: CoreV2TextDirection;
  readonly bidiRunsLogical: readonly CoreV2BidiRun[];
  readonly bidiRunsVisualOrder: readonly CoreV2BidiRun[];
  readonly logicalToVisual: readonly number[];
  /** Authoritative bidi observations for every normalized/split/wrapped line. */
  readonly bidiLines: readonly CoreV2BidiLine[];
  /** Contract corpus font coverage of authored content (ellipsis uses rendered content). */
  readonly fontRuns: readonly CoreV2TextFontRun[];
  /** Authored-source font coverage; CR/CRLF layout conversion creates a run boundary. */
  readonly sourceFontRuns: readonly CoreV2TextFontRun[];
  /** Font runs for exactly the visible, LF-normalized renderer payload. */
  readonly visibleFontRuns: readonly CoreV2TextFontRun[];
  readonly missingGlyphs: readonly CoreV2MissingGlyphObservation[];
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly alphabeticBaselinePx: number;
  readonly letterSpacingPx: number;
  readonly split: number;
  readonly wordWrapWidthPx: number | null;
  readonly breakWords: boolean;
  readonly overflow: CoreV2TextOverflow;
  readonly contentFrame: CoreV2TextFrame | null;
  readonly naturalLayoutBounds: CoreV2TextBounds;
  readonly layoutBounds: CoreV2TextBounds;
  readonly ownerLocalBounds: CoreV2TextBounds;
  readonly lineAdvancesPx: readonly number[];
  readonly rendererRoute: CoreV2TextRendererRoute;
  readonly contentSignature: string;
  readonly styleSignature: string;
  readonly layoutSignature: string;
  readonly diagnostics: readonly CoreV2TextDiagnostic[];
}

interface ScalarToken {
  readonly text: string;
  readonly codePoint: number;
  readonly sourceIndex: number;
  readonly graphemeClass: CoreV2GraphemeBreakClass;
  readonly extendedPictographic: boolean;
}

interface LayoutCore {
  readonly sourceGraphemes: readonly string[];
  readonly layoutGraphemes: readonly string[];
  readonly hardLines: readonly (readonly string[])[];
  readonly splitLines: readonly (readonly string[])[];
  readonly lines: readonly (readonly string[])[];
  readonly visibleLines: readonly (readonly string[])[];
  readonly visibleText: string;
  readonly lineAdvancesPx: readonly number[];
  readonly naturalLineAdvancesPx: readonly number[];
  readonly truncated: boolean;
}

interface FontPolicy {
  readonly requestedFont: string | null;
  readonly requestedFontUnavailable: boolean;
}

interface LineMetrics {
  readonly graphemeCount: number;
  readonly letterSpacingPx: number;
  readonly prefixPositions: readonly number[];
  readonly monotonic: boolean;
  readonly minimumTree: readonly number[] | null;
  readonly minimumTreeLeafCount: number;
}

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 20;
const DEFAULT_BASELINE = 16;
const ELLIPSIS = '…';
const MISSING_GLYPH_BOX = '□';
const EXPLICIT_MISSING_CODE_POINTS = new Set([0x10ffff]);
const MAX_SEMANTIC_ADVANCE = Number.MAX_SAFE_INTEGER;

/**
 * Produce the browser-independent semantic layout used by parser, hit testing,
 * renderer publication, and expected-blind product probes.
 */
export function layoutCoreV2Text(options: CoreV2TextLayoutOptions): CoreV2TextLayout {
  validateOptions(options);
  const diagnostics: CoreV2TextDiagnostic[] = [];
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
  const lineHeightPx = options.lineHeightPx ?? DEFAULT_LINE_HEIGHT;
  const fontSizePx = chooseFontSize(
    options,
    layoutSource,
    lineHeightPx,
    letterSpacingPx,
    effectiveWordWrapWidthPx,
  );
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
  const visibleFontRuns = buildFontRuns({
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
  const contentSignature = signature('text-content/v1', {
    source: options.source,
    layoutSource,
    visibleText: core.visibleText,
  });
  const styleSignature = signature('text-style/v1', semanticStyle);
  const layoutSignature = signature('text-layout/v1', {
    contentSignature,
    styleSignature,
    graphemes: core.sourceGraphemes,
    lines: core.lines.map(joinRawClusters),
    visibleLines: core.visibleLines.map(joinClusters),
    layoutBounds,
    ownerLocalBounds,
    bidiLines,
    fontRuns,
    sourceFontRuns,
    visibleFontRuns,
    diagnostics,
  });

  return deepFreeze({
    profile: CORE_V2_TEXT_PROFILE,
    source: options.source,
    layoutSource,
    sourcePreserved: true,
    unicodeNormalizationApplied: false,
    graphemes: core.sourceGraphemes,
    layoutGraphemes: core.layoutGraphemes,
    hardLines: core.hardLines.map(joinRawClusters),
    splitLines: core.splitLines.map(joinRawClusters),
    lines: core.lines.map(joinRawClusters),
    visibleLines: core.visibleLines.map(joinClusters),
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
    diagnostics,
  });
}

/** Deterministic UAX-29-profile segmentation with no host ICU dependency. */
export function segmentCoreV2Graphemes(source: string): readonly string[] {
  const tokens = scalarTokens(source);
  if (tokens.length === 0) return Object.freeze([]);
  const result: string[] = [];
  let cluster = tokens[0]?.text ?? '';
  let regionalIndicatorRunLength =
    tokens[0]?.graphemeClass === 'RegionalIndicator' ? 1 : 0;

  for (let index = 1; index < tokens.length; index += 1) {
    const current = tokens[index];
    const previous = tokens[index - 1];
    if (!current || !previous) continue;
    if (
      hasGraphemeBreak(
        tokens,
        index,
        previous,
        current,
        regionalIndicatorRunLength,
      )
    ) {
      result.push(cluster);
      cluster = current.text;
    } else {
      cluster += current.text;
    }
    regionalIndicatorRunLength =
      current.graphemeClass === 'RegionalIndicator'
        ? previous.graphemeClass === 'RegionalIndicator'
          ? regionalIndicatorRunLength + 1
          : 1
        : 0;
  }
  result.push(cluster);
  return Object.freeze(result);
}

/** Semantic advance for one grapheme at a selected profile size. */
export function measureCoreV2GraphemeAdvance(grapheme: string, fontSizePx = 16): number {
  assertFiniteNonNegative(fontSizePx, '$.fontSizePx');
  let units = 0;
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined || codePoint === 0x000a || codePoint === 0x000d) continue;
    if (coreV2IsZeroAdvance(codePoint)) continue;
    if (EXPLICIT_MISSING_CODE_POINTS.has(codePoint)) {
      units += 16;
    } else {
      // The immutable observation records supplementary advance per non-zero
      // scalar inside a grapheme: four family pictographs plus thumb/modifier
      // therefore remain 96 px even though they form two grapheme clusters.
      units += coreV2IsFullWidth(codePoint) ? 16 : 8;
    }
  }
  return saturatingMultiply(units, fontSizePx / DEFAULT_FONT_SIZE);
}

function produceLayoutCore(input: Readonly<{
  source: string;
  layoutSource: string;
  split: number;
  wordWrapWidthPx: number | null;
  breakWords: boolean;
  overflow: CoreV2TextOverflow;
  contentFrame: CoreV2TextFrame | null;
  fontSizePx: number;
  lineHeightPx: number;
  letterSpacingPx: number;
}>): LayoutCore {
  const sourceGraphemes = segmentCoreV2Graphemes(input.source);
  const layoutGraphemes = segmentCoreV2Graphemes(input.layoutSource);
  const hardLines = splitHardLines(layoutGraphemes);
  const splitLines = splitByCount(hardLines, input.split);
  const lines = input.wordWrapWidthPx === null
    ? splitLines
    : splitLines.flatMap((line) =>
        wrapLine(
          line,
          input.wordWrapWidthPx ?? 0,
          input.breakWords,
          input.fontSizePx,
          input.letterSpacingPx,
        ),
      );
  const naturalLineAdvancesPx = lines.map((line) =>
    measureLine(line, input.fontSizePx, input.letterSpacingPx),
  );
  const overflowResult = applyOverflow(
    lines,
    input.overflow,
    input.contentFrame,
    input.fontSizePx,
    input.lineHeightPx,
    input.letterSpacingPx,
  );
  const lineAdvancesPx = overflowResult.lines.map((line) =>
    measureLine(line, input.fontSizePx, input.letterSpacingPx),
  );
  return deepFreeze({
    sourceGraphemes,
    layoutGraphemes,
    hardLines,
    splitLines,
    lines,
    visibleLines: overflowResult.lines,
    visibleText: overflowResult.lines.map(joinClusters).join('\n'),
    lineAdvancesPx,
    naturalLineAdvancesPx,
    truncated: overflowResult.truncated,
  });
}

function chooseFontSize(
  options: CoreV2TextLayoutOptions,
  layoutSource: string,
  lineHeightPx: number,
  letterSpacingPx: number,
  effectiveWordWrapWidthPx: number | null,
): number {
  if (!options.autoFont) return options.fontSizePx ?? DEFAULT_FONT_SIZE;
  const { minPx, maxPx } = options.autoFont;
  if (
    !autoFontCandidateFits(
      options,
      layoutSource,
      lineHeightPx,
      letterSpacingPx,
      effectiveWordWrapWidthPx,
      minPx,
    )
  ) {
    return minPx;
  }
  let lower = minPx;
  let upper = maxPx;
  while (lower < upper) {
    const candidate = lower + Math.floor((upper - lower + 1) / 2);
    if (
      autoFontCandidateFits(
        options,
        layoutSource,
        lineHeightPx,
        letterSpacingPx,
        effectiveWordWrapWidthPx,
        candidate,
      )
    ) {
      lower = candidate;
    } else {
      upper = candidate - 1;
    }
  }
  return lower;
}

function autoFontCandidateFits(
  options: CoreV2TextLayoutOptions,
  layoutSource: string,
  lineHeightPx: number,
  letterSpacingPx: number,
  effectiveWordWrapWidthPx: number | null,
  candidate: number,
): boolean {
  const core = produceLayoutCore({
    source: options.source,
    layoutSource,
    split: options.split ?? 0,
    wordWrapWidthPx: effectiveWordWrapWidthPx,
    breakWords: options.breakWords ?? false,
    overflow: 'visible',
    contentFrame: null,
    fontSizePx: candidate,
    lineHeightPx,
    letterSpacingPx,
  });
  const boundsWidth = maximum(core.naturalLineAdvancesPx);
  const boundsHeight = saturatingMultiply(core.lines.length, lineHeightPx);
  return (
    options.contentFrame !== undefined &&
    boundsWidth <= options.contentFrame.width &&
    boundsHeight <= options.contentFrame.height
  );
}

function hasGraphemeBreak(
  tokens: readonly ScalarToken[],
  index: number,
  previous: ScalarToken,
  current: ScalarToken,
  regionalIndicatorRunLength: number,
): boolean {
  const a = previous.graphemeClass;
  const b = current.graphemeClass;
  if (a === 'CR' && b === 'LF') return false;
  if (a === 'CR' || a === 'LF' || a === 'Control') return true;
  if (b === 'CR' || b === 'LF' || b === 'Control') return true;
  if (a === 'L' && (b === 'L' || b === 'V' || b === 'LV' || b === 'LVT')) return false;
  if ((a === 'LV' || a === 'V') && (b === 'V' || b === 'T')) return false;
  if ((a === 'LVT' || a === 'T') && b === 'T') return false;
  if (b === 'Extend' || b === 'ZWJ' || b === 'SpacingMark') return false;
  if (a === 'Prepend') return false;
  if (current.extendedPictographic && followsExtendedPictographicZwj(tokens, index)) return false;
  if (a === 'RegionalIndicator' && b === 'RegionalIndicator') {
    return regionalIndicatorRunLength % 2 === 0;
  }
  return true;
}

function followsExtendedPictographicZwj(tokens: readonly ScalarToken[], index: number): boolean {
  let cursor = index - 1;
  if (tokens[cursor]?.graphemeClass !== 'ZWJ') return false;
  cursor -= 1;
  while (cursor >= 0 && tokens[cursor]?.graphemeClass === 'Extend') cursor -= 1;
  return cursor >= 0 && tokens[cursor]?.extendedPictographic === true;
}

function scalarTokens(source: string): readonly ScalarToken[] {
  const tokens: ScalarToken[] = [];
  let sourceIndex = 0;
  for (const symbol of source) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    tokens.push({
      text: symbol,
      codePoint,
      sourceIndex,
      graphemeClass: coreV2GraphemeBreakClass(codePoint),
      extendedPictographic: coreV2IsExtendedPictographic(codePoint),
    });
    sourceIndex += symbol.length;
  }
  return Object.freeze(tokens);
}

function splitHardLines(graphemes: readonly string[]): readonly (readonly string[])[] {
  const lines: string[][] = [[]];
  for (const grapheme of graphemes) {
    if (coreV2IsHardBreak(grapheme)) {
      lines.push([]);
    } else {
      lines[lines.length - 1]?.push(grapheme);
    }
  }
  return Object.freeze(lines.map((line) => Object.freeze(line)));
}

function splitByCount(
  hardLines: readonly (readonly string[])[],
  split: number,
): readonly (readonly string[])[] {
  if (split <= 0) return hardLines;
  const result: (readonly string[])[] = [];
  for (const line of hardLines) {
    if (line.length === 0) {
      result.push(Object.freeze([]));
      continue;
    }
    for (let start = 0; start < line.length; start += split) {
      result.push(Object.freeze(line.slice(start, start + split)));
    }
  }
  return Object.freeze(result);
}

function wrapLine(
  line: readonly string[],
  width: number,
  breakWords: boolean,
  fontSizePx: number,
  letterSpacingPx: number,
): readonly (readonly string[])[] {
  if (line.length === 0) return Object.freeze([Object.freeze([])]);
  const metrics = createLineMetrics(line, fontSizePx, letterSpacingPx);
  const lastBreakAtOrBefore = buildLastBreakIndex(line);
  const result: (readonly string[])[] = [];
  let start = 0;

  while (start < line.length) {
    const acceptedEnd = largestFittingEnd(metrics, start, width, true);
    if (acceptedEnd >= line.length) {
      result.push(Object.freeze(line.slice(start)));
      break;
    }

    const next = line[acceptedEnd];
    let boundary = lastBreakAtOrBefore[acceptedEnd] ?? 0;
    if (
      boundary <= start &&
      (breakWords || canBreakBetween(line[acceptedEnd - 1], next))
    ) {
      boundary = acceptedEnd;
    }
    if (boundary <= start) {
      result.push(Object.freeze(line.slice(start)));
      break;
    }
    result.push(Object.freeze(line.slice(start, boundary)));
    start = boundary;
  }
  return Object.freeze(result);
}

function buildLastBreakIndex(graphemes: readonly string[]): readonly number[] {
  const result = new Array<number>(graphemes.length + 1).fill(0);
  let lastBreak = 0;
  for (let boundary = 1; boundary < graphemes.length; boundary += 1) {
    if (canBreakBetween(graphemes[boundary - 1], graphemes[boundary])) {
      lastBreak = boundary;
    }
    result[boundary] = lastBreak;
  }
  result[graphemes.length] = lastBreak;
  return Object.freeze(result);
}

function canBreakBetween(previous: string | undefined, current: string | undefined): boolean {
  if (!previous || !current) return false;
  if (/^[ \t]$/u.test(previous)) return true;
  return isCjkBreakCluster(previous) && isCjkBreakCluster(current);
}

function isCjkBreakCluster(grapheme: string): boolean {
  const first = grapheme.codePointAt(0);
  return first !== undefined && coreV2IsFullWidth(first) && first <= 0xffff;
}

function applyOverflow(
  lines: readonly (readonly string[])[],
  overflow: CoreV2TextOverflow,
  frame: CoreV2TextFrame | null,
  fontSizePx: number,
  lineHeightPx: number,
  letterSpacingPx: number,
): Readonly<{ lines: readonly (readonly string[])[]; truncated: boolean }> {
  if (overflow === 'visible' || frame === null) {
    return deepFreeze({ lines, truncated: false });
  }
  const maxLines = Math.floor(frame.height / lineHeightPx);
  if (maxLines <= 0) return deepFreeze({ lines: [], truncated: lines.length > 0 });
  const selected = lines.slice(0, maxLines).map((line) => [...line]);
  let truncated = selected.length < lines.length;
  for (let index = 0; index < selected.length; index += 1) {
    const line = selected[index];
    if (!line) continue;
    const clipped = largestFittingPrefix(line, frame.width, fontSizePx, letterSpacingPx);
    if (clipped.length !== line.length) truncated = true;
    selected[index] = clipped;
  }
  if (overflow === 'ellipsis' && truncated && selected.length > 0) {
    const lastIndex = selected.length - 1;
    const last = selected[lastIndex] ?? [];
    const markerWidth = measureCoreV2GraphemeAdvance(ELLIPSIS, fontSizePx);
    if (markerWidth <= frame.width) {
      const prefixBudget = Math.max(
        0,
        saturatingSubtract(
          saturatingSubtract(frame.width, markerWidth),
          letterSpacingPx,
        ),
      );
      const prefix = largestFittingPrefix(
        last,
        prefixBudget,
        fontSizePx,
        letterSpacingPx,
      );
      selected[lastIndex] = [...prefix, ELLIPSIS];
    } else {
      selected[lastIndex] = [];
    }
  }
  return deepFreeze({ lines: selected, truncated });
}

function largestFittingPrefix(
  line: readonly string[],
  width: number,
  fontSizePx: number,
  letterSpacingPx: number,
): string[] {
  const metrics = createLineMetrics(line, fontSizePx, letterSpacingPx);
  return line.slice(0, largestFittingEnd(metrics, 0, width, false));
}

function measureLine(
  graphemes: readonly string[],
  fontSizePx: number,
  letterSpacingPx: number,
): number {
  let advances = 0;
  for (const grapheme of graphemes) {
    advances = saturatingAdd(
      advances,
      measureCoreV2GraphemeAdvance(grapheme, fontSizePx),
    );
  }
  return Math.max(
    0,
    saturatingAdd(
      advances,
      saturatingMultiply(Math.max(0, graphemes.length - 1), letterSpacingPx),
    ),
  );
}

function createLineMetrics(
  graphemes: readonly string[],
  fontSizePx: number,
  letterSpacingPx: number,
): LineMetrics {
  const prefixPositions = new Array<number>(graphemes.length + 1).fill(0);
  let advanceSum = 0;
  let monotonic = true;
  for (let index = 0; index < graphemes.length; index += 1) {
    advanceSum = saturatingAdd(
      advanceSum,
      measureCoreV2GraphemeAdvance(graphemes[index] ?? '', fontSizePx),
    );
    const position = saturatingAdd(
      advanceSum,
      saturatingMultiply(index + 1, letterSpacingPx),
    );
    prefixPositions[index + 1] = position;
    if (position < (prefixPositions[index] ?? 0)) monotonic = false;
  }
  const minimumTreeResult = monotonic
    ? { tree: null, leafCount: 0 }
    : buildRangeMinimumTree(prefixPositions);
  return freeze({
    graphemeCount: graphemes.length,
    letterSpacingPx,
    prefixPositions: Object.freeze(prefixPositions),
    monotonic,
    minimumTree: minimumTreeResult.tree,
    minimumTreeLeafCount: minimumTreeResult.leafCount,
  });
}

function largestFittingEnd(
  metrics: LineMetrics,
  start: number,
  width: number,
  forceOneGrapheme: boolean,
): number {
  const first = start + 1;
  if (first > metrics.graphemeCount) return start;
  if (metrics.monotonic) {
    if (measureLineRange(metrics, start, first) > width) {
      return forceOneGrapheme ? first : start;
    }
    let lower = first;
    let upper = metrics.graphemeCount;
    while (lower < upper) {
      const candidate = lower + Math.floor((upper - lower + 1) / 2);
      if (measureLineRange(metrics, start, candidate) <= width) {
        lower = candidate;
      } else {
        upper = candidate - 1;
      }
    }
    return lower;
  }

  const threshold = saturatingAdd(
    saturatingAdd(width, metrics.prefixPositions[start] ?? 0),
    metrics.letterSpacingPx,
  );
  const candidate = findRightmostPositionAtMost(metrics, first, threshold);
  if (candidate < first) return forceOneGrapheme ? first : start;
  return candidate;
}

function measureLineRange(metrics: LineMetrics, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.max(
    0,
    saturatingAdd(
      saturatingSubtract(
        metrics.prefixPositions[end] ?? 0,
        metrics.prefixPositions[start] ?? 0,
      ),
      -metrics.letterSpacingPx,
    ),
  );
}

function buildRangeMinimumTree(
  values: readonly number[],
): Readonly<{ tree: readonly number[]; leafCount: number }> {
  let leafCount = 1;
  while (leafCount < values.length) leafCount *= 2;
  const tree = new Array<number>(leafCount * 2).fill(Number.POSITIVE_INFINITY);
  for (let index = 0; index < values.length; index += 1) {
    tree[leafCount + index] = values[index] ?? Number.POSITIVE_INFINITY;
  }
  for (let index = leafCount - 1; index > 0; index -= 1) {
    tree[index] = Math.min(
      tree[index * 2] ?? Number.POSITIVE_INFINITY,
      tree[index * 2 + 1] ?? Number.POSITIVE_INFINITY,
    );
  }
  return freeze({ tree: Object.freeze(tree), leafCount });
}

function findRightmostPositionAtMost(
  metrics: LineMetrics,
  queryStart: number,
  threshold: number,
): number {
  if (metrics.minimumTree === null) return -1;
  return findRightmostTreeValue(
    metrics.minimumTree,
    metrics.minimumTreeLeafCount,
    1,
    0,
    metrics.minimumTreeLeafCount,
    queryStart,
    metrics.graphemeCount + 1,
    threshold,
  );
}

function findRightmostTreeValue(
  tree: readonly number[],
  leafCount: number,
  node: number,
  nodeStart: number,
  nodeEnd: number,
  queryStart: number,
  queryEnd: number,
  threshold: number,
): number {
  if (
    nodeEnd <= queryStart ||
    nodeStart >= queryEnd ||
    (tree[node] ?? Number.POSITIVE_INFINITY) > threshold
  ) {
    return -1;
  }
  if (node >= leafCount) return nodeStart;
  const middle = nodeStart + Math.floor((nodeEnd - nodeStart) / 2);
  const right = findRightmostTreeValue(
    tree,
    leafCount,
    node * 2 + 1,
    middle,
    nodeEnd,
    queryStart,
    queryEnd,
    threshold,
  );
  if (right >= 0) return right;
  return findRightmostTreeValue(
    tree,
    leafCount,
    node * 2,
    nodeStart,
    middle,
    queryStart,
    queryEnd,
    threshold,
  );
}

function resolveBidiLines(
  lines: readonly (readonly string[])[],
): readonly CoreV2BidiLine[] {
  return Object.freeze(
    lines.map((line, lineIndex) => {
      const resolved = resolveBidi(line);
      return deepFreeze({
        lineIndex,
        source: line.join(''),
        baseDirection: resolved.baseDirection,
        logicalRuns: resolved.logicalRuns,
        visualRuns: resolved.visualRuns,
        logicalToVisual: resolved.logicalToVisual,
      });
    }),
  );
}

function emptyBidiLine(): CoreV2BidiLine {
  return deepFreeze({
    lineIndex: 0,
    source: '',
    baseDirection: 'ltr',
    logicalRuns: [],
    visualRuns: [],
    logicalToVisual: [],
  });
}

function resolveBidi(graphemes: readonly string[]): Readonly<{
  baseDirection: CoreV2TextDirection;
  logicalRuns: readonly CoreV2BidiRun[];
  visualRuns: readonly CoreV2BidiRun[];
  logicalToVisual: readonly number[];
}> {
  const content = graphemes.filter((grapheme) => !coreV2IsHardBreak(grapheme));
  const baseDirection = automaticBaseDirection(content);
  const baseLevel = baseDirection === 'rtl' ? 1 : 0;
  const strongDirections = content.map(clusterStrongDirection);
  const resolvedDirections = resolveNeutralDirections(strongDirections, baseDirection);
  const levels = resolvedDirections.map((resolved) => {
    if (baseLevel === 0) return resolved === 'rtl' ? 1 : 0;
    return resolved === 'ltr' ? 2 : 1;
  });
  const logicalRuns: CoreV2BidiRun[] = [];
  let start = 0;
  while (start < content.length) {
    const level = levels[start] ?? baseLevel;
    let end = start + 1;
    while (end < content.length && levels[end] === level) end += 1;
    logicalRuns.push(
      freeze({
        text: content.slice(start, end).join(''),
        level,
        direction: level % 2 === 0 ? 'ltr' : 'rtl',
        logicalStart: start,
        logicalEnd: end,
      }),
    );
    start = end;
  }

  const visualLogicalIndexes = content.map((_, index) => index);
  const maxLevel = maximum(levels);
  const oddLevels = levels.filter((level) => level % 2 === 1);
  const lowestOddLevel = oddLevels.length > 0 ? Math.min(...oddLevels) : Number.POSITIVE_INFINITY;
  for (let level = maxLevel; level >= lowestOddLevel; level -= 1) {
    let cursor = 0;
    while (cursor < visualLogicalIndexes.length) {
      while (cursor < visualLogicalIndexes.length && (levels[visualLogicalIndexes[cursor] ?? -1] ?? 0) < level) {
        cursor += 1;
      }
      const runStart = cursor;
      while (cursor < visualLogicalIndexes.length && (levels[visualLogicalIndexes[cursor] ?? -1] ?? 0) >= level) {
        cursor += 1;
      }
      reverseRange(visualLogicalIndexes, runStart, cursor);
    }
  }
  const logicalToVisual = new Array<number>(content.length).fill(0);
  visualLogicalIndexes.forEach((logicalIndex, visualIndex) => {
    logicalToVisual[logicalIndex] = visualIndex;
  });
  const visualRuns = [...logicalRuns].sort(
    (left, right) =>
      minimumVisualIndex(left, logicalToVisual) - minimumVisualIndex(right, logicalToVisual),
  );
  return deepFreeze({ baseDirection, logicalRuns, visualRuns, logicalToVisual });
}

function automaticBaseDirection(graphemes: readonly string[]): CoreV2TextDirection {
  for (const grapheme of graphemes) {
    const direction = clusterStrongDirection(grapheme);
    if (direction) return direction;
  }
  return 'ltr';
}

function clusterStrongDirection(grapheme: string): CoreV2TextDirection | null {
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    if (coreV2IsRtlStrong(codePoint)) return 'rtl';
    if (coreV2IsLtrStrong(codePoint)) return 'ltr';
  }
  return null;
}

function resolveNeutralDirections(
  directions: readonly (CoreV2TextDirection | null)[],
  fallback: CoreV2TextDirection,
): readonly CoreV2TextDirection[] {
  const firstStrong = directions.find((direction) => direction !== null) ?? fallback;
  const result: CoreV2TextDirection[] = [];
  let previousStrong: CoreV2TextDirection | null = null;
  for (const direction of directions) {
    if (direction !== null) previousStrong = direction;
    result.push(direction ?? previousStrong ?? firstStrong);
  }
  return Object.freeze(result);
}

function minimumVisualIndex(run: CoreV2BidiRun, logicalToVisual: readonly number[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (let index = run.logicalStart; index < run.logicalEnd; index += 1) {
    result = Math.min(result, logicalToVisual[index] ?? Number.POSITIVE_INFINITY);
  }
  return result;
}

function reverseRange(values: number[], start: number, end: number): void {
  let left = start;
  let right = end - 1;
  while (left < right) {
    const value = values[left];
    if (value === undefined) break;
    values[left] = values[right] ?? value;
    values[right] = value;
    left += 1;
    right -= 1;
  }
}

function buildFontRuns(input: Readonly<{
  text: string;
  normalizedCarriageReturnIsBoundary: boolean;
  fontSizePx: number;
  autoFont: boolean;
  fontPolicy: FontPolicy;
}>): readonly CoreV2TextFontRun[] {
  const graphemes = segmentCoreV2Graphemes(input.text);
  const runs: CoreV2TextFontRun[] = [];
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
  if (grapheme === ELLIPSIS) return CORE_V2_TEXT_PROFILE.ellipsisMarker;
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint !== undefined && EXPLICIT_MISSING_CODE_POINTS.has(codePoint)) {
      return CORE_V2_TEXT_PROFILE.missingGlyph;
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
    if (codePoint !== undefined && codePoint > 0xffff) return CORE_V2_TEXT_PROFILE.upperFont;
  }
  return CORE_V2_TEXT_PROFILE.baseFont;
}

function collectMissingGlyphs(source: string): readonly CoreV2MissingGlyphObservation[] {
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
        identity: CORE_V2_TEXT_PROFILE.missingGlyph,
        count,
      }),
    ),
  );
}

function visibleGlyphText(text: string): string {
  let result = '';
  for (const symbol of text) {
    const codePoint = symbol.codePointAt(0);
    result += codePoint !== undefined && EXPLICIT_MISSING_CODE_POINTS.has(codePoint)
      ? MISSING_GLYPH_BOX
      : symbol;
  }
  return result;
}

function chooseRendererRoute(
  visibleText: string,
  fontRuns: readonly CoreV2TextFontRun[],
  advancedStyle: boolean,
): CoreV2TextRendererRoute {
  if (
    !advancedStyle &&
    !visibleText.includes('\n') &&
    /^[\u0020-\u007e]*$/u.test(visibleText) &&
    fontRuns.every(
      (run) =>
        run.font === CORE_V2_TEXT_PROFILE.baseFont && run.fallbackReason === undefined,
    )
  ) {
    return 'bitmap-text';
  }
  return 'fallback-text';
}

function resolveFontPolicy(options: CoreV2TextLayoutOptions): FontPolicy {
  const requestedFont = options.requestedFont ?? null;
  return freeze({
    requestedFont,
    requestedFontUnavailable:
      requestedFont !== null &&
      requestedFont !== 'Unifont' &&
      !(options.availableRequestedFonts ?? []).includes(requestedFont),
  });
}

function validateOptions(options: CoreV2TextLayoutOptions): void {
  if (typeof options.source !== 'string') unsupported('$.source', 'text source must be a string');
  assertFinitePositive(options.fontSizePx ?? DEFAULT_FONT_SIZE, '$.fontSizePx');
  assertFinitePositive(options.lineHeightPx ?? DEFAULT_LINE_HEIGHT, '$.lineHeightPx');
  assertFiniteNonNegative(options.alphabeticBaselinePx ?? DEFAULT_BASELINE, '$.alphabeticBaselinePx');
  assertFinite(options.letterSpacingPx ?? 0, '$.letterSpacingPx');
  if (!Number.isSafeInteger(options.split ?? 0)) unsupported('$.split', 'split must be a safe integer');
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

function collectUnpairedSurrogates(source: string, diagnostics: CoreV2TextDiagnostic[]): void {
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

function collectSupportDiagnostics(
  options: CoreV2TextLayoutOptions,
  diagnostics: CoreV2TextDiagnostic[],
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
          detail: `${formatCodePoint(token.codePoint)} uses a control class outside the pinned Core v2 subset`,
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
          detail: `${formatCodePoint(token.codePoint)} uses a line-break class outside the pinned Core v2 subset`,
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

function bounds(x: number, y: number, width: number, height: number): CoreV2TextBounds {
  return freeze({ x, y, width, height });
}

function joinClusters(clusters: readonly string[]): string {
  return visibleGlyphText(clusters.join(''));
}

function joinRawClusters(clusters: readonly string[]): string {
  return clusters.join('');
}

function maximum(values: readonly number[]): number {
  let result = 0;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function semanticPrecisionExceeded(
  graphemes: readonly string[],
  fontSizePx: number,
  letterSpacingPx: number,
  lineHeightPx: number,
  lineCount: number,
): boolean {
  if (
    saturatingMultiply(Math.max(0, graphemes.length - 1), Math.abs(letterSpacingPx)) ===
      MAX_SEMANTIC_ADVANCE ||
    saturatingMultiply(lineCount, lineHeightPx) === MAX_SEMANTIC_ADVANCE
  ) {
    return true;
  }
  return graphemes.some(
    (grapheme) =>
      measureCoreV2GraphemeAdvance(grapheme, fontSizePx) === MAX_SEMANTIC_ADVANCE,
  );
}

function saturatingAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isFinite(result)) {
    return result < 0 ? -MAX_SEMANTIC_ADVANCE : MAX_SEMANTIC_ADVANCE;
  }
  return Math.max(-MAX_SEMANTIC_ADVANCE, Math.min(MAX_SEMANTIC_ADVANCE, result));
}

function saturatingSubtract(left: number, right: number): number {
  return saturatingAdd(left, -right);
}

function saturatingMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  const result = left * right;
  if (!Number.isFinite(result) || Math.abs(result) > MAX_SEMANTIC_ADVANCE) {
    return Math.sign(left) === Math.sign(right)
      ? MAX_SEMANTIC_ADVANCE
      : -MAX_SEMANTIC_ADVANCE;
  }
  return result;
}

function signature(prefix: string, value: unknown): string {
  const source = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) unsupported(path, 'value must be finite');
}

function assertFinitePositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) unsupported(path, 'value must be finite and positive');
}

function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) unsupported(path, 'value must be finite and non-negative');
}

function unsupported(path: string, detail: string): never {
  throw new CoreV2TextLayoutError(path, detail);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
