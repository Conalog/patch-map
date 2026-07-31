import type { EntityInput } from '../dense/contracts';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  createPatchMapAffine,
  patchMapAffineBasis,
  patchMapAffineCenter,
} from '../semantic/geometry';
import {
  clonePatchMapParserJson as cloneJson,
  fatalPatchMapParse as fatal,
  warnPatchMapParse as warn,
  type PatchMapElementContext as ElementContext,
  type PatchMapMutableComponentIdentity as MutableComponentIdentity,
  type PatchMapMutableElementIdentity as MutableElementIdentity,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parse-state';
import type { PatchMapEntityProjectionDraft as EntityProjectionDraft } from './transform-projection';
import {
  isParserRecord as isRecord,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';

export const ROOT_CONTEXT: ElementContext = {
  transform: {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    affine: PATCH_MAP_IDENTITY_AFFINE,
    imageIntrinsicTransform: Object.freeze({
      parentAffine: PATCH_MAP_IDENTITY_AFFINE,
      localTranslationAffine: PATCH_MAP_IDENTITY_AFFINE,
      localRotationScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
      localPivotScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
    }),
  },
  visible: true,
  interactive: true,
  opacity: 1,
  ancestorIdentities: [],
};

export function addEntity(
  entity: EntityInput,
  owner: EntityOwner,
  state: ParseState,
  projection?: EntityProjectionDraft,
): void {
  if (state.entityIds.has(entity.id)) {
    fatal(
      state,
      owner.component?.componentPath ?? owner.element.sourcePath,
      'duplicate-entity-id',
      `Duplicate visible entity ID ${JSON.stringify(entity.id)}`,
      owner.element.sourceId,
      entity.id,
    );
  }
  const storedEntity = entity.kind !== 'relation' && entity.kind !== 'text' &&
    (entity.width === 0 || entity.height === 0) && entity.interactive
    ? Object.freeze({ ...entity, interactive: false }) as EntityInput
    : entity;
  state.entityIds.add(entity.id);
  if (entity.kind !== 'relation') state.targetIds.add(entity.id);
  state.entities.push(storedEntity);
  if (entity.kind !== 'relation') {
    const affine = projection?.affine ?? createPatchMapAffine(
      entity.x,
      entity.y,
      entity.rotation ?? 0,
    );
    state.projectionByEntityId[entity.id] = Object.freeze({
      entityId: entity.id,
      localBounds: projection?.localBounds ?? Object.freeze([
        0,
        0,
        entity.width,
        entity.height,
      ] as const),
      affine,
      worldBasis: patchMapAffineBasis(affine),
      visibleCenter: projection?.affine
        ? patchMapAffineCenter(projection.affine, projection.localBounds)
        : Object.freeze([entity.x + entity.width / 2, entity.y + entity.height / 2] as const),
      rotationDegrees: projection?.rotationDegrees ?? entity.rotation ?? 0,
      scaleX: projection?.scaleX ?? 1,
      scaleY: projection?.scaleY ?? 1,
      contentOrientation: projection?.contentOrientation ?? 'follow-item',
      ...(owner.instance ? { ownerItemId: owner.instance.instanceId } : {}),
      ...(owner.component
        ? {
            componentId: owner.component.componentId,
            componentType: owner.component.type,
          }
        : {}),
    });
  }
  owner.element.entityIds.push(entity.id);
  appendRecord(state.entityIdsBySourceId, owner.element.sourceId, entity.id);
  for (const ancestor of owner.ancestors) {
    ancestor.entityIds.push(entity.id);
    appendRecord(state.entityIdsBySourceId, ancestor.sourceId, entity.id);
  }
  owner.instance?.entityIds.push(entity.id);
  if (owner.component) {
    owner.component.entityIds.push(entity.id);
    appendRecord(state.entityIdsByComponentId, owner.component.componentId, entity.id);
  }
  state.entitySourceById[entity.id] = {
    entityId: entity.id,
    sourceElementId: owner.element.sourceId,
    sourceElementPath: owner.element.sourcePath,
    ...(owner.instance ? { instanceId: owner.instance.instanceId } : {}),
    ...(owner.component
      ? {
          componentId: owner.component.componentId,
          componentPath: owner.component.componentPath,
        }
      : {}),
  };
}

export function createElementIdentity(
  value: JsonRecord,
  sourceId: string,
  sourcePath: string,
  type: string,
): MutableElementIdentity {
  const attrs = isRecord(value.attrs) ? cloneJson(value.attrs) as Readonly<Record<string, unknown>> : undefined;
  const metadata = value.metadata ?? (isRecord(value.attrs) ? value.attrs.metadata : undefined);
  return {
    sourceId,
    sourcePath,
    type,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    entityIds: [],
    ...(attrs ? { rawAttrs: attrs } : {}),
    ...(metadata !== undefined ? { rawMetadata: cloneJson(metadata) } : {}),
  };
}

export function componentIdentity(
  value: JsonRecord,
  componentId: string,
  componentPath: string,
  type: string,
  sourceElementId: string,
  state: ParseState,
): MutableComponentIdentity {
  const existing = state.componentIdentityByPath.get(componentPath);
  if (existing) return existing;
  const attrs = isRecord(value.attrs) ? cloneJson(value.attrs) as Readonly<Record<string, unknown>> : undefined;
  const metadata = value.metadata ?? (isRecord(value.attrs) ? value.attrs.metadata : undefined);
  const identity: MutableComponentIdentity = {
    componentId,
    componentPath,
    type,
    sourceElementId,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    entityIds: [],
    ...(attrs ? { rawAttrs: attrs } : {}),
    ...(metadata !== undefined ? { rawMetadata: cloneJson(metadata) } : {}),
  };
  state.componentIdentityByPath.set(componentPath, identity);
  state.componentIdentities.push(identity);
  return identity;
}

export function sourceIdentifier(
  value: unknown,
  fallback: string,
  path: string,
  state: ParseState,
): string {
  if (typeof value === 'string' && value.length > 0) return value;
  warn(state, `${path}.id`, 'generated-id', `Missing/invalid ID was replaced with deterministic ${JSON.stringify(fallback)}`);
  return fallback;
}

export function registerSourceElementId(sourceId: string, sourcePath: string, state: ParseState): void {
  const existingPath = state.sourceElementPathById.get(sourceId);
  if (existingPath !== undefined) {
    fatal(
      state,
      `${sourcePath}.id`,
      'duplicate-source-element-id',
      `Duplicate source element ID ${JSON.stringify(sourceId)}; first declared at ${existingPath}`,
      sourceId,
    );
  }
  state.sourceElementPathById.set(sourceId, sourcePath);
}

export function pathToken(path: string): string {
  return path.replace(/^\$\.?/, '').replace(/[^a-zA-Z0-9_-]+/g, '.').replace(/^\.|\.$/g, '') || 'root';
}

function appendRecord(record: Record<string, string[]>, key: string, value: string): void {
  const list = record[key] ?? (record[key] = []);
  list.push(value);
}
