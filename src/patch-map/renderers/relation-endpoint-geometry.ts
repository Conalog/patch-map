import {
  RenderFlags,
  type RenderStoreView,
} from '../dense/renderer-types';
import type { PatchMapRelationEndpointGeometry } from '../semantic/relations';

/**
 * Build the shared endpoint geometry consumed by aggregate relation renderers.
 */
export function resolvePatchMapRelationEndpointGeometry(
  store: RenderStoreView,
  slot: number,
  vertices: readonly number[],
  center: readonly [number, number],
): PatchMapRelationEndpointGeometry {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index] as number;
    const y = vertices[index + 1] as number;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Object.freeze({
    id: store.ids[slot] ?? `@slot:${slot}`,
    center: Object.freeze([center[0], center[1]] as const),
    worldBounds: Object.freeze([minX, minY, maxX - minX, maxY - minY] as const),
    visible: ((store.flags[slot] as number) & RenderFlags.Visible) !== 0,
  });
}
