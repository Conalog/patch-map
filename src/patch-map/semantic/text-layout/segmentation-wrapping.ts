import {
  patchMapGraphemeBreakClass,
  patchMapIsExtendedPictographic,
  patchMapIsFullWidth,
  patchMapIsHardBreak,
  patchMapIsZeroAdvance,
  type PatchMapGraphemeBreakClass,
} from '../unicode-text-data';
import type {
  PatchMapTextFrame,
  PatchMapTextLayoutOptions,
  PatchMapTextOverflow,
} from './contracts';
import {
  DEFAULT_FONT_SIZE,
  ELLIPSIS,
  EXPLICIT_MISSING_CODE_POINTS,
  MAX_SEMANTIC_ADVANCE,
  MISSING_GLYPH_BOX,
  assertFiniteNonNegative,
  freeze,
  maximum,
  saturatingAdd,
  saturatingMultiply,
  saturatingSubtract,
} from './shared';

export interface ScalarToken {
  readonly text: string;
  readonly codePoint: number;
  readonly sourceIndex: number;
  readonly graphemeClass: PatchMapGraphemeBreakClass;
  readonly extendedPictographic: boolean;
}

export interface LayoutCore {
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

interface LineMetrics {
  readonly graphemeCount: number;
  readonly letterSpacingPx: number;
  readonly prefixPositions: readonly number[];
  readonly monotonic: boolean;
  readonly minimumTree: readonly number[] | null;
  readonly minimumTreeLeafCount: number;
}

/** Deterministic UAX-29-profile segmentation with no host ICU dependency. */
export function segmentPatchMapGraphemes(source: string): readonly string[] {
  if (isPrintableAscii(source)) return Object.freeze(source.split(''));
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
export function measurePatchMapGraphemeAdvance(grapheme: string, fontSizePx = 16): number {
  assertFiniteNonNegative(fontSizePx, '$.fontSizePx');
  let units = 0;
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined || codePoint === 0x000a || codePoint === 0x000d) continue;
    if (patchMapIsZeroAdvance(codePoint)) continue;
    if (EXPLICIT_MISSING_CODE_POINTS.has(codePoint)) {
      units += 16;
    } else {
      // The immutable observation records supplementary advance per non-zero
      // scalar inside a grapheme: four family pictographs plus thumb/modifier
      // therefore remain 96 px even though they form two grapheme clusters.
      units += patchMapIsFullWidth(codePoint) ? 16 : 8;
    }
  }
  return saturatingMultiply(units, fontSizePx / DEFAULT_FONT_SIZE);
}

export function produceLayoutCore(input: Readonly<{
  source: string;
  layoutSource: string;
  split: number;
  wordWrapWidthPx: number | null;
  breakWords: boolean;
  overflow: PatchMapTextOverflow;
  contentFrame: PatchMapTextFrame | null;
  fontSizePx: number;
  lineHeightPx: number;
  letterSpacingPx: number;
}>): LayoutCore {
  const sourceGraphemes = segmentPatchMapGraphemes(input.source);
  const layoutGraphemes = input.layoutSource === input.source
    ? sourceGraphemes
    : segmentPatchMapGraphemes(input.layoutSource);
  const hardLines = splitHardLines(layoutGraphemes);
  const splitLines = splitByCount(hardLines, input.split);
  const lines = input.wordWrapWidthPx === null
    ? splitLines
    : Object.freeze(splitLines.flatMap((line) =>
        wrapLine(
          line,
          input.wordWrapWidthPx ?? 0,
          input.breakWords,
          input.fontSizePx,
          input.letterSpacingPx,
        ),
      ));
  const naturalLineAdvancesPx = Object.freeze(lines.map((line) =>
    measureLine(line, input.fontSizePx, input.letterSpacingPx),
  ));
  const overflowResult = applyOverflow(
    lines,
    input.overflow,
    input.contentFrame,
    input.fontSizePx,
    input.lineHeightPx,
    input.letterSpacingPx,
  );
  const lineAdvancesPx = Object.freeze(overflowResult.lines.map((line) =>
    measureLine(line, input.fontSizePx, input.letterSpacingPx),
  ));
  return Object.freeze({
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

function isPrintableAscii(source: string): boolean {
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

export function chooseFontSize(
  options: PatchMapTextLayoutOptions,
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
  options: PatchMapTextLayoutOptions,
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

export function scalarTokens(source: string): readonly ScalarToken[] {
  const tokens: ScalarToken[] = [];
  let sourceIndex = 0;
  for (const symbol of source) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    tokens.push({
      text: symbol,
      codePoint,
      sourceIndex,
      graphemeClass: patchMapGraphemeBreakClass(codePoint),
      extendedPictographic: patchMapIsExtendedPictographic(codePoint),
    });
    sourceIndex += symbol.length;
  }
  return Object.freeze(tokens);
}

function splitHardLines(graphemes: readonly string[]): readonly (readonly string[])[] {
  const lines: string[][] = [[]];
  for (const grapheme of graphemes) {
    if (patchMapIsHardBreak(grapheme)) {
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
  return first !== undefined && patchMapIsFullWidth(first) && first <= 0xffff;
}

function applyOverflow(
  lines: readonly (readonly string[])[],
  overflow: PatchMapTextOverflow,
  frame: PatchMapTextFrame | null,
  fontSizePx: number,
  lineHeightPx: number,
  letterSpacingPx: number,
): Readonly<{ lines: readonly (readonly string[])[]; truncated: boolean }> {
  if (overflow === 'visible' || frame === null) {
    return Object.freeze({ lines, truncated: false });
  }
  const maxLines = Math.floor(frame.height / lineHeightPx);
  if (maxLines <= 0) {
    return Object.freeze({
      lines: Object.freeze([]),
      truncated: lines.length > 0,
    });
  }
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
    const markerWidth = measurePatchMapGraphemeAdvance(ELLIPSIS, fontSizePx);
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
  return Object.freeze({
    lines: Object.freeze(selected.map((line) => Object.freeze(line))),
    truncated,
  });
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
      measurePatchMapGraphemeAdvance(grapheme, fontSizePx),
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
      measurePatchMapGraphemeAdvance(graphemes[index] ?? '', fontSizePx),
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

export function joinClusters(clusters: readonly string[]): string {
  return visibleGlyphText(clusters.join(''));
}

export function joinRawClusters(clusters: readonly string[]): string {
  return clusters.join('');
}

export function semanticPrecisionExceeded(
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
      measurePatchMapGraphemeAdvance(grapheme, fontSizePx) === MAX_SEMANTIC_ADVANCE,
  );
}
