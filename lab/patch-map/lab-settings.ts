/**
 * Human-operated Lab viewport limits.
 *
 * Keep these separate from the product defaults and the exact contract runner:
 * large exploratory scenes need a lower floor so their complete world can be
 * inspected without changing approved viewport semantics elsewhere.
 */
export const PATCH_MAP_PERFORMANCE_LAB_ZOOM_LIMITS =
  Object.freeze([0.025, 8] as const);

export const PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS =
  Object.freeze([0.025, 30] as const);
