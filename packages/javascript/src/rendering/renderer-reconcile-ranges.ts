import type { PatchMapProjectionIndex, PatchMapTextProjection } from '../parsing/contracts';
import type { SlotRange } from '../dense/contracts';
import {
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';

export function projectionStalenessChangedRanges(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
  slotByEntityId: ReadonlyMap<string, number>,
): SlotRange[] {
  const slots: number[] = [];
  for (const entityId of previous) {
    if (next.has(entityId)) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot !== undefined) slots.push(slot);
  }
  for (const entityId of next) {
    if (previous.has(entityId)) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot !== undefined) slots.push(slot);
  }
  return contiguousRanges(slots);
}

export function mergeRanges(left: readonly SlotRange[], right: readonly SlotRange[]): SlotRange[] {
  const sorted = [...left, ...right]
    .filter(({ start, end }) => Number.isInteger(start) && Number.isInteger(end) && end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: SlotRange[] = [];
  for (const range of sorted) {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) {
      result[result.length - 1] = { start: previous.start, end: Math.max(previous.end, range.end) };
    } else {
      result.push({ start: range.start, end: range.end });
    }
  }
  return result;
}

export function projectionChangedRanges(
  store: RenderStoreView,
  before: PatchMapProjectionIndex,
  after: PatchMapProjectionIndex,
): SlotRange[] {
  const slots: number[] = [];
  const changedEndpointIds = new Set<string>();
  for (let slot = 0; slot < store.capacity; slot += 1) {
    const id = store.ids[slot];
    if (!id) continue;
    const entityChanged = before.byEntityId[id] !== after.byEntityId[id] &&
      JSON.stringify(before.byEntityId[id]) !== JSON.stringify(after.byEntityId[id]);
    const relationChanged = before.relationsByEntityId[id] !== after.relationsByEntityId[id] &&
      JSON.stringify(before.relationsByEntityId[id]) !==
        JSON.stringify(after.relationsByEntityId[id]);
    const imageChanged = before.imagesByEntityId[id] !== after.imagesByEntityId[id] &&
      JSON.stringify(before.imagesByEntityId[id]) !==
        JSON.stringify(after.imagesByEntityId[id]);
    const componentChanged =
      before.componentsByEntityId[id] !== after.componentsByEntityId[id] &&
      JSON.stringify(before.componentsByEntityId[id]) !==
        JSON.stringify(after.componentsByEntityId[id]);
    const backgroundChanged =
      before.backgroundsByEntityId[id] !== after.backgroundsByEntityId[id] &&
      JSON.stringify(before.backgroundsByEntityId[id]) !==
        JSON.stringify(after.backgroundsByEntityId[id]);
    const textChanged = textProjectionChanged(
      before.textsByEntityId[id],
      after.textsByEntityId[id],
    );
    if (entityChanged) changedEndpointIds.add(id);
    if (
      entityChanged ||
      relationChanged ||
      imageChanged ||
      componentChanged ||
      backgroundChanged ||
      textChanged
    ) {
      slots.push(slot);
    }
  }
  if (changedEndpointIds.size > 0) {
    for (let slot = 0; slot < store.capacity; slot += 1) {
      const id = store.ids[slot];
      const relation = id ? after.relationsByEntityId[id] : undefined;
      if (
        relation &&
        (changedEndpointIds.has(relation.sourceId) || changedEndpointIds.has(relation.targetId))
      ) {
        slots.push(slot);
      }
    }
  }
  return contiguousRanges([...new Set(slots)].sort((left, right) => left - right));
}

export function projectionOrientationRanges(
  store: RenderStoreView,
  index: PatchMapProjectionIndex,
  orientation: 'follow-item' | 'upright',
): SlotRange[] {
  const slots: number[] = [];
  for (let slot = 0; slot < store.capacity; slot += 1) {
    const id = store.ids[slot];
    if (id && index.byEntityId[id]?.contentOrientation === orientation) slots.push(slot);
  }
  return contiguousRanges(slots);
}

export function contiguousRanges(slots: readonly number[]): SlotRange[] {
  const ranges: SlotRange[] = [];
  for (const slot of slots) {
    const previous = ranges.at(-1);
    if (previous?.end === slot) {
      ranges[ranges.length - 1] = { start: previous.start, end: slot + 1 };
    } else {
      ranges.push({ start: slot, end: slot + 1 });
    }
  }
  return ranges;
}

/**
 * A relation can live in a different fixed Mesh chunk from either endpoint.
 * Expand endpoint dirtiness before layer synchronization so visibility and
 * geometry cannot leave a stale relation buffer even on injected stores that
 * report endpoint-only ranges.
 */
