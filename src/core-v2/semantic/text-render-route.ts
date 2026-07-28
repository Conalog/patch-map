export const CORE_V2_TEXT_RENDER_ROUTE_REVISION = 'core-v2-text-render-route/1';
export const CORE_V2_BITMAP_TEXT_MAX_CODE_UNITS = 128;
const CJK_RANGES = Object.freeze([
  [0x1100, 0x11ff],
  [0x2e80, 0x31bf],
  [0x31f0, 0x31ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa960, 0xa97f],
  [0xac00, 0xd7ff],
  [0xf900, 0xfaff],
  [0x20000, 0x323af],
] as const);
const BIDI_RANGES = Object.freeze([
  [0x0590, 0x08ff],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
  [0x10800, 0x10fff],
  [0x1e800, 0x1eeff],
] as const);
const EMOJI_RANGES = Object.freeze([
  [0x2600, 0x27bf],
  [0x1f000, 0x1faff],
] as const);
const COMBINING_RANGES = Object.freeze([
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff],
  [0xe0100, 0xe01ef],
] as const);

export type CoreV2TextRenderRoute = 'bitmap-text' | 'fallback-text';

export type CoreV2TextRenderRouteReason =
  | 'bitmap-capability-proven'
  | 'content-over-limit'
  | 'cjk-content'
  | 'bidi-content'
  | 'emoji-content'
  | 'combining-sequence'
  | 'unsupported-control'
  | 'unsupported-script'
  | 'missing-glyphs'
  | 'fallback-glyphs'
  | 'atlas-coverage-unproven'
  | 'atlas-capability-invalid'
  | 'atlas-glyph-missing'
  | 'style-capability-invalid'
  | 'unsupported-style'
  | 'multiline-unsupported';

export interface CoreV2TextRenderStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic' | 'oblique';
  readonly lineHeight: number;
  readonly letterSpacing: number;
  /** Any feature not represented by the exact bitmap style proof fails closed. */
  readonly advancedFeatures: readonly string[];
}

