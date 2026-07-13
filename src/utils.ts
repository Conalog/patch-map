import { JSONPath } from 'jsonpath-plus';
import type { Container, PointData, Rectangle } from 'pixi.js';

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

export const uid = (): string => {
  const bytes = new Uint8Array(15);
  globalThis.crypto?.getRandomValues(bytes);
  if (!globalThis.crypto) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...bytes].map((value) => ID_ALPHABET[value & 63]).join('');
};

export const selector = <T = unknown>(path: string, root: unknown): T[] =>
  JSONPath({ path, json: root as object, wrap: true });

export const convertLegacyData = <T>(data: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);

export const intersectPoint = (
  point: PointData,
  bounds: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>,
): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

export const isMoved = (start: PointData, end: PointData, threshold = 3): boolean =>
  Math.hypot(end.x - start.x, end.y - start.y) >= threshold;

export const findIntersectObject = <T extends Container>(
  objects: readonly T[],
  point: PointData,
): T | null => {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!object) continue;
    if (object.visible && object.renderable && intersectPoint(point, object.getBounds())) {
      return object;
    }
  }
  return null;
};
