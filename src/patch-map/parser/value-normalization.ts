import type { Rgba } from '../dense/contracts';
import type { PatchMapContentOrientation } from '../contracts';
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
const Z_INDEX_ATTRIBUTE_TYPES = new Set(['rect', 'image', 'text', 'relations']);

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
  const length = componentLength(value, Math.min(reference.width, reference.height), path, state);
  return { width: length, height: length };
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
  if (typeof value === 'string') {
    warnPatchMapParse(state, path, 'invalid-placement', 'Invalid placement fell back to center');
  }
  return 'center';
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

export function componentLength(
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
  } else if (typeof placementValue === 'string') {
    warnPatchMapParse(
      state,
      `${path}.placement`,
      'invalid-placement',
      'Invalid placement fell back to center',
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
  const x = finiteNumber(value.x) ?? 0;
  const y = finiteNumber(value.y) ?? 0;
  return {
    top: finiteNumber(value.top) ?? y,
    right: finiteNumber(value.right) ?? x,
    bottom: finiteNumber(value.bottom) ?? y,
    left: finiteNumber(value.left) ?? x,
  };
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
    'Relation endpoint must be a string or { id }',
    sourceId,
  );
}

export function resolveColor(
  value: unknown,
  fallback: Rgba,
  path: string,
  state: PatchMapParseState,
): Rgba {
  if (value === undefined) return fallback >>> 0;
  const numeric = finiteNumber(value);
  if (
    numeric !== undefined &&
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= 0xffffffff
  ) {
    return (numeric <= 0xffffff ? numeric * 0x100 + 0xff : numeric) >>> 0;
  }
  if (typeof value === 'string') {
    const themeValue = state.options.colors?.[value] ?? PATCH_MAP_DEFAULT_COLOR_THEME[value];
    if (themeValue !== undefined && themeValue !== value) {
      return resolveColor(themeValue, fallback, path, state);
    }
    const parsed = parsePatchMapCssColor(value);
    if (parsed !== undefined) return parsed;
    const hashed = deterministicPatchMapTokenColor(value);
    warnPatchMapParse(
      state,
      path,
      'color-fallback',
      `Unknown color token ${JSON.stringify(value)} used deterministic hash fallback`,
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
  for (const key of Object.keys(attrs)) {
    if (key === 'skew' || key === 'skewX' || key === 'skewY') {
      warnPatchMapParseOnce(
        state,
        `affine-skew:${type}:${key}`,
        `${path}.${key}`,
        'affine-skew-unsupported',
        'Authored skew is preserved in identity but is outside the orthogonal PatchMap projection contract',
      );
      continue;
    }
    if (key === 'pivot' || key === 'pivotX' || key === 'pivotY') {
      warnPatchMapParseOnce(
        state,
        `affine-pivot:${type}:${key}`,
        `${path}.${key}`,
        'affine-pivot-unsupported',
        'Authored pivot is preserved in identity but PatchMap uses the PATCH MAP top-left origin',
      );
      continue;
    }
    const projected = key === 'alpha' ||
      (key === 'display' && type === 'image') ||
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

export function numericAttribute(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  if (value !== undefined) {
    warnPatchMapParse(state, path, 'invalid-number', 'Invalid numeric attribute fell back to zero');
  }
  return 0;
}

export function scaleAttribute(
  value: unknown,
  path: string,
  state: PatchMapParseState,
): number {
  if (value === undefined) return 1;
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  warnPatchMapParse(state, path, 'invalid-scale', 'Invalid signed scale fell back to one');
  return 1;
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
    warnPatchMapParse(state, path, 'invalid-opacity', 'Invalid opacity fell back to fully opaque');
    return 1;
  }
  if (opacity < 0 || opacity > 1) {
    warnPatchMapParse(state, path, 'opacity-clamped', 'Opacity outside 0..1 was clamped');
  }
  return clamp01(opacity);
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
  if (
    corners !== undefined &&
    corners.length === 4 &&
    corners.every((entry) => entry !== undefined)
  ) {
    warnPatchMapParse(
      state,
      path,
      'corner-radius-degraded',
      'Per-corner radius is preserved by the semantic dataset and uses the maximum corner in the scalar dense renderer',
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
    warnPatchMapParse(state, path, 'invalid-rotation', 'Invalid angle/rotation fell back to zero');
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
