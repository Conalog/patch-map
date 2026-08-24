import type {
  PatchMapPointerPolicy,
  PatchMapSelectionDisplayMode,
  PatchMapSelectionPolicy,
  PatchMapTarget,
} from '../developer-api/contracts';
import { parsePatchMapCssColor } from '../parser/color';
import type { PatchMapEnginePointerInput } from './public-contracts';
import type {
  PatchMapLogicalSceneIndex,
  PatchMapLogicalTargetSnapshot,
} from '../query-selection';
import type { PatchMapPointerGestureProbe } from '../pointer-gesture';

export interface NormalizedPointerSelectionPolicy {
  readonly allowMultiple: boolean;
  readonly clearOnBlankClick: 'single' | 'double' | 'never';
  readonly deselectOnTargetDoubleClick: boolean;
  readonly box: Readonly<{
    readonly partialIntersection: boolean;
    readonly activationModifier: 'none' | 'shift';
    readonly visual: Readonly<{
      readonly color: number;
      readonly strokeCssPx: number;
      readonly fillAlpha: number;
    }>;
  }> | null;
  readonly isSelectable: ((target: PatchMapTarget) => boolean) | null;
  readonly resolveModifierSelection:
    NonNullable<PatchMapSelectionPolicy['resolveModifierSelection']> | null;
  readonly visual: Readonly<{
    readonly color: number;
    readonly strokeCssPx: number;
    readonly strokeScale: 'fixed' | 'viewport';
    readonly minStrokeCssPx: number;
    readonly strokeAlignment: 'outside' | 'center' | 'inside';
    readonly mode: PatchMapSelectionDisplayMode;
  }>;
}

export interface NormalizedPointerPolicy {
  readonly hoverDuringPress: boolean;
  readonly tooltip: Readonly<{
    readonly pinOnContextMenu: boolean;
    readonly preventDefault: boolean;
  }>;
}

export const DEFAULT_POINTER_SELECTION_POLICY: NormalizedPointerSelectionPolicy = Object.freeze({
  allowMultiple: true,
  clearOnBlankClick: 'single' as const,
  deselectOnTargetDoubleClick: false,
  box: null,
  isSelectable: null,
  resolveModifierSelection: null,
  visual: Object.freeze({
    color: 0x2f80ed,
    strokeCssPx: 2,
    strokeScale: 'fixed' as const,
    minStrokeCssPx: 1,
    strokeAlignment: 'center' as const,
    mode: 'all' as const,
  }),
});

export const DEFAULT_POINTER_POLICY: NormalizedPointerPolicy = Object.freeze({
  hoverDuringPress: false,
  tooltip: Object.freeze({
    pinOnContextMenu: false,
    preventDefault: true,
  }),
});

export function normalizePointerSelectionPolicy(
  value: PatchMapSelectionPolicy | undefined,
): NormalizedPointerSelectionPolicy {
  if (value === undefined) return DEFAULT_POINTER_SELECTION_POLICY;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('selection policy must be an object');
  }
  if (value.allowMultiple !== undefined && typeof value.allowMultiple !== 'boolean') {
    throw new TypeError('selection.allowMultiple must be boolean');
  }
  if (
    value.clearOnBlankClick !== undefined &&
    value.clearOnBlankClick !== 'single' &&
    value.clearOnBlankClick !== 'double' &&
    value.clearOnBlankClick !== 'never'
  ) {
    throw new TypeError('selection.clearOnBlankClick must be single, double, or never');
  }
  if (
    value.deselectOnTargetDoubleClick !== undefined &&
    typeof value.deselectOnTargetDoubleClick !== 'boolean'
  ) {
    throw new TypeError('selection.deselectOnTargetDoubleClick must be boolean');
  }
  if (value.isSelectable !== undefined && typeof value.isSelectable !== 'function') {
    throw new TypeError('selection.isSelectable must be a function');
  }
  if (
    value.resolveModifierSelection !== undefined &&
    typeof value.resolveModifierSelection !== 'function'
  ) {
    throw new TypeError('selection.resolveModifierSelection must be a function');
  }
  const visual = normalizePointerSelectionVisualPolicy(value.visual);
  let box: NormalizedPointerSelectionPolicy['box'] = null;
  if (value.box === true) {
    box = Object.freeze({
      partialIntersection: true,
      activationModifier: 'none',
      visual: normalizePointerBoxVisualPolicy(undefined, visual),
    });
  } else if (value.box !== undefined && value.box !== false) {
    if (value.box === null || typeof value.box !== 'object' || Array.isArray(value.box)) {
      throw new TypeError('selection.box must be boolean or an object');
    }
    if (
      value.box.partialIntersection !== undefined &&
      typeof value.box.partialIntersection !== 'boolean'
    ) {
      throw new TypeError('selection.box.partialIntersection must be boolean');
    }
    if (
      value.box.activationModifier !== undefined &&
      value.box.activationModifier !== 'none' &&
      value.box.activationModifier !== 'shift'
    ) {
      throw new TypeError('selection.box.activationModifier must be none or shift');
    }
    box = Object.freeze({
      partialIntersection: value.box.partialIntersection ?? true,
      activationModifier: value.box.activationModifier ?? 'none',
      visual: normalizePointerBoxVisualPolicy(value.box.visual, visual),
    });
  }
  return Object.freeze({
    allowMultiple: value.allowMultiple ?? true,
    clearOnBlankClick: value.clearOnBlankClick ?? 'single',
    deselectOnTargetDoubleClick: value.deselectOnTargetDoubleClick ?? false,
    box,
    isSelectable: value.isSelectable ?? null,
    resolveModifierSelection: value.resolveModifierSelection ?? null,
    visual,
  });
}

