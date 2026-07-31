import type {
  EntityInput,
  EntityKind,
  SceneDocument,
} from '../dense/contracts';
import {
  PatchMapParseError,
  type ComponentIdentity,
  type ElementIdentity,
  type EntitySourceIdentity,
  type ExpandedItemIdentity,
  type ParseDiagnostic,
  type ParsePatchMapOptions,
  type ParsePatchMapResult,
  type PatchMapBackgroundPaintProjection,
  type PatchMapBarProjection,
  type PatchMapComponentVisualProjection,
  type PatchMapEntityProjection,
  type PatchMapImageProjection,
  type PatchMapOmittedRelationProjection,
  type PatchMapRelationProjection,
  type PatchMapTextProjection,
} from '../contracts';
import type { PatchMapParserTransform } from './transform-projection';

export interface PatchMapMutableElementIdentity extends Omit<ElementIdentity, 'entityIds'> {
  entityIds: string[];
}

export interface PatchMapMutableComponentIdentity extends Omit<ComponentIdentity, 'entityIds'> {
  entityIds: string[];
}

export interface PatchMapMutableExpandedItemIdentity extends Omit<ExpandedItemIdentity, 'entityIds'> {
  entityIds: string[];
}

export interface PatchMapParserEntityOwner {
  readonly element: PatchMapMutableElementIdentity;
  readonly ancestors: readonly PatchMapMutableElementIdentity[];
  readonly opacity: number;
  readonly instance?: PatchMapMutableExpandedItemIdentity;
  readonly component?: PatchMapMutableComponentIdentity;
}

export interface PatchMapPendingRelation {
  readonly path: string;
  readonly entityId: string;
  readonly relationId: string;
  readonly authoredIndex: number;
  readonly from: string;
  readonly to: string;
  readonly transform: PatchMapParserTransform;
  readonly owner: PatchMapParserEntityOwner;
  readonly entity: Extract<EntityInput, { readonly kind: 'relation' }>;
}

export interface PatchMapParseState {
  readonly options: ParsePatchMapOptions;
  readonly entities: EntityInput[];
  readonly diagnostics: ParseDiagnostic[];
  readonly elementIdentities: PatchMapMutableElementIdentity[];
  readonly sourceElementPathById: Map<string, string>;
  readonly componentIdentities: PatchMapMutableComponentIdentity[];
  readonly componentIdentityByPath: Map<string, PatchMapMutableComponentIdentity>;
  readonly expandedItems: PatchMapMutableExpandedItemIdentity[];
  readonly entityIds: Set<string>;
  readonly targetIds: Set<string>;
  readonly entityIdsBySourceId: Record<string, string[]>;
  readonly entityIdsByComponentId: Record<string, string[]>;
  readonly entitySourceById: Record<string, EntitySourceIdentity>;
  readonly projectionByEntityId: Record<string, PatchMapEntityProjection>;
  readonly componentVisualProjectionByEntityId: Record<string, PatchMapComponentVisualProjection>;
  readonly backgroundPaintProjectionByEntityId: Record<string, PatchMapBackgroundPaintProjection>;
  readonly imageProjectionByEntityId: Record<string, PatchMapImageProjection>;
  readonly textProjectionByEntityId: Record<string, PatchMapTextProjection>;
  readonly barProjectionByEntityId: Record<string, PatchMapBarProjection>;
  readonly relationProjectionByEntityId: Record<string, PatchMapRelationProjection>;
  readonly omittedRelations: PatchMapOmittedRelationProjection[];
  readonly pendingRelations: PatchMapPendingRelation[];
  readonly relationPairsBySourceId: Map<string, Set<string>>;
  readonly warned: Set<string>;
  sourceElements: number;
  relationLinks: number;
  gridCells: number;
}

export interface PatchMapElementContext {
  readonly transform: PatchMapParserTransform;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly opacity: number;
  readonly ancestorIdentities: readonly PatchMapMutableElementIdentity[];
}

export function createPatchMapParseState(options: ParsePatchMapOptions): PatchMapParseState {
  return {
    options,
    entities: [],
    diagnostics: [],
    elementIdentities: [],
    sourceElementPathById: new Map(),
    componentIdentities: [],
    componentIdentityByPath: new Map(),
    expandedItems: [],
    entityIds: new Set(),
    targetIds: new Set(),
    entityIdsBySourceId: Object.create(null) as Record<string, string[]>,
    entityIdsByComponentId: Object.create(null) as Record<string, string[]>,
    entitySourceById: Object.create(null) as Record<string, EntitySourceIdentity>,
    projectionByEntityId: Object.create(null) as Record<string, PatchMapEntityProjection>,
    componentVisualProjectionByEntityId: Object.create(null) as Record<
      string,
      PatchMapComponentVisualProjection
    >,
    backgroundPaintProjectionByEntityId: Object.create(null) as Record<
      string,
      PatchMapBackgroundPaintProjection
    >,
    imageProjectionByEntityId: Object.create(null) as Record<string, PatchMapImageProjection>,
    textProjectionByEntityId: Object.create(null) as Record<string, PatchMapTextProjection>,
    barProjectionByEntityId: Object.create(null) as Record<string, PatchMapBarProjection>,
    relationProjectionByEntityId: Object.create(null) as Record<string, PatchMapRelationProjection>,
    omittedRelations: [],
    pendingRelations: [],
    relationPairsBySourceId: new Map(),
    warned: new Set(),
    sourceElements: 0,
    relationLinks: 0,
    gridCells: 0,
  };
}