export interface CoreV2BitmapTextStyleProof {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic' | 'oblique';
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

/**
 * A finite, caller-owned description of one installed bitmap atlas. The policy
 * reads but never retains it. A missing proof is deliberately not inferred
 * from text contents or a font-family name.
 */
export interface CoreV2BitmapTextCapabilityProof {
  readonly coverage: 'proven';
  readonly atlasId: string;
  readonly glyphs: readonly string[];
  readonly style: CoreV2BitmapTextStyleProof;
  readonly multiline: boolean;
}

export interface CoreV2TextGlyphResolution {
  readonly missingGlyphCount: number;
  readonly fallbackGlyphCount: number;
}

export interface CoreV2TextRenderRouteInput {
  readonly text: string;
  readonly style: CoreV2TextRenderStyle;
  readonly glyphResolution: CoreV2TextGlyphResolution;
  readonly bitmapCapability: CoreV2BitmapTextCapabilityProof | null;
}

export interface CoreV2TextRenderRouteDecision {
  readonly revision: typeof CORE_V2_TEXT_RENDER_ROUTE_REVISION;
  readonly route: CoreV2TextRenderRoute;
  readonly reason: CoreV2TextRenderRouteReason;
  readonly reasons: readonly CoreV2TextRenderRouteReason[];
  readonly content: Readonly<{
    codeUnitCount: number;
    lineCount: number;
    uniqueGlyphCount: number;
    containsNonAscii: boolean;
    containsCjk: boolean;
    containsBidi: boolean;
    containsEmoji: boolean;
    containsCombiningSequence: boolean;
    containsUnsupportedControl: boolean;
    containsUnsupportedScript: boolean;
  }>;
  readonly atlas: Readonly<{
    atlasId: string | null;
    glyphCount: number;
    uncoveredGlyphs: readonly string[];
    styleMismatches: readonly string[];
    unsupportedStyleFeatures: readonly string[];
  }>;
  readonly capabilities: Readonly<{
    contentWithinLimit: boolean;
    simpleContent: boolean;
    finiteAtlasProven: boolean;
    atlasCoverageComplete: boolean;
    styleCapabilityProven: boolean;
    styleCompatible: boolean;
    multilineSupported: boolean;
    noMissingGlyphs: boolean;
    noFallbackGlyphs: boolean;
  }>;
}

interface ContentInspection {
  readonly requiredGlyphs: readonly string[];
  readonly lineCount: number;
  readonly containsNonAscii: boolean;
  readonly containsCjk: boolean;
  readonly containsBidi: boolean;
  readonly containsEmoji: boolean;
  readonly containsCombiningSequence: boolean;
  readonly containsUnsupportedControl: boolean;
  readonly containsUnsupportedScript: boolean;
}

interface CapabilityInspection {
  readonly atlasId: string | null;
  readonly glyphCount: number;
  readonly coverageProven: boolean;
  readonly coverageInvalid: boolean;
  readonly uncoveredGlyphs: readonly string[];
  readonly styleProven: boolean;
  readonly styleCompatible: boolean;
  readonly styleMismatches: readonly string[];
  readonly multilineSupported: boolean;
}

/**
 * Choose the Pixi text sink without constructing Pixi objects or consulting
 * browser/font metrics. BitmapText is selected only when every finite content,
 * glyph, style, and multiline capability is explicitly proven.
 */
export function selectCoreV2TextRenderRoute(
  input: CoreV2TextRenderRouteInput,
): CoreV2TextRenderRouteDecision {
  validateInput(input);
  const content = inspectContent(input.text);
  const capability = inspectCapability(
    input.bitmapCapability,
    input.style,
    content.requiredGlyphs,
    content.lineCount > 1,
  );
  const contentWithinLimit = input.text.length <= CORE_V2_BITMAP_TEXT_MAX_CODE_UNITS;
  const simpleContent = !content.containsCjk
    && !content.containsBidi
    && !content.containsEmoji
    && !content.containsCombiningSequence
    && !content.containsUnsupportedControl
    && !content.containsUnsupportedScript;
  const noMissingGlyphs = input.glyphResolution.missingGlyphCount === 0;
  const noFallbackGlyphs = input.glyphResolution.fallbackGlyphCount === 0;
  const atlasCoverageComplete = capability.coverageProven
    && capability.uncoveredGlyphs.length === 0;

  const fallbackReasons: CoreV2TextRenderRouteReason[] = [];
  if (!contentWithinLimit) fallbackReasons.push('content-over-limit');
  if (content.containsCjk) fallbackReasons.push('cjk-content');
  if (content.containsBidi) fallbackReasons.push('bidi-content');
  if (content.containsEmoji) fallbackReasons.push('emoji-content');
  if (content.containsCombiningSequence) fallbackReasons.push('combining-sequence');
  if (content.containsUnsupportedControl) fallbackReasons.push('unsupported-control');
  if (content.containsUnsupportedScript) fallbackReasons.push('unsupported-script');
  if (!noMissingGlyphs) fallbackReasons.push('missing-glyphs');
  if (!noFallbackGlyphs) fallbackReasons.push('fallback-glyphs');
  if (input.bitmapCapability === null) {
    fallbackReasons.push('atlas-coverage-unproven');
  } else if (capability.coverageInvalid) {
    fallbackReasons.push('atlas-capability-invalid');
  } else if (!atlasCoverageComplete) {
    fallbackReasons.push('atlas-glyph-missing');
  }
  if (input.bitmapCapability !== null && !capability.styleProven) {
    fallbackReasons.push('style-capability-invalid');
  } else if (capability.styleProven && !capability.styleCompatible) {
    fallbackReasons.push('unsupported-style');
  }
  if (content.lineCount > 1 && !capability.multilineSupported) {
    fallbackReasons.push('multiline-unsupported');
  }

  const route: CoreV2TextRenderRoute = fallbackReasons.length === 0
    ? 'bitmap-text'
    : 'fallback-text';
  const reasons = Object.freeze(route === 'bitmap-text'
    ? ['bitmap-capability-proven'] as const
    : [...fallbackReasons]);
  const reason = reasons[0];
  if (reason === undefined) throw new Error('Core v2 text route must have one reason');

  return Object.freeze({
    revision: CORE_V2_TEXT_RENDER_ROUTE_REVISION,
    route,
    reason,
    reasons,
    content: Object.freeze({
      codeUnitCount: input.text.length,
      lineCount: content.lineCount,
      uniqueGlyphCount: content.requiredGlyphs.length,
      containsNonAscii: content.containsNonAscii,
      containsCjk: content.containsCjk,
      containsBidi: content.containsBidi,
      containsEmoji: content.containsEmoji,
      containsCombiningSequence: content.containsCombiningSequence,
      containsUnsupportedControl: content.containsUnsupportedControl,
      containsUnsupportedScript: content.containsUnsupportedScript,
    }),
    atlas: Object.freeze({
      atlasId: capability.atlasId,
      glyphCount: capability.glyphCount,
      uncoveredGlyphs: capability.uncoveredGlyphs,
      styleMismatches: capability.styleMismatches,
      unsupportedStyleFeatures: Object.freeze(
        [...new Set(input.style.advancedFeatures)].sort(),
      ),
    }),
    capabilities: Object.freeze({
      contentWithinLimit,
      simpleContent,
      finiteAtlasProven: capability.coverageProven,
      atlasCoverageComplete,
      styleCapabilityProven: capability.styleProven,
      styleCompatible: capability.styleCompatible,
      multilineSupported: capability.multilineSupported,
      noMissingGlyphs,
      noFallbackGlyphs,
    }),
  });
}

function inspectContent(text: string): ContentInspection {
  const requiredGlyphs = new Set<string>();
  let containsNonAscii = false;
  let containsCjk = false;
  let containsBidi = false;
  let containsEmoji = false;
  let containsCombiningSequence = false;
  let containsUnsupportedControl = false;
  let containsUnsupportedScript = false;
  let lineCount = 1;
  let previousWasCarriageReturn = false;

  for (const glyph of text) {
    const codePoint = glyph.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint === 0x0d) {
      lineCount += 1;
      previousWasCarriageReturn = true;
      continue;
    }
    if (codePoint === 0x0a) {
      if (!previousWasCarriageReturn) lineCount += 1;
      previousWasCarriageReturn = false;
      continue;
    }
    previousWasCarriageReturn = false;
    requiredGlyphs.add(glyph);
    if (codePoint <= 0x7f) {
      if (isUnsupportedControl(codePoint)) {
        containsUnsupportedControl = true;
        containsUnsupportedScript = true;
      }
      continue;
    }
    const cjk = isCjk(codePoint);
    const bidi = isBidi(codePoint);
    const emoji = isEmoji(codePoint);
    const combining = isCombining(codePoint);
    containsNonAscii = true;
    if (cjk) containsCjk = true;
    if (bidi) containsBidi = true;
    if (emoji) containsEmoji = true;
    if (combining) containsCombiningSequence = true;
    if (isUnsupportedControl(codePoint)) containsUnsupportedControl = true;
    if (!isSimpleLatin(codePoint)
      && !cjk
      && !bidi
      && !emoji
      && !combining) {
      containsUnsupportedScript = true;
    }
  }

