import type { ParsePatchMapResult } from '../contracts';
import type { PatchMapPresentationFillOverride } from '../presentation-policy';
import type { PatchMapReconcileOptions as PatchMapDenseReconcileOptions } from '../semantic/reconcile';
import { sameStringArray } from '../shared/string-array-values';
import type { PatchMapReconcileOptions } from './contracts';
import type { PatchMapIndexedComponentTarget } from './published-scene-state';
import { patchMapComponentProbeTargetKey } from './product-probe-reader';

/**
 * Project semantic reconcile permissions and selection onto dense store IDs.
 * Runtime publication remains the responsibility of PatchMapRuntime.
 */
export function denseReconcileOptions(
  options: PatchMapReconcileOptions,
  current: ParsePatchMapResult,
  candidate: ParsePatchMapResult,
  currentSelectionIds: readonly string[],
): PatchMapDenseReconcileOptions {
  const allowedRetainedOrderIds = Object.freeze([
    ...(options.allowedRetainedOrderIds ?? []),
    ...elementOrderDenseIds(current, options.allowedElementOrderIds),
    ...elementOrderDenseIds(candidate, options.allowedElementOrderIds),
    ...componentOrderDenseIds(current, options.allowedComponentOrderOwners),
    ...componentOrderDenseIds(candidate, options.allowedComponentOrderOwners),
  ]);
  return Object.freeze({
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
    ...(options.selectionIds === undefined
      ? {}
      : selectionReconcileOption(candidate, options.selectionIds, currentSelectionIds)),
    ...(allowedRetainedOrderIds.length === 0 ? {} : { allowedRetainedOrderIds }),
  });
}

function selectionReconcileOption(
  candidate: ParsePatchMapResult,
  semanticIds: readonly string[],
  currentSelectionIds: readonly string[],
): Readonly<{ readonly selectionIds?: readonly string[] }> {
  const selectionIds = semanticSelectionDenseIds(candidate, semanticIds);
  return sameStringArray(selectionIds, currentSelectionIds)
    ? Object.freeze({})
    : Object.freeze({ selectionIds });
}