export function finishPatchMapParseState(
  state: PatchMapParseState,
  freezeResult = true,
): ParsePatchMapResult {
  const kinds: Record<EntityKind, number> = {
    rect: 0,
    text: 0,
    image: 0,
    bar: 0,
    relation: 0,
  };
  for (const entity of state.entities) kinds[entity.kind] += 1;

  const document: SceneDocument = {
    version: 1,
    entities: state.entities,
  };
  const result: ParsePatchMapResult = {
    document,
    diagnostics: state.diagnostics,
    identity: {
      counts: {
        sourceElements: state.sourceElements,
        sourceComponents: state.componentIdentities.length,
        expandedItems: state.expandedItems.length,
        gridCells: state.gridCells,
        relationLinks: state.relationLinks,
        entities: state.entities.length,
        kinds,
      },
      entityIds: state.entities.map((entity) => entity.id),
      entityIdsBySourceId: state.entityIdsBySourceId,
      entityIdsByComponentId: state.entityIdsByComponentId,
      entitySourceById: state.entitySourceById,
      elements: state.elementIdentities,
      components: state.componentIdentities,
      expandedItems: state.expandedItems,
    },
    projection: {
      byEntityId: state.projectionByEntityId,
      componentsByEntityId: state.componentVisualProjectionByEntityId,
      backgroundsByEntityId: state.backgroundPaintProjectionByEntityId,
      imagesByEntityId: state.imageProjectionByEntityId,
      textsByEntityId: state.textProjectionByEntityId,
      barsByEntityId: state.barProjectionByEntityId,
      relationsByEntityId: state.relationProjectionByEntityId,
      omittedRelations: state.omittedRelations,
    },
  };

  return freezeResult ? deepFreezePatchMapParserValue(result) : result;
}

export function warnPatchMapParse(
  state: PatchMapParseState,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
  entityId?: string,
): void {
  state.diagnostics.push({
    level: 'warning',
    code,
    path,
    message,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(entityId !== undefined ? { entityId } : {}),
  });
}

export function warnPatchMapParseOnce(
  state: PatchMapParseState,
  key: string,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
): void {
  if (state.warned.has(key)) return;
  state.warned.add(key);
  warnPatchMapParse(state, path, code, message, sourceId);
}

export function fatalPatchMapParse(
  state: PatchMapParseState,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
  entityId?: string,
): never {
  state.diagnostics.push({
    level: 'error',
    code,
    path,
    message,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(entityId !== undefined ? { entityId } : {}),
  });
  throw new PatchMapParseError(
    message,
    deepFreezePatchMapParserValue([...state.diagnostics]),
  );
}

export function clonePatchMapParserJson<T>(
  value: T,
  seen = new Map<object, unknown>(),
): T {
  if (typeof value !== 'object' || value === null) return value;
  const existing = seen.get(value as object);
  if (existing !== undefined) return existing as T;
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value) clone.push(clonePatchMapParserJson(entry, seen));
    return clone as T;
  }
  const clone: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  seen.set(value as object, clone);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = clonePatchMapParserJson(entry, seen);
  }
  return clone as T;
}

export function deepFreezePatchMapParserValue<T>(
  value: T,
  seen = new WeakSet<object>(),
): T {
  if (typeof value !== 'object' || value === null || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreezePatchMapParserValue(entry, seen);
  }
  return Object.freeze(value);
}

export async function deepFreezePatchMapParserValueAsync<T>(value: T): Promise<T> {
  if (typeof value !== 'object' || value === null) return value;
  const seen = new WeakSet<object>();
  const pending: object[] = [value as object];
  let sliceStarted = patchMapParserNow();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const nested of Object.values(current as Record<string, unknown>)) {
      if (typeof nested === 'object' && nested !== null && !seen.has(nested)) {
        pending.push(nested);
      }
    }
    Object.freeze(current);
    if (patchMapParserNow() - sliceStarted < 8 || pending.length === 0) continue;
    await yieldPatchMapParserTask();
    sliceStarted = patchMapParserNow();
  }
  return value;
}

export function patchMapParserNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function yieldPatchMapParserTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
