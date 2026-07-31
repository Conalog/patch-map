import { PATCH_MAP_UNICODE_VERSION } from '../unicode-text-data';

export const PATCH_MAP_TEXT_PROFILE = Object.freeze({
  id: 'core-v2-unicode-cell-fonts/1',
  unicodeVersion: PATCH_MAP_UNICODE_VERSION,
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

export type PatchMapTextOverflow = 'visible' | 'hidden' | 'ellipsis';
export type PatchMapTextDirection = 'ltr' | 'rtl';
export type PatchMapTextRendererRoute = 'bitmap-text' | 'fallback-text';
export type PatchMapTextBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export interface PatchMapTextFrame {
  readonly width: number;
  readonly height: number;
}

export interface PatchMapTextAutoFont {
  readonly minPx: number;
  readonly maxPx: number;
}

export interface PatchMapTextLayoutOptions {
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
  readonly contentFrame?: PatchMapTextFrame;
  readonly overflow?: PatchMapTextOverflow;
  readonly autoFont?: PatchMapTextAutoFont;
  readonly origin?: Readonly<{ x: number; y: number }>;
  readonly advancedStyle?: boolean;
}

export interface PatchMapTextDiagnostic {
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
export class PatchMapTextLayoutError extends TypeError {
  public readonly code = 'UNSUPPORTED_TEXT_OPTION' as const;
  public readonly inputPath: string;
  public readonly detail: string;

  public constructor(inputPath: string, detail: string) {
    super(`UNSUPPORTED_TEXT_OPTION at ${inputPath}: ${detail}`);
    this.name = 'PatchMapTextLayoutError';
    this.inputPath = inputPath;
    this.detail = detail;
  }
}

export interface PatchMapTextFontRun {
  readonly text: string;
  readonly font: string;
  readonly fontSizePx?: number;
  readonly fallbackReason?: 'requested-font-unavailable';
}

export interface PatchMapMissingGlyphObservation {
  readonly codePoint: string;
  readonly identity: 'core-v2-missing-glyph-box/1';
  readonly count: number;
}

export interface PatchMapBidiRun {
  readonly text: string;
  readonly level: number;
  readonly direction: PatchMapTextDirection;
  readonly logicalStart: number;
  readonly logicalEnd: number;
}

export interface PatchMapBidiLine {
  readonly lineIndex: number;
  readonly source: string;
  readonly baseDirection: PatchMapTextDirection;
  readonly logicalRuns: readonly PatchMapBidiRun[];
  readonly visualRuns: readonly PatchMapBidiRun[];
  readonly logicalToVisual: readonly number[];
}

export interface PatchMapTextLayout {
  readonly profile: typeof PATCH_MAP_TEXT_PROFILE;
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
  readonly baseDirection: PatchMapTextDirection;
  readonly bidiRunsLogical: readonly PatchMapBidiRun[];
  readonly bidiRunsVisualOrder: readonly PatchMapBidiRun[];
  readonly logicalToVisual: readonly number[];
  /** Authoritative bidi observations for every normalized/split/wrapped line. */
  readonly bidiLines: readonly PatchMapBidiLine[];
  /** Contract corpus font coverage of authored content (ellipsis uses rendered content). */
  readonly fontRuns: readonly PatchMapTextFontRun[];
  /** Authored-source font coverage; CR/CRLF layout conversion creates a run boundary. */
  readonly sourceFontRuns: readonly PatchMapTextFontRun[];
  /** Font runs for exactly the visible, LF-normalized renderer payload. */
  readonly visibleFontRuns: readonly PatchMapTextFontRun[];
  readonly missingGlyphs: readonly PatchMapMissingGlyphObservation[];
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly alphabeticBaselinePx: number;
  readonly letterSpacingPx: number;
  readonly split: number;
  readonly wordWrapWidthPx: number | null;
  readonly breakWords: boolean;
  readonly overflow: PatchMapTextOverflow;
  readonly contentFrame: PatchMapTextFrame | null;
  readonly naturalLayoutBounds: PatchMapTextBounds;
  readonly layoutBounds: PatchMapTextBounds;
  readonly ownerLocalBounds: PatchMapTextBounds;
  readonly lineAdvancesPx: readonly number[];
  readonly rendererRoute: PatchMapTextRendererRoute;
  readonly contentSignature: string;
  readonly styleSignature: string;
  readonly layoutSignature: string;
  readonly diagnostics: readonly PatchMapTextDiagnostic[];
}
