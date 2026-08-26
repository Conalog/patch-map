import type { Rgba } from '../dense/contracts';
import type { PatchMapContentOrientation } from './contracts';
import type { PatchMapPlacement } from '../semantic/dataset';
import { PATCH_MAP_DEFAULT_COLOR_THEME } from '../semantic/color';
import { resolvePatchMapPlacementBounds } from '../semantic/placement';
import {
  deterministicPatchMapTokenColor,
  parsePatchMapCssColor,
} from './color';
import {
  fatalPatchMapParse,
  warnPatchMapParse,
  warnPatchMapParseOnce,
  type PatchMapParseState,
} from './parse-state';
import {
  composePatchMapParserTransform,
  type PatchMapParserSize,
  type PatchMapParserTransform,
} from './transform-projection';

export type PatchMapParserRecord = Record<string, unknown>;

export interface PatchMapParserBox extends PatchMapParserSize {
  readonly x: number;
  readonly y: number;
}

export const PATCH_MAP_PLACEMENTS = new Set<PatchMapPlacement>([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
]);

const TRANSFORM_ATTRIBUTE_KEYS = new Set(['x', 'y', 'angle', 'rotation']);
const SIGNED_SCALE_ATTRIBUTE_KEYS = new Set(['scaleX', 'scaleY']);
const SIGNED_SCALE_ATTRIBUTE_TYPES = new Set([
  'group',
  'grid',
  'item',
  'rect',
  'image',
  'text',
  'background',
  'bar',
  'icon',
  'relations',
]);
const TRANSFORM_ATTRIBUTE_TYPES = new Set([
  'group',
  'grid',
  'item',
  'rect',
  'image',
  'text',
  'background',
  'bar',
  'icon',
  'relations',
]);
const Z_INDEX_ATTRIBUTE_TYPES = new Set([
  'group',
  'grid',
  'item',
  'rect',
  'image',
  'text',
  'relations',
  'background',
  'bar',
  'icon',
]);

export function elementTransform(
  attrs: PatchMapParserRecord | undefined,
  path: string,
  parent: PatchMapParserTransform,
  type: string,
  state: PatchMapParseState,
): PatchMapParserTransform {
  const projectsSignedScale = SIGNED_SCALE_ATTRIBUTE_TYPES.has(type);
  return composePatchMapParserTransform(
    parent,
    numericAttribute(attrs?.x, `${path}.attrs.x`, state),
    numericAttribute(attrs?.y, `${path}.attrs.y`, state),
    rotationDegrees(attrs, `${path}.attrs`, state),
    projectsSignedScale ? scaleAttribute(attrs?.scaleX, `${path}.attrs.scaleX`, state) : 1,
    projectsSignedScale ? scaleAttribute(attrs?.scaleY, `${path}.attrs.scaleY`, state) : 1,
  );
}

export function componentTransform(
  itemTransform: PatchMapParserTransform,
  box: PatchMapParserBox,
  attrs: PatchMapParserRecord | undefined,
  path: string,
  state: PatchMapParseState,
): PatchMapParserTransform {
  return composePatchMapParserTransform(
    itemTransform,
    box.x + numericAttribute(attrs?.x, `${path}.attrs.x`, state),
    box.y + numericAttribute(attrs?.y, `${path}.attrs.y`, state),
    rotationDegrees(attrs, `${path}.attrs`, state),
    scaleAttribute(attrs?.scaleX, `${path}.attrs.scaleX`, state),
    scaleAttribute(attrs?.scaleY, `${path}.attrs.scaleY`, state),
  );
}

export function parseContentOrientation(
  value: unknown,
  path: string,
  sourceId: string,
  state: PatchMapParseState,
): PatchMapContentOrientation {
  if (value === undefined || value === 'upright') return 'upright';
  if (value === 'follow-item') return value;
  warnPatchMapParse(
    state,
    path,
    'invalid-content-orientation',
    'Invalid contentOrientation fell back to upright',
    sourceId,
  );
  return 'upright';
}

export function fixedSize(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): PatchMapParserSize {
  if (finiteNumber(value) !== undefined) {
    const size = nonNegative(finiteNumber(value) as number, path, state);
    return { width: size, height: size };
  }
  if (isParserRecord(value)) {
    const width = finiteNumber(value.width);
    const height = finiteNumber(value.height);
    if (width !== undefined && height !== undefined) {
      return {
        width: nonNegative(width, `${path}.width`, state),
        height: nonNegative(height, `${path}.height`, state),
      };
    }
  }
  warnPatchMapParse(state, path, 'invalid-size', 'Invalid fixed size fell back to 0×0');
  return { width: 0, height: 0 };
}