/** Map caller-visible element and component identities onto stable dense IDs. */
export function semanticSelectionDenseIds(
  parse: ParsePatchMapResult,
  semanticIds: readonly string[],
  componentTargets?: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
): readonly string[] {
  if (!Array.isArray(semanticIds)) throw new TypeError('selectionIds must be an array');
  const denseIds = new Set<string>();
  semanticIds.forEach((semanticId, index) => {
    if (typeof semanticId !== 'string' || semanticId.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    if (Object.hasOwn(parse.identity.entitySourceById, semanticId)) {
      denseIds.add(semanticId);
      return;
    }
    const components = parse.projection.componentsByEntityId ?? {};
    const separator = semanticId.indexOf('/');
    if (
      separator > 0 &&
      separator < semanticId.length - 1 &&
      componentTargets !== undefined
    ) {
      const indexed = componentTargets.get(patchMapComponentProbeTargetKey({
        ownerId: semanticId.slice(0, separator),
        componentId: semanticId.slice(separator + 1),
      }));
      if (indexed) denseIds.add(indexed.entityId);
    }
    for (const component of Object.values(components)) {
      const semanticOwnerId =
        parse.identity.entitySourceById[component.entityId]?.sourceElementId ??
        component.ownerId;
      if (
        component.logicalIdentity === semanticId ||
        (
          separator > 0 &&
          (
            component.ownerId === semanticId.slice(0, separator) ||
            semanticOwnerId === semanticId.slice(0, separator)
          ) &&
          component.componentId === semanticId.slice(separator + 1)
        )
      ) {
        denseIds.add(component.entityId);
      }
    }
    for (const entityId of parse.identity.entityIdsBySourceId[semanticId] ?? []) {
      if (Object.hasOwn(parse.identity.entitySourceById, entityId)) denseIds.add(entityId);
    }
  });
  return Object.freeze([...denseIds]);
}

/** Map only semantic element identities, keeping component selection ownership unchanged. */
export function semanticSelectionElementDenseIds(
  parse: ParsePatchMapResult,
  semanticIds: readonly string[],
): readonly string[] {
  if (!Array.isArray(semanticIds)) throw new TypeError('selectionIds must be an array');
  const denseIds = new Set<string>();
  semanticIds.forEach((semanticId, index) => {
    if (typeof semanticId !== 'string' || semanticId.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    if (Object.hasOwn(parse.identity.entitySourceById, semanticId)) {
      denseIds.add(semanticId);
    }
    for (const entityId of parse.identity.entityIdsBySourceId[semanticId] ?? []) {
      const source = parse.identity.entitySourceById[entityId];
      if (source?.sourceElementId === semanticId && source.componentId === undefined) {
        denseIds.add(entityId);
      }
    }
  });
  return Object.freeze([...denseIds]);
}

/** Resolve semantic fill overrides to deterministic dense background targets. */
export function resolvePresentationFillOverrides(
  parse: ParsePatchMapResult,
  overrides: readonly PatchMapPresentationFillOverride[],
): readonly PatchMapPresentationFillOverride[] {
  const resolved = new Map<string, number>();
  for (const { id, packedColor } of overrides) {
    for (const entityId of semanticPresentationFillDenseIds(parse, id)) {
      resolved.set(entityId, packedColor);
    }
  }
  return Object.freeze([...resolved].map(([id, packedColor]) =>
    Object.freeze({ id, packedColor }),
  ).sort((left, right) => left.id.localeCompare(right.id)));
}

export function semanticPresentationFillDenseIds(
  parse: ParsePatchMapResult,
  semanticId: string,
): readonly string[] {
  const backgroundIds = Object.values(parse.projection.componentsByEntityId ?? {})
    .filter((component) =>
      component.ownerId === semanticId &&
      component.renderRole === 'background-geometry'
    )
    .map(({ entityId }) => entityId)
    .sort();
  return backgroundIds.length > 0
    ? Object.freeze(backgroundIds)
    : semanticSelectionDenseIds(parse, [semanticId]);
}


function elementOrderDenseIds(
  parse: ParsePatchMapResult,
  elementIds: readonly string[] | undefined,
): readonly string[] {
  if (elementIds === undefined || elementIds.length === 0) return Object.freeze([]);
  const ids = new Set<string>();
  elementIds.forEach((elementId, index) => {
    if (typeof elementId !== 'string' || elementId.length === 0) {
      throw new TypeError(`allowedElementOrderIds[${index}] must be a non-empty string`);
    }
    for (const entityId of parse.identity.entityIdsBySourceId[elementId] ?? []) {
      ids.add(entityId);
    }
  });
  return Object.freeze([...ids].sort());
}

function componentOrderDenseIds(
  parse: ParsePatchMapResult,
  owners: readonly string[] | undefined,
): readonly string[] {
  if (owners === undefined || owners.length === 0) return Object.freeze([]);
  const ownerSet = new Set(owners.map((owner, index) => {
    if (typeof owner !== 'string' || owner.length === 0) {
      throw new TypeError(`allowedComponentOrderOwners[${index}] must be a non-empty string`);
    }
    return owner;
  }));
  const ids = new Set<string>();
  for (const component of parse.identity.components) {
    if (!ownerSet.has(component.sourceElementId)) continue;
    for (const entityId of component.entityIds) ids.add(entityId);
  }
  const components = parse.projection.componentsByEntityId ?? {};
  for (const entityId of Object.keys(components).sort()) {
    const component = components[entityId];
    if (component === undefined) continue;
    const semanticOwner = parse.identity.entitySourceById[entityId]?.sourceElementId;
    if (
      ownerSet.has(component.ownerId) ||
      (semanticOwner !== undefined && ownerSet.has(semanticOwner))
    ) {
      ids.add(entityId);
    }
  }
  return Object.freeze([...ids].sort());
}