export function normalizePointerPolicy(
  value: PatchMapPointerPolicy | undefined,
): NormalizedPointerPolicy {
  if (value === undefined) return DEFAULT_POINTER_POLICY;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('pointer policy must be an object');
  }
  if (
    value.hoverDuringPress !== undefined &&
    typeof value.hoverDuringPress !== 'boolean'
  ) {
    throw new TypeError('pointer.hoverDuringPress must be boolean');
  }
  const tooltip = value.tooltip;
  if (tooltip !== undefined && (
    tooltip === null || typeof tooltip !== 'object' || Array.isArray(tooltip)
  )) {
    throw new TypeError('pointer.tooltip must be an object');
  }
  if (
    tooltip?.pinOnContextMenu !== undefined &&
    typeof tooltip.pinOnContextMenu !== 'boolean'
  ) {
    throw new TypeError('pointer.tooltip.pinOnContextMenu must be boolean');
  }
  if (
    tooltip?.preventDefault !== undefined &&
    typeof tooltip.preventDefault !== 'boolean'
  ) {
    throw new TypeError('pointer.tooltip.preventDefault must be boolean');
  }
  return Object.freeze({
    hoverDuringPress: value.hoverDuringPress ?? false,
    tooltip: Object.freeze({
      pinOnContextMenu: tooltip?.pinOnContextMenu ?? false,
      preventDefault: tooltip?.preventDefault ?? true,
    }),
  });
}

export function blankClickClearsSelection(
  mode: NormalizedPointerSelectionPolicy['clearOnBlankClick'],
  clickCount: number,
): boolean {
  return mode === 'single' || (mode === 'double' && clickCount === 2);
}

export function pointerBoxActivationMatches(
  box: NonNullable<NormalizedPointerSelectionPolicy['box']>,
  input: PatchMapEnginePointerInput,
): boolean {
  return box.activationModifier === 'none' || input.modifiers.shift;
}

export function publicPointerTarget(target: PatchMapLogicalTargetSnapshot): PatchMapTarget {
  return target.kind === 'element'
    ? Object.freeze({ id: target.id })
    : Object.freeze({ id: target.ownerId!, componentId: target.id });
}

export function samePublicPointerTarget(
  left: PatchMapTarget | null,
  right: PatchMapTarget | null,
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.id === right.id &&
    left.componentId === right.componentId
  );
}

export function screenBoundsContain(
  bounds: readonly [number, number, number, number],
  point: readonly [number, number],
): boolean {
  return bounds.every(Number.isFinite) &&
    bounds[2] >= 0 &&
    bounds[3] >= 0 &&
    point[0] >= bounds[0] &&
    point[0] <= bounds[0] + bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[1] + bounds[3];
}

export function pointerTargetPaintOrder(
  left: PatchMapLogicalTargetSnapshot,
  right: PatchMapLogicalTargetSnapshot,
): number {
  return pointerTargetZIndex(right) - pointerTargetZIndex(left) ||
    right.depth - left.depth ||
    right.sceneOrder - left.sceneOrder ||
    left.key.localeCompare(right.key);
}

export function selectionGeometryIds(
  index: PatchMapLogicalSceneIndex,
  selectionIds: readonly string[],
): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const selectionId of selectionIds) {
    let target = index.target(selectionId);
    if (target === null) continue;
    if (target.kind === 'component') {
      const ownerId = target.ownerId;
      target = ownerId === null ? null : index.target(ownerId);
      if (target === null) continue;
    }
    if (!seen.has(target.selectionId)) {
      seen.add(target.selectionId);
      ids.push(target.selectionId);
    }
  }
  return Object.freeze(ids);
}