export function resolveComponentSize(
  value: unknown,
  reference: PatchMapParserSize,
  path: string,
  state: PatchMapParseState,
): PatchMapParserSize {
  if (isParserRecord(value) && ('width' in value || 'height' in value)) {
    return {
      width: componentLength(value.width, reference.width, `${path}.width`, state),
      height: componentLength(value.height, reference.height, `${path}.height`, state),
    };
  }
  return {
    width: componentLength(value, reference.width, `${path}.width`, state),
    height: componentLength(value, reference.height, `${path}.height`, state),
  };
}

export function barPlacement(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): PatchMapPlacement {
  if (value === undefined) return 'bottom';
  if (typeof value === 'string' && PATCH_MAP_PLACEMENTS.has(value as PatchMapPlacement)) {
    return value as PatchMapPlacement;
  }
  fatalPatchMapParse(
    state,
    path,
    'invalid-placement',
    'Placement must be a supported PatchMap placement',
  );
}

export function barAnimation(
  value: unknown,
  path: string,
  sourceId: string,
  state: PatchMapParseState,
): boolean {
  if (value === undefined) return true;
  if (typeof value === 'boolean') return value;
  fatalPatchMapParse(
    state,
    path,
    'invalid-component-animation',
    'Bar animation must be a boolean',
    sourceId,
  );
}

export function barAnimationDuration(
  value: unknown,
  path: string,
  sourceId: string,
  state: PatchMapParseState,
): number {
  if (value === undefined) return 200;
  const duration = finiteNumber(value);
  if (duration !== undefined && duration >= 0) return duration;
  fatalPatchMapParse(
    state,
    path,
    'invalid-animation-duration',
    'Bar animationDuration must be a nonnegative finite number',
    sourceId,
  );
}

function componentLength(
  value: unknown,
  reference: number,
  path: string,
  state: PatchMapParseState,
): number {
  const numeric = finiteNumber(value);
  if (numeric !== undefined) return nonNegative(numeric, path, state);
  if (typeof value === 'string') {
    const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))%\s*$/.exec(value);
    if (match) return nonNegative(reference * Number(match[1]) / 100, path, state);
  }
  if (isParserRecord(value)) {
    const amount = finiteNumber(value.value);
    if (amount !== undefined && value.unit === 'px') return nonNegative(amount, path, state);
    if (amount !== undefined && value.unit === '%') {
      return nonNegative(reference * amount / 100, path, state);
    }
  }
  warnPatchMapParse(
    state,
    path,
    'invalid-component-size',
    'Invalid component length fell back to 0',
  );
  return 0;
}

export function placeBox(
  reference: PatchMapParserBox,
  size: PatchMapParserSize,
  placementValue: unknown,
  marginValue: unknown,
  path: string,
  state: PatchMapParseState,
): PatchMapParserBox {
  const margin = boxSpacing(marginValue, `${path}.margin`, state);
  let placement: PatchMapPlacement = 'center';
  if (
    typeof placementValue === 'string' &&
    PATCH_MAP_PLACEMENTS.has(placementValue as PatchMapPlacement)
  ) {
    placement = placementValue as PatchMapPlacement;
  } else {
    fatalPatchMapParse(
      state,
      `${path}.placement`,
      'invalid-placement',
      'Placement must be a supported PatchMap placement',
    );
  }
  return resolvePatchMapPlacementBounds(reference, size, placement, margin, path);
}

