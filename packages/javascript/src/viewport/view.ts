import type { CoreBounds, CorePoint, CoreView } from '../dense/contracts';

export const PATCH_MAP_MIN_SCALE = 0.1;
export const PATCH_MAP_MAX_SCALE = 8;

export function screenToWorld(point: CorePoint, view: CoreView): CorePoint {
  assertView(view);
  assertPoint(point, 'point');
  const translatedX = point.x - view.x;
  const translatedY = point.y - view.y;
  const radians = -degreesToRadians(view.rotation ?? 0);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({
    x: (translatedX * cosine - translatedY * sine) / view.scale,
    y: (translatedX * sine + translatedY * cosine) / view.scale,
  });
}

export function worldToScreen(point: CorePoint, view: CoreView): CorePoint {
  assertView(view);
  assertPoint(point, 'point');
  const radians = degreesToRadians(view.rotation ?? 0);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scaledX = point.x * view.scale;
  const scaledY = point.y * view.scale;
  return Object.freeze({
    x: view.x + scaledX * cosine - scaledY * sine,
    y: view.y + scaledX * sine + scaledY * cosine,
  });
}

export function zoomViewAt(
  view: CoreView,
  screenPoint: CorePoint,
  scale: number,
  limits: { readonly min?: number; readonly max?: number } = {},
): CoreView {
  assertView(view);
  const min = limits.min ?? PATCH_MAP_MIN_SCALE;
  const max = limits.max ?? PATCH_MAP_MAX_SCALE;
  if (!(min > 0) || !(max >= min)) throw new RangeError('invalid view scale limits');
  const nextScale = Math.max(min, Math.min(max, scale));
  const worldPoint = screenToWorld(screenPoint, view);
  const rotation = view.rotation ?? 0;
  const rotated = rotateScaled(worldPoint, nextScale, rotation);
  return Object.freeze({
    x: screenPoint.x - rotated.x,
    y: screenPoint.y - rotated.y,
    scale: nextScale,
    rotation,
  });
}

export function panView(view: CoreView, delta: CorePoint): CoreView {
  assertView(view);
  assertPoint(delta, 'delta');
  return Object.freeze({
    x: view.x + delta.x,
    y: view.y + delta.y,
    scale: view.scale,
    rotation: view.rotation ?? 0,
  });
}

export function fitView(
  bounds: CoreBounds,
  viewport: { readonly width: number; readonly height: number },
  padding = 24,
  limits: { readonly min?: number; readonly max?: number } = {},
): CoreView {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !(bounds.width >= 0) ||
    !(bounds.height >= 0)
  ) {
    throw new TypeError('bounds must contain finite non-negative geometry');
  }
  if (!(viewport.width > 0) || !(viewport.height > 0) || !(padding >= 0)) {
    throw new RangeError('viewport must be positive and padding must be non-negative');
  }
  const min = limits.min ?? PATCH_MAP_MIN_SCALE;
  const max = limits.max ?? PATCH_MAP_MAX_SCALE;
  if (!(min > 0) || !(max >= min)) throw new RangeError('invalid view scale limits');
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const widthScale = bounds.width > 0 ? availableWidth / bounds.width : max;
  const heightScale = bounds.height > 0 ? availableHeight / bounds.height : max;
  const scale = Math.max(min, Math.min(max, widthScale, heightScale));
  return Object.freeze({
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
    rotation: 0,
  });
}

export function boundsFor(
  values: readonly { readonly bounds: CoreBounds; readonly visible: boolean; readonly kind?: string }[],
): CoreBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value.visible || value.kind === 'relation') continue;
    minX = Math.min(minX, value.bounds.x);
    minY = Math.min(minY, value.bounds.y);
    maxX = Math.max(maxX, value.bounds.x + value.bounds.width);
    maxY = Math.max(maxY, value.bounds.y + value.bounds.height);
  }
  if (!Number.isFinite(minX)) return null;
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function rotateScaled(point: CorePoint, scale: number, rotation: number): CorePoint {
  const radians = degreesToRadians(rotation);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x * scale;
  const y = point.y * scale;
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

function assertView(view: CoreView): void {
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !(view.scale > 0) ||
    !Number.isFinite(view.rotation ?? 0)
  ) {
    throw new TypeError('view must contain finite x/y/rotation and positive scale');
  }
}

function assertPoint(point: CorePoint, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite x and y`);
  }
}

function degreesToRadians(value: number): number {
  return value * (Math.PI / 180);
}
