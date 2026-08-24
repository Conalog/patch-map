import type {
  PatchMapBidiLine,
  PatchMapBidiRun,
  PatchMapTextBounds,
  PatchMapTextDiagnostic,
  PatchMapTextFontRun,
  PatchMapTextFrame,
  PatchMapTextOverflow,
  PatchMapTextRendererRoute,
} from './contracts';

interface PatchMapTextLayoutSignatureInput {
  readonly contentSignature: string;
  readonly styleSignature: string;
  readonly graphemes: readonly string[];
  readonly lines: readonly string[];
  readonly visibleLines: readonly string[];
  readonly layoutBounds: PatchMapTextBounds;
  readonly ownerLocalBounds: PatchMapTextBounds;
  readonly bidiLines: readonly PatchMapBidiLine[];
  readonly fontRuns: readonly PatchMapTextFontRun[];
  readonly sourceFontRuns: readonly PatchMapTextFontRun[];
  readonly visibleFontRuns: readonly PatchMapTextFontRun[];
  readonly diagnostics: readonly PatchMapTextDiagnostic[];
}

interface PatchMapTextStyleSignatureInput {
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly alphabeticBaselinePx: number;
  readonly letterSpacingPx: number;
  readonly requestedFont: string | null;
  readonly requestedFontUnavailable: boolean;
  readonly split: number;
  readonly wordWrapWidthPx: number | null;
  readonly effectiveWordWrapWidthPx?: number | null;
  readonly breakWords: boolean;
  readonly overflow: PatchMapTextOverflow;
  readonly contentFrame: PatchMapTextFrame | null;
  readonly rendererRoute: PatchMapTextRendererRoute;
}

export function textLayoutSignature(input: PatchMapTextLayoutSignatureInput): string {
  let hash = hashString(0x811c9dc5, '{"bidiLines":');
  hash = hashBidiLines(hash, input.bidiLines);
  hash = hashString(hash, ',"contentSignature":');
  hash = hashJsonScalar(hash, input.contentSignature);
  hash = hashString(hash, ',"diagnostics":');
  hash = hashDiagnostics(hash, input.diagnostics);
  hash = hashString(hash, ',"fontRuns":');
  hash = hashFontRuns(hash, input.fontRuns);
  hash = hashString(hash, ',"graphemes":');
  hash = hashStringArray(hash, input.graphemes);
  hash = hashString(hash, ',"layoutBounds":');
  hash = hashBounds(hash, input.layoutBounds);
  hash = hashString(hash, ',"lines":');
  hash = hashStringArray(hash, input.lines);
  hash = hashString(hash, ',"ownerLocalBounds":');
  hash = hashBounds(hash, input.ownerLocalBounds);
  hash = hashString(hash, ',"sourceFontRuns":');
  hash = hashFontRuns(hash, input.sourceFontRuns);
  hash = hashString(hash, ',"styleSignature":');
  hash = hashJsonScalar(hash, input.styleSignature);
  hash = hashString(hash, ',"visibleFontRuns":');
  hash = hashFontRuns(hash, input.visibleFontRuns);
  hash = hashString(hash, ',"visibleLines":');
  hash = hashStringArray(hash, input.visibleLines);
  return formattedSignature('text-layout/v1', hashString(hash, '}'));
}

export function textContentSignature(
  source: string,
  layoutSource: string,
  visibleText: string,
): string {
  let hash = hashString(0x811c9dc5, '{"layoutSource":');
  hash = hashJsonScalar(hash, layoutSource);
  hash = hashString(hash, ',"source":');
  hash = hashJsonScalar(hash, source);
  hash = hashString(hash, ',"visibleText":');
  hash = hashJsonScalar(hash, visibleText);
  return formattedSignature('text-content/v1', hashString(hash, '}'));
}

export function textStyleSignature(input: PatchMapTextStyleSignatureInput): string {
  let hash = hashString(0x811c9dc5, '{"alphabeticBaselinePx":');
  hash = hashJsonScalar(hash, input.alphabeticBaselinePx);
  hash = hashString(hash, ',"breakWords":');
  hash = hashJsonScalar(hash, input.breakWords);
  hash = hashString(hash, ',"contentFrame":');
  hash = input.contentFrame === null
    ? hashString(hash, 'null')
    : hashTextFrame(hash, input.contentFrame);
  if (input.effectiveWordWrapWidthPx !== undefined) {
    hash = hashString(hash, ',"effectiveWordWrapWidthPx":');
    hash = hashJsonScalar(hash, input.effectiveWordWrapWidthPx);
  }
  hash = hashString(hash, ',"fontSizePx":');
  hash = hashJsonScalar(hash, input.fontSizePx);
  hash = hashString(hash, ',"letterSpacingPx":');
  hash = hashJsonScalar(hash, input.letterSpacingPx);
  hash = hashString(hash, ',"lineHeightPx":');
  hash = hashJsonScalar(hash, input.lineHeightPx);
  hash = hashString(hash, ',"overflow":');
  hash = hashJsonScalar(hash, input.overflow);
  hash = hashString(hash, ',"rendererRoute":');
  hash = hashJsonScalar(hash, input.rendererRoute);
  hash = hashString(hash, ',"requestedFont":');
  hash = hashJsonScalar(hash, input.requestedFont);
  hash = hashString(hash, ',"requestedFontUnavailable":');
  hash = hashJsonScalar(hash, input.requestedFontUnavailable);
  hash = hashString(hash, ',"split":');
  hash = hashJsonScalar(hash, input.split);
  hash = hashString(hash, ',"wordWrapWidthPx":');
  hash = hashJsonScalar(hash, input.wordWrapWidthPx);
  return formattedSignature('text-style/v1', hashString(hash, '}'));
}