export function boxSpacing(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): Readonly<{ top: number; right: number; bottom: number; left: number }> {
  const uniform = finiteNumber(value);
  if (uniform !== undefined) {
    return { top: uniform, right: uniform, bottom: uniform, left: uniform };
  }
  if (value === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!isParserRecord(value)) {
    warnPatchMapParse(state, path, 'invalid-spacing', 'Invalid spacing fell back to zero');
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const x = optionalSpacing(value.x, `${path}.x`, state);
  const y = optionalSpacing(value.y, `${path}.y`, state);
  return {
    top: value.top === undefined
      ? y
      : requiredSpacing(value.top, `${path}.top`, state),
    right: value.right === undefined
      ? x
      : requiredSpacing(value.right, `${path}.right`, state),
    bottom: value.bottom === undefined
      ? y
      : requiredSpacing(value.bottom, `${path}.bottom`, state),
    left: value.left === undefined
      ? x
      : requiredSpacing(value.left, `${path}.left`, state),
  };
}

function optionalSpacing(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  return value === undefined ? 0 : requiredSpacing(value, path, state);
}

function requiredSpacing(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  const spacing = finiteNumber(value);
  if (spacing !== undefined) return spacing;
  fatalPatchMapParse(
    state,
    path,
    'invalid-spacing',
    'Spacing must be a finite number',
  );
}

export function axisSpacing(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): Readonly<{ x: number; y: number }> {
  const uniform = finiteNumber(value);
  if (uniform !== undefined) return { x: uniform, y: uniform };
  if (value === undefined) return { x: 0, y: 0 };
  if (isParserRecord(value)) {
    return { x: finiteNumber(value.x) ?? 0, y: finiteNumber(value.y) ?? 0 };
  }
  warnPatchMapParse(state, path, 'invalid-gap', 'Invalid gap fell back to zero');
  return { x: 0, y: 0 };
}

export function relationEndpoint(
  value: unknown,
  path: string,
  state: PatchMapParseState,
  sourceId: string,
): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isParserRecord(value) && typeof value.id === 'string' && value.id.length > 0) {
    return value.id;
  }
  fatalPatchMapParse(
    state,
    path,
    'invalid-relation-endpoint',
    'Relation endpoint must be a non-empty string or { id }',
    sourceId,
  );
}

export function resolveColor(
  value: unknown,
  fallback: Rgba,
  path: string,
  state: PatchMapParseState,
): Rgba {
  let resolvedValue = value;
  let rootThemeToken: string | undefined;
  let visitedThemeTokens: Set<string> | undefined;

  while (typeof resolvedValue === 'string') {
    const themeValue =
      state.options.colors?.[resolvedValue] ?? PATCH_MAP_DEFAULT_COLOR_THEME[resolvedValue];
    if (themeValue === undefined || themeValue === resolvedValue) break;

    rootThemeToken ??= resolvedValue;
    visitedThemeTokens ??= new Set([resolvedValue]);
    if (typeof themeValue === 'string' && visitedThemeTokens.has(themeValue)) {
      warnPatchMapParse(
        state,
        path,
        'color-fallback',
        `Unknown color token ${JSON.stringify(rootThemeToken)} used deterministic hash fallback`,
      );
      return deterministicPatchMapTokenColor(rootThemeToken);
    }
    if (typeof themeValue === 'string') visitedThemeTokens.add(themeValue);
    resolvedValue = themeValue;
  }

  if (resolvedValue === undefined) return fallback >>> 0;
  const numeric = finiteNumber(resolvedValue);
  if (
    numeric !== undefined &&
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= 0xffffffff
  ) {
    return (numeric <= 0xffffff ? numeric * 0x100 + 0xff : numeric) >>> 0;
  }
  if (typeof resolvedValue === 'string') {
    const parsed = parsePatchMapCssColor(resolvedValue);
    if (parsed !== undefined) return parsed;
    const fallbackToken = rootThemeToken ?? resolvedValue;
    const hashed = deterministicPatchMapTokenColor(fallbackToken);
    warnPatchMapParse(
      state,
      path,
      'color-fallback',
      `Unknown color token ${JSON.stringify(fallbackToken)} used deterministic hash fallback`,
    );
    return hashed;
  }
  warnPatchMapParse(
    state,
    path,
    'color-fallback',
    'Unsupported color value used the documented fallback',
  );
  return fallback >>> 0;
}

export function inspectAttributes(
  attrs: PatchMapParserRecord | undefined,
  path: string,
  type: string,
  state: PatchMapParseState,
): void {
  if (!attrs) return;
  if (Object.hasOwn(attrs, 'angle') && Object.hasOwn(attrs, 'rotation')) {
    fatalPatchMapParse(
      state,
      path,
      'transform-rotation-conflict',
      'angle and rotation are mutually exclusive',
    );
  }
  for (const key of Object.keys(attrs)) {
    if (
      (TRANSFORM_ATTRIBUTE_KEYS.has(key) || SIGNED_SCALE_ATTRIBUTE_KEYS.has(key) || key === 'zIndex') &&
      finiteNumber(attrs[key]) === undefined
    ) {
      fatalPatchMapParse(
        state,
        `${path}.${key}`,
        'invalid-transform-attribute',
        `${key} must be a finite number`,
      );
    }
    if (key === 'alpha') {
      const alpha = finiteNumber(attrs[key]);
      if (alpha === undefined || alpha < 0 || alpha > 1) {
        fatalPatchMapParse(
          state,
          `${path}.${key}`,
          'invalid-transform-attribute',
          'alpha must be a finite number in the range 0..1',
        );
      }
    }
    const projected = key === 'alpha' ||
      (TRANSFORM_ATTRIBUTE_KEYS.has(key) && TRANSFORM_ATTRIBUTE_TYPES.has(type)) ||
      (SIGNED_SCALE_ATTRIBUTE_KEYS.has(key) && SIGNED_SCALE_ATTRIBUTE_TYPES.has(type)) ||
      (key === 'zIndex' && Z_INDEX_ATTRIBUTE_TYPES.has(type));
    if (projected || key === 'metadata') continue;
    warnPatchMapParseOnce(
      state,
      `attr:${type}:${key}`,
      `${path}.${key}`,
      'attribute-preserved-only',
      `Attribute ${JSON.stringify(key)} is preserved in identity but has no dense-store projection`,
    );
  }
}