  return {
    requiredGlyphs: Object.freeze([...requiredGlyphs]),
    lineCount,
    containsNonAscii,
    containsCjk,
    containsBidi,
    containsEmoji,
    containsCombiningSequence,
    containsUnsupportedControl,
    containsUnsupportedScript,
  };
}

function inspectCapability(
  proof: CoreV2BitmapTextCapabilityProof | null,
  style: CoreV2TextRenderStyle,
  requiredGlyphs: readonly string[],
  multiline: boolean,
): CapabilityInspection {
  if (proof === null) {
    return {
      atlasId: null,
      glyphCount: 0,
      coverageProven: false,
      coverageInvalid: false,
      uncoveredGlyphs: Object.freeze([...requiredGlyphs]),
      styleProven: false,
      styleCompatible: false,
      styleMismatches: Object.freeze([]),
      multilineSupported: !multiline,
    };
  }

  const atlasGlyphs = new Set<string>();
  const proofGlyphs: readonly unknown[] = Array.isArray(proof.glyphs) ? proof.glyphs : [];
  const coverageInvalid = proof.coverage !== 'proven'
    || typeof proof.atlasId !== 'string'
    || proof.atlasId.length === 0
    || !Array.isArray(proof.glyphs)
    || proofGlyphs.some((glyph) => !isOneGlyph(glyph))
    || typeof proof.multiline !== 'boolean';
  if (!coverageInvalid) {
    for (const glyph of proofGlyphs) {
      if (isOneGlyph(glyph)) atlasGlyphs.add(glyph);
    }
  }
  const uncoveredGlyphs = Object.freeze(requiredGlyphs.filter((glyph) => !atlasGlyphs.has(glyph)));
  const styleProven = validStyleProof(proof.style);
  const styleMismatches = Object.freeze(styleProven
    ? styleDifference(style, proof.style)
    : []);
  const styleCompatible = styleProven
    && styleMismatches.length === 0
    && style.advancedFeatures.length === 0;

  return {
    atlasId: typeof proof.atlasId === 'string' && proof.atlasId.length > 0
      ? proof.atlasId
      : null,
    glyphCount: atlasGlyphs.size,
    coverageProven: !coverageInvalid,
    coverageInvalid,
    uncoveredGlyphs,
    styleProven,
    styleCompatible,
    styleMismatches,
    multilineSupported: !multiline || (!coverageInvalid && proof.multiline === true),
  };
}

