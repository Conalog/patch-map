import type { PatchMapProjectionIndex } from '../../../src/patch-map/contracts';

export function createTestProjectionIndex(
  overrides: Partial<PatchMapProjectionIndex> = {},
): PatchMapProjectionIndex {
  return Object.freeze({
    byEntityId: Object.freeze({}),
    componentsByEntityId: Object.freeze({}),
    backgroundsByEntityId: Object.freeze({}),
    imagesByEntityId: Object.freeze({}),
    textsByEntityId: Object.freeze({}),
    barsByEntityId: Object.freeze({}),
    relationsByEntityId: Object.freeze({}),
    omittedRelations: Object.freeze([]),
    ...overrides,
  });
}
