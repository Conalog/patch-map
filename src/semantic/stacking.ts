/** One authored sibling decision in a hierarchical paint-order path. */
export interface PatchMapStackingFrame {
  readonly zIndex: number;
  readonly authoredOrder: number;
}

export type PatchMapStackingPath = readonly PatchMapStackingFrame[];

export const PATCH_MAP_ROOT_STACKING_PATH: PatchMapStackingPath = Object.freeze([]);

export function appendPatchMapStackingFrame(
  path: PatchMapStackingPath,
  zIndex: number,
  authoredOrder: number,
): PatchMapStackingPath {
  return Object.freeze([
    ...path,
    Object.freeze({ zIndex, authoredOrder }),
  ]);
}

/** Compare hierarchy paths back-to-front without allowing descendants to escape their owner. */
export function comparePatchMapStackingPaths(
  left: PatchMapStackingPath,
  right: PatchMapStackingPath,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftFrame = left[index];
    const rightFrame = right[index];
    if (leftFrame === undefined || rightFrame === undefined) continue;
    const difference = leftFrame.zIndex - rightFrame.zIndex ||
      leftFrame.authoredOrder - rightFrame.authoredOrder;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function rankPatchMapStackingPaths(
  pathsByEntityId: Readonly<Record<string, PatchMapStackingPath>>,
): Readonly<Record<string, number>> {
  const ids = Object.keys(pathsByEntityId);
  const sourceOrder = new Map(ids.map((id, index) => [id, index]));
  ids.sort((left, right) =>
    comparePatchMapStackingPaths(
      pathsByEntityId[left] ?? PATCH_MAP_ROOT_STACKING_PATH,
      pathsByEntityId[right] ?? PATCH_MAP_ROOT_STACKING_PATH,
    ) || (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0));
  return Object.freeze(Object.fromEntries(ids.map((id, index) => [id, index])));
}

export const PATCH_MAP_PAINT_PASSES_PER_ENTITY = 4;

export function patchMapDisplayObjectZIndex(paintOrder: number, pass = 0): number {
  return paintOrder * PATCH_MAP_PAINT_PASSES_PER_ENTITY + pass;
}