function styleDifference(
  style: CoreV2TextRenderStyle,
  proof: CoreV2BitmapTextStyleProof,
): string[] {
  const differences: string[] = [];
  for (const field of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
  ] as const) {
    if (style[field] !== proof[field]) differences.push(field);
  }
  differences.push(...[...new Set(style.advancedFeatures)]
    .sort()
    .map((feature) => `advanced:${feature}`));
  return differences;
}

function validStyleProof(value: CoreV2BitmapTextStyleProof): boolean {
  return value !== null
    && typeof value === 'object'
    && typeof value.fontFamily === 'string'
    && value.fontFamily.length > 0
    && finitePositive(value.fontSize)
    && validFontWeight(value.fontWeight)
    && isFontStyle(value.fontStyle)
    && finitePositive(value.lineHeight)
    && Number.isFinite(value.letterSpacing);
}

function validateInput(input: CoreV2TextRenderRouteInput): void {
  if (input === null || typeof input !== 'object') throw new TypeError('text route input must be an object');
  if (typeof input.text !== 'string') throw new TypeError('text route content must be a string');
  const { style, glyphResolution } = input;
  if (style === null || typeof style !== 'object') throw new TypeError('text route style must be an object');
  if (typeof style.fontFamily !== 'string' || style.fontFamily.length === 0) {
    throw new TypeError('text route fontFamily must be nonempty');
  }
  if (!finitePositive(style.fontSize)) throw new TypeError('text route fontSize must be positive and finite');
  if (!validFontWeight(style.fontWeight)) throw new TypeError('text route fontWeight must be 100 through 900');
  if (!isFontStyle(style.fontStyle)) throw new TypeError('text route fontStyle is invalid');
  if (!finitePositive(style.lineHeight)) throw new TypeError('text route lineHeight must be positive and finite');
  if (!Number.isFinite(style.letterSpacing)) throw new TypeError('text route letterSpacing must be finite');
  if (!Array.isArray(style.advancedFeatures)
    || style.advancedFeatures.some((feature) => typeof feature !== 'string' || feature.length === 0)) {
    throw new TypeError('text route advancedFeatures must be nonempty strings');
  }
  if (glyphResolution === null || typeof glyphResolution !== 'object') {
    throw new TypeError('text route glyphResolution must be an object');
  }
  if (!nonnegativeInteger(glyphResolution.missingGlyphCount)
    || !nonnegativeInteger(glyphResolution.fallbackGlyphCount)) {
    throw new TypeError('text route glyph counts must be nonnegative integers');
  }
}

function isOneGlyph(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value !== '\n'
    && value !== '\r'
    && [...value].length === 1;
}

function isSimpleLatin(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e)
    || (codePoint >= 0x00a0 && codePoint <= 0x024f)
    || (codePoint >= 0x1e00 && codePoint <= 0x1eff);
}

function isCjk(codePoint: number): boolean {
  return inRanges(codePoint, CJK_RANGES);
}

function isBidi(codePoint: number): boolean {
  return inRanges(codePoint, BIDI_RANGES);
}

function isEmoji(codePoint: number): boolean {
  return inRanges(codePoint, EMOJI_RANGES);
}

function isCombining(codePoint: number): boolean {
  return codePoint === 0x200d
    || inRanges(codePoint, COMBINING_RANGES);
}

function isUnsupportedControl(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function inRanges(codePoint: number, ranges: readonly (readonly [number, number])[]): boolean {
  for (const [start, end] of ranges) {
    if (codePoint >= start && codePoint <= end) return true;
  }
  return false;
}

function finitePositive(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validFontWeight(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 900;
}

function isFontStyle(value: unknown): value is CoreV2TextRenderStyle['fontStyle'] {
  return value === 'normal' || value === 'italic' || value === 'oblique';
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