export function destroyedPointerGestureProbe(): PatchMapPointerGestureProbe {
  return Object.freeze({
    activePointerCount: 0,
    pointerCaptureCount: 0,
    activeGestureCount: 0,
    hoverTarget: null,
    hoverListenerCount: 0,
    staleGestureCount: 0,
    destroyed: true,
  });
}

function normalizePointerSelectionVisualPolicy(
  value: PatchMapSelectionPolicy['visual'],
): NormalizedPointerSelectionPolicy['visual'] {
  if (value === undefined) return DEFAULT_POINTER_SELECTION_POLICY.visual;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('selection.visual must be an object');
  }
  const mode = value.displayMode ?? 'all';
  if (!['all', 'group-only', 'element-only', 'hidden'].includes(mode)) {
    throw new TypeError('selection.visual.displayMode is unsupported');
  }
  const strokeCssPx = value.strokeWidth ?? 2;
  if (!(strokeCssPx > 0) || !Number.isFinite(strokeCssPx)) {
    throw new RangeError('selection.visual.strokeWidth must be positive and finite');
  }
  const strokeScale = value.strokeScale ?? 'fixed';
  if (strokeScale !== 'fixed' && strokeScale !== 'viewport') {
    throw new TypeError('selection.visual.strokeScale must be fixed or viewport');
  }
  const minStrokeCssPx = value.minStrokeWidth ?? Math.min(1, strokeCssPx);
  if (!(minStrokeCssPx > 0) || !Number.isFinite(minStrokeCssPx)) {
    throw new RangeError('selection.visual.minStrokeWidth must be positive and finite');
  }
  if (minStrokeCssPx > strokeCssPx) {
    throw new RangeError('selection.visual.minStrokeWidth cannot exceed strokeWidth');
  }
  const strokeAlignment = value.strokeAlignment ?? 'center';
  if (!['outside', 'center', 'inside'].includes(strokeAlignment)) {
    throw new TypeError('selection.visual.strokeAlignment is unsupported');
  }
  return Object.freeze({
    color: normalizePointerSelectionColor(value.color, 'selection.visual.color'),
    strokeCssPx,
    strokeScale,
    minStrokeCssPx,
    strokeAlignment,
    mode,
  });
}

function normalizePointerBoxVisualPolicy(
  value: NonNullable<Extract<PatchMapSelectionPolicy['box'], object>>['visual'],
  fallback: NormalizedPointerSelectionPolicy['visual'],
): NonNullable<NormalizedPointerSelectionPolicy['box']>['visual'] {
  if (value === undefined) {
    return Object.freeze({
      color: fallback.color,
      strokeCssPx: fallback.strokeCssPx,
      fillAlpha: 0.08,
    });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('selection.box.visual must be an object');
  }
  const strokeCssPx = value.strokeWidth ?? fallback.strokeCssPx;
  if (!(strokeCssPx > 0) || !Number.isFinite(strokeCssPx)) {
    throw new RangeError('selection.box.visual.strokeWidth must be positive and finite');
  }
  const fillAlpha = value.fillAlpha ?? 0.08;
  if (!Number.isFinite(fillAlpha) || fillAlpha < 0 || fillAlpha > 1) {
    throw new RangeError('selection.box.visual.fillAlpha must be between 0 and 1');
  }
  return Object.freeze({
    color: value.color === undefined
      ? fallback.color
      : normalizePointerSelectionColor(value.color, 'selection.box.visual.color'),
    strokeCssPx,
    fillAlpha,
  });
}

function normalizePointerSelectionColor(
  value: number | string | undefined,
  path: 'selection.visual.color' | 'selection.box.visual.color',
): number {
  if (value === undefined) return 0x2f80ed;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
      throw new RangeError(`${path} number must be a 0xRRGGBB integer`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a number or CSS color string`);
  }
  const packed = parsePatchMapCssColor(value);
  if (packed === undefined) {
    throw new TypeError(`${path} is not a supported CSS color`);
  }
  return packed >>> 8;
}

function pointerTargetZIndex(target: PatchMapLogicalTargetSnapshot): number {
  const attrs = target.value.attrs;
  const zIndex = attrs !== null &&
    typeof attrs === 'object' &&
    !Array.isArray(attrs) &&
    typeof (attrs as Readonly<Record<string, unknown>>).zIndex === 'number'
    ? (attrs as Readonly<{ readonly zIndex: number }>).zIndex
    : null;
  return zIndex !== null && Number.isFinite(zIndex) ? zIndex : target.zIndex;
}