function hashBounds(hash: number, boundsValue: PatchMapTextBounds): number {
  let next = hashString(hash, '{"height":');
  next = hashJsonScalar(next, boundsValue.height);
  next = hashString(next, ',"width":');
  next = hashJsonScalar(next, boundsValue.width);
  next = hashString(next, ',"x":');
  next = hashJsonScalar(next, boundsValue.x);
  next = hashString(next, ',"y":');
  next = hashJsonScalar(next, boundsValue.y);
  return hashString(next, '}');
}

function hashTextFrame(hash: number, frame: PatchMapTextFrame): number {
  let next = hashString(hash, '{"height":');
  next = hashJsonScalar(next, frame.height);
  next = hashString(next, ',"width":');
  next = hashJsonScalar(next, frame.width);
  return hashString(next, '}');
}

function hashStringArray(hash: number, values: readonly string[]): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < values.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    next = hashJsonScalar(next, values[index]);
  }
  return hashString(next, ']');
}

function hashNumberArray(hash: number, values: readonly number[]): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < values.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    next = hashJsonScalar(next, values[index]);
  }
  return hashString(next, ']');
}

function hashBidiLines(hash: number, lines: readonly PatchMapBidiLine[]): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    const line = lines[index]!;
    next = hashString(next, '{"baseDirection":');
    next = hashJsonScalar(next, line.baseDirection);
    next = hashString(next, ',"lineIndex":');
    next = hashJsonScalar(next, line.lineIndex);
    next = hashString(next, ',"logicalRuns":');
    next = hashBidiRuns(next, line.logicalRuns);
    next = hashString(next, ',"logicalToVisual":');
    next = hashNumberArray(next, line.logicalToVisual);
    next = hashString(next, ',"source":');
    next = hashJsonScalar(next, line.source);
    next = hashString(next, ',"visualRuns":');
    next = hashBidiRuns(next, line.visualRuns);
    next = hashString(next, '}');
  }
  return hashString(next, ']');
}

function hashBidiRuns(hash: number, runs: readonly PatchMapBidiRun[]): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < runs.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    const run = runs[index]!;
    next = hashString(next, '{"direction":');
    next = hashJsonScalar(next, run.direction);
    next = hashString(next, ',"level":');
    next = hashJsonScalar(next, run.level);
    next = hashString(next, ',"logicalEnd":');
    next = hashJsonScalar(next, run.logicalEnd);
    next = hashString(next, ',"logicalStart":');
    next = hashJsonScalar(next, run.logicalStart);
    next = hashString(next, ',"text":');
    next = hashJsonScalar(next, run.text);
    next = hashString(next, '}');
  }
  return hashString(next, ']');
}

function hashFontRuns(hash: number, runs: readonly PatchMapTextFontRun[]): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < runs.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    const run = runs[index]!;
    next = hashString(next, '{');
    let hasProperty = false;
    if (run.fallbackReason !== undefined) {
      next = hashString(next, '"fallbackReason":');
      next = hashJsonScalar(next, run.fallbackReason);
      hasProperty = true;
    }
    if (hasProperty) next = hashString(next, ',');
    next = hashString(next, '"font":');
    next = hashJsonScalar(next, run.font);
    if (run.fontSizePx !== undefined) {
      next = hashString(next, ',"fontSizePx":');
      next = hashJsonScalar(next, run.fontSizePx);
    }
    next = hashString(next, ',"text":');
    next = hashJsonScalar(next, run.text);
    next = hashString(next, '}');
  }
  return hashString(next, ']');
}

function hashDiagnostics(
  hash: number,
  diagnostics: readonly PatchMapTextDiagnostic[],
): number {
  let next = hashString(hash, '[');
  for (let index = 0; index < diagnostics.length; index += 1) {
    if (index > 0) next = hashString(next, ',');
    const diagnostic = diagnostics[index]!;
    next = hashString(next, '{"code":');
    next = hashJsonScalar(next, diagnostic.code);
    next = hashString(next, ',"detail":');
    next = hashJsonScalar(next, diagnostic.detail);
    next = hashString(next, ',"severity":');
    next = hashJsonScalar(next, diagnostic.severity);
    if (diagnostic.sourceIndex !== undefined) {
      next = hashString(next, ',"sourceIndex":');
      next = hashJsonScalar(next, diagnostic.sourceIndex);
    }
    next = hashString(next, '}');
  }
  return hashString(next, ']');
}

function hashJsonScalar(
  hash: number,
  value: string | number | boolean | null | undefined,
): number {
  return hashString(hash, JSON.stringify(value) ?? 'undefined');
}

function formattedSignature(prefix: string, hash: number): string {
  return `${prefix}:${hash.toString(16).padStart(8, '0')}`;
}

function hashString(hash: number, source: string): number {
  let next = hash;
  for (let index = 0; index < source.length; index += 1) {
    next ^= source.charCodeAt(index);
    next = Math.imul(next, 0x01000193) >>> 0;
  }
  return next;
}