export function expandPatchMapRelationDependencyRanges(
  store: RenderStoreView,
  ranges: readonly SlotRange[],
  adjacency?: ReadonlyMap<number, readonly number[]>,
): SlotRange[] {
  if (ranges.length === 0) return [];
  const dirtySlots = new Set<number>();
  const dirtyEndpoints = new Set<number>();
  for (const range of ranges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      dirtySlots.add(slot);
      if ((store.kind[slot] as number) !== RenderKind.Relation) dirtyEndpoints.add(slot);
    }
  }
  if (dirtyEndpoints.size > 0 && adjacency) {
    for (const endpoint of dirtyEndpoints) {
      for (const relationSlot of adjacency.get(endpoint) ?? []) dirtySlots.add(relationSlot);
    }
  } else if (dirtyEndpoints.size > 0) {
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (
        (store.alive[slot] as number) === 1 &&
        (store.kind[slot] as number) === RenderKind.Relation &&
        (
          dirtyEndpoints.has(store.relationFrom[slot] as number) ||
          dirtyEndpoints.has(store.relationTo[slot] as number)
        )
      ) {
        dirtySlots.add(slot);
      }
    }
  }
  return contiguousRanges([...dirtySlots].sort((left, right) => left - right));
}

export function buildPatchMapRelationAdjacency(store: RenderStoreView): Readonly<{
  byEndpoint: ReadonlyMap<number, readonly number[]>;
  relationSlots: Set<number>;
  endpointsByRelation: ReadonlyMap<number, readonly [number, number]>;
}> {
  const mutable = new Map<number, number[]>();
  const relationSlots = new Set<number>();
  const endpointsByRelation = new Map<number, readonly [number, number]>();
  for (let slot = 0; slot < store.capacity; slot += 1) {
    if (
      (store.alive[slot] as number) !== 1 ||
      (store.kind[slot] as number) !== RenderKind.Relation
    ) {
      continue;
    }
    relationSlots.add(slot);
    endpointsByRelation.set(slot, Object.freeze([
      store.relationFrom[slot] as number,
      store.relationTo[slot] as number,
    ]));
    const source = store.relationFrom[slot] as number;
    const target = store.relationTo[slot] as number;
    appendRelationAdjacency(mutable, source, slot);
    if (target !== source) appendRelationAdjacency(mutable, target, slot);
  }
  return Object.freeze({
    byEndpoint: new Map(
      [...mutable].map(([endpoint, slots]) => [endpoint, Object.freeze(slots)] as const),
    ),
    relationSlots,
    endpointsByRelation,
  });
}

export function rangesTouchPatchMapRelationTopology(
  store: RenderStoreView,
  ranges: readonly SlotRange[],
  knownRelationSlots: ReadonlySet<number>,
  endpointsByRelation: ReadonlyMap<number, readonly [number, number]>,
): boolean {
  for (const range of ranges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      const currentlyRelation = (store.alive[slot] as number) === 1 &&
        (store.kind[slot] as number) === RenderKind.Relation;
      if (!knownRelationSlots.has(slot)) {
        if (currentlyRelation) return true;
        continue;
      }
      if (!currentlyRelation) return true;
      const previous = endpointsByRelation.get(slot);
      if (
        !previous ||
        previous[0] !== (store.relationFrom[slot] as number) ||
        previous[1] !== (store.relationTo[slot] as number)
      ) {
        return true;
      }
    }
  }
  return false;
}

function textProjectionChanged(
  before: PatchMapTextProjection | undefined,
  after: PatchMapTextProjection | undefined,
): boolean {
  if (before === after) return false;
  if (before === undefined || after === undefined) return true;
  return before.entityId !== after.entityId ||
    before.targetKind !== after.targetKind ||
    before.ownerId !== after.ownerId ||
    before.componentId !== after.componentId ||
    before.contentSignature !== after.contentSignature ||
    before.styleSignature !== after.styleSignature ||
    before.layoutSignature !== after.layoutSignature ||
    before.color !== after.color ||
    before.contentOrientation !== after.contentOrientation ||
    before.placement !== after.placement ||
    before.margin.top !== after.margin.top ||
    before.margin.right !== after.margin.right ||
    before.margin.bottom !== after.margin.bottom ||
    before.margin.left !== after.margin.left ||
    JSON.stringify(before.authoredStyle) !== JSON.stringify(after.authoredStyle);
}

function appendRelationAdjacency(
  adjacency: Map<number, number[]>,
  endpoint: number,
  relationSlot: number,
): void {
  if (endpoint < 0) return;
  const slots = adjacency.get(endpoint);
  if (slots === undefined) adjacency.set(endpoint, [relationSlot]);
  else slots.push(relationSlot);
}
