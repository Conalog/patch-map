import type {
  ComponentIdentity,
  ParsePatchMapResult,
} from '../contracts';

export interface PatchMapDirectTextParseTargetIndex {
  readonly rootIndex: number;
  readonly componentIndex: number;
  readonly componentPath: string;
  readonly entityId: string;
  readonly entityIndex: number;
}

interface DirectTextParseIndexes {
  readonly rootIds: readonly string[];
  readonly targets: ReadonlyMap<string, PatchMapDirectTextParseTargetIndex>;
}

const DIRECT_TEXT_PARSE_INDEX_CACHE = new WeakMap<
  ParsePatchMapResult,
  DirectTextParseIndexes
>();

export function cachePatchMapDirectParseIndexes(
  target: ParsePatchMapResult,
  indexes: DirectTextParseIndexes,
): void {
  DIRECT_TEXT_PARSE_INDEX_CACHE.set(target, indexes);
}

export function directTextTargetKey(ownerId: string, componentId: string): string {
  return `${ownerId.length}:${ownerId}:${componentId}`;
}

export function directTextParseIndexes(
  previous: ParsePatchMapResult,
  rootCount: number,
): DirectTextParseIndexes | null {
  const cached = DIRECT_TEXT_PARSE_INDEX_CACHE.get(previous);
  if (cached !== undefined) {
    return cached.rootIds.length === rootCount ? cached : null;
  }
  const rootIds = new Array<string | undefined>(rootCount);
  for (const identity of previous.identity.elements) {
    const match = /^\$\[(\d+)\]$/u.exec(identity.sourcePath);
    if (match === null) continue;
    const index = Number(match[1]);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= rootCount ||
      rootIds[index] !== undefined
    ) {
      return null;
    }
    rootIds[index] = identity.sourceId;
  }
  if (rootIds.some((rootId) => rootId === undefined)) return null;

  const componentIdentities = new Map<string, ComponentIdentity>();
  for (const identity of previous.identity.components) {
    const key = directTextTargetKey(identity.sourceElementId, identity.componentId);
    if (componentIdentities.has(key)) return null;
    componentIdentities.set(key, identity);
  }
  const entityIndices = new Map(
    previous.document.entities.map((entity, index) => [entity.id, index] as const),
  );
  if (entityIndices.size !== previous.document.entities.length) return null;

  const targets = new Map<string, PatchMapDirectTextParseTargetIndex>();
  for (const projection of Object.values(previous.projection.textsByEntityId)) {
    if (
      projection.targetKind !== 'component' ||
      projection.ownerId === undefined ||
      projection.componentId === undefined
    ) {
      continue;
    }
    const key = directTextTargetKey(projection.ownerId, projection.componentId);
    const identity = componentIdentities.get(key);
    const pathMatch = identity === undefined
      ? null
      : /^\$\[(\d+)\]\.components\[(\d+)\]$/u.exec(identity.componentPath);
    const rootIndex = pathMatch === null ? Number.NaN : Number(pathMatch[1]);
    const componentIndex = pathMatch === null ? Number.NaN : Number(pathMatch[2]);
    const entityIndex = entityIndices.get(projection.entityId);
    if (
      targets.has(key) ||
      identity === undefined ||
      !Number.isSafeInteger(rootIndex) ||
      rootIndex < 0 ||
      rootIndex >= rootCount ||
      !Number.isSafeInteger(componentIndex) ||
      componentIndex < 0 ||
      rootIds[rootIndex] !== projection.ownerId ||
      entityIndex === undefined ||
      !identity.entityIds.includes(projection.entityId)
    ) {
      return null;
    }
    targets.set(key, Object.freeze({
      rootIndex,
      componentIndex,
      componentPath: identity.componentPath,
      entityId: projection.entityId,
      entityIndex,
    }));
  }
  const result = Object.freeze({
    rootIds: Object.freeze(rootIds as string[]),
    targets,
  });
  DIRECT_TEXT_PARSE_INDEX_CACHE.set(previous, result);
  return result;
}