function numericAttribute(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  if (value === undefined) return 0;
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  fatalPatchMapParse(state, path, 'invalid-transform-attribute', 'Transform value must be finite');
}

function scaleAttribute(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  if (value === undefined) return 1;
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  fatalPatchMapParse(state, path, 'invalid-transform-attribute', 'Scale value must be finite');
}

export function zIndex(attrs: unknown): number {
  return isParserRecord(attrs) ? finiteNumber(attrs.zIndex) ?? 0 : 0;
}

export function eventInteractivity(
  value: unknown,
  fallback: boolean,
  path: string,
  state: PatchMapParseState,
): boolean {
  if (value === undefined) return fallback;
  if (value === 'none' || value === 'passive') return false;
  if (value === 'auto' || value === 'static' || value === 'dynamic') return fallback;
  warnPatchMapParse(
    state,
    path,
    'invalid-event-mode',
    'Invalid eventMode fell back to the inherited hit-test policy',
  );
  return fallback;
}

export function projectedOpacity(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  const opacity = finiteNumber(value);
  if (opacity === undefined) {
    fatalPatchMapParse(state, path, 'invalid-opacity', 'Opacity must be a finite number in 0..1');
  }
  if (opacity < 0 || opacity > 1) {
    fatalPatchMapParse(state, path, 'invalid-opacity', 'Opacity must be a finite number in 0..1');
  }
  return opacity;
}

export function attributeAlpha(
  attrs: PatchMapParserRecord | undefined,
  path: string,
  state: PatchMapParseState,
): number {
  return attrs?.alpha === undefined ? 1 : projectedOpacity(attrs.alpha, path, state);
}

export function projectedRadius(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number | undefined {
  const scalar = finiteNumber(value);
  if (scalar !== undefined) return Math.max(0, scalar);
  const corners = Array.isArray(value)
    ? value.map((entry) => finiteNumber(entry))
    : isParserRecord(value)
      ? [
          finiteNumber(value.topLeft) ?? 0,
          finiteNumber(value.topRight) ?? 0,
          finiteNumber(value.bottomRight) ?? 0,
          finiteNumber(value.bottomLeft) ?? 0,
        ]
      : undefined;
  if (corners !== undefined && corners.length === 4 && corners.every((entry) => entry !== undefined)) {
    warnPatchMapParse(
      state,
      path,
      'corner-radius-degraded',
      'Per-corner radius uses the maximum corner in the scalar dense renderer',
    );
    return Math.max(0, ...corners);
  }
  if (value !== undefined) {
    warnPatchMapParse(state, path, 'invalid-radius', 'Invalid radius was omitted from dense rendering');
  }
  return undefined;
}

export function fontWeight(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  if (numeric !== undefined) return numeric;
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  return undefined;
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isParserRecord(value: unknown): value is PatchMapParserRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rotationDegrees(
  attrs: PatchMapParserRecord | undefined,
  path: string,
  state: PatchMapParseState,
): number {
  const angle = finiteNumber(attrs?.angle);
  if (angle !== undefined) return angle;
  const rotation = finiteNumber(attrs?.rotation);
  if (rotation !== undefined) return rotation * 180 / Math.PI;
  if (attrs?.angle !== undefined || attrs?.rotation !== undefined) {
    fatalPatchMapParse(
      state,
      path,
      'invalid-transform-attribute',
      'angle and rotation must be finite numbers',
    );
  }
  return 0;
}

export function nonNegative(value: number, path: string, state: PatchMapParseState): number {
  if (value >= 0) return value;
  warnPatchMapParse(state, path, 'negative-length', 'Negative length was clamped to zero');
  return 0;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
