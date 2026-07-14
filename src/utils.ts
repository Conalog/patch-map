import { JSONPath } from 'jsonpath-plus';
import type { Container, PointData } from 'pixi.js';

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

export const uid = (): string => {
  const bytes = new Uint8Array(15);
  const crypto = globalThis.crypto;

  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return [...bytes].map((value) => ID_ALPHABET[value & 63]).join('');
};

export const selector = <T = unknown>(root?: unknown, path?: unknown): T[] => {
  if (path === undefined) return [];
  if (typeof path !== 'string') {
    if (root === '') {
      const error = new Error(
        'JSONPath should not be called with "new" (it prevents return of (unwrapped) scalar values)',
      );
      error.name = 'NewError';
      throw error;
    }
    throw new TypeError('r.replaceAll is not a function');
  }

  if (
    root !== null &&
    typeof root !== 'string' &&
    typeof root !== 'number' &&
    typeof root !== 'boolean' &&
    typeof root !== 'object'
  ) {
    return [];
  }

  const result = JSONPath<unknown[]>({ path, json: root, wrap: true });
  return result.flat() as T[];
};

interface LegacyProperties {
  transform?: {
    x?: number;
    y?: number;
  };
  [key: string]: unknown;
}

interface LegacyEntry {
  id?: string;
  properties?: LegacyProperties;
}

/** Convert the documented grouped v0.9 data shape into current item data. */
export const convertLegacyData = (data: unknown): unknown[] => {
  const output: unknown[] = [];

  for (const [group, groupedEntries] of Object.entries(data as object)) {
    if (
      groupedEntries === null ||
      groupedEntries === undefined ||
      typeof (groupedEntries as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function'
    ) {
      // Preserve the public v0.10 failure exposed for non-grouped array input.
      throw new TypeError('n is not iterable');
    }

    const display = group.slice(0, -1);
    for (const candidate of groupedEntries as Iterable<unknown>) {
      const entry = candidate as LegacyEntry;
      if (entry?.properties === undefined) {
        throw new TypeError(
          "Cannot destructure property 'transform' of 's.properties' as it is undefined.",
        );
      }

      const { transform, ...metadata } = entry.properties;
      // Deliberately read these fields directly. A missing transform is part of
      // the observable legacy-conversion error contract.
      const x = transform!.x;
      const y = transform!.y;
      const themeColor = 'primary.default';

      output.push({
        type: 'item',
        id: entry.id,
        size: 40,
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: themeColor,
              radius: 6,
            },
          },
          {
            type: 'icon',
            source: display,
            size: 24,
            tint: themeColor,
            placement: 'center',
          },
          {
            type: 'bar',
            show: false,
            size: '100%',
            source: { type: 'rect', radius: 3, fill: 'white' },
            tint: themeColor,
          },
        ],
        attrs: {
          x,
          y,
          metadata,
          display,
          zIndex: 10,
        },
      });
    }
  }

  return output;
};

const isPointData = (value: unknown): value is PointData =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as PointData).x === 'number' &&
  Number.isFinite((value as PointData).x) &&
  typeof (value as PointData).y === 'number' &&
  Number.isFinite((value as PointData).y);

interface BoundsHandle {
  getBounds(): { x: number; y: number; width: number; height: number };
}

const isBoundsHandle = (value: unknown): value is BoundsHandle =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as BoundsHandle).getBounds === 'function';

export const intersectPoint = (element?: unknown, point?: unknown): boolean => {
  if (!isBoundsHandle(element) || !isPointData(point)) return false;
  const bounds = element.getBounds();
  return point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height;
};

export const isMoved = (
  start?: unknown,
  end?: unknown,
  threshold = 3,
): boolean =>
  isPointData(start) &&
  isPointData(end) &&
  Math.hypot(end.x - start.x, end.y - start.y) >= threshold;

export const findIntersectObject = <T extends Container>(
  root?: T,
  point?: unknown,
): Container | null => {
  const children = (root as T).children;
  if (!children || typeof children[Symbol.iterator] !== 'function') {
    throw new TypeError('r.children is not iterable');
  }
  for (const child of children) {
    if (intersectPoint(child, point)) return child;
  }
  return null;
};
