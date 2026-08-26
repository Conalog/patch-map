import type {
  PatchMapImageProjection,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import type { EntityInput } from '../dense/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  projectPatchMapInstanceComponentOverlay,
  type PatchMapInstanceComponentProjectionCache,
} from '../parsing/instance-component-overlay';
import { createPatchMapParseState } from '../parsing/parse-state';
import type { PatchMapRendererEntityPresentationOverride } from '../rendering-port';
import type {
  PatchMapComponent,
  PatchMapGridItemTemplate,
  PatchMapTextComponent,
} from '../semantic/dataset';
import { normalizePatchMapComponent } from '../semantic/dataset/root-normalization';
import { mergeRecords } from '../semantic/mutation/record-values';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';
import type { PatchMapRuntimeOptions } from './contracts';
import type {
  NormalizedPresentationPatch,
  PatchMapStoredInstancePresentation,
} from './instance-presentation-request';
import type { PatchMapIndexedComponentTarget } from './published-scene-state';

export interface PatchMapChangedInstancePresentation {
  readonly patch: NormalizedPresentationPatch;
  readonly indexed: PatchMapIndexedComponentTarget;
  readonly authoredComponent: PatchMapComponent | null;
  readonly stored: PatchMapStoredInstancePresentation | undefined;
  readonly componentChanged: boolean;
  readonly componentProjectionChanged: boolean;
}

interface PatchMapInstanceComponentPresentationProjectorOptions {
  readonly changes: readonly PatchMapChangedInstancePresentation[];
  readonly authored: PatchMapProjectionIndex;
  readonly ownedDataset: readonly unknown[] | null;
  readonly parseOptions: PatchMapRuntimeOptions['parse'];
  readonly store: RenderStoreView;
  readonly rendererOverrides: Map<string, PatchMapRendererEntityPresentationOverride>;
  readonly changedEntityIds: Set<string>;
  readonly recordStrategy: PatchMapStableRecordStrategy;
}

export interface PatchMapInstanceComponentPresentationProjector {
  project(change: PatchMapChangedInstancePresentation): void;
  finish(projection: PatchMapProjectionIndex): PatchMapProjectionIndex;
}

/** Owns background/text re-projection state for one presentation planning pass. */
export function createPatchMapInstanceComponentPresentationProjector(
  options: PatchMapInstanceComponentPresentationProjectorOptions,
): PatchMapInstanceComponentPresentationProjector {
  const {
    changes,
    authored,
    ownedDataset,
    parseOptions,
    store,
    rendererOverrides,
    changedEntityIds,
    recordStrategy,
  } = options;
  const cacheRepeatedTextProjection = shouldCacheRepeatedTextProjection(changes);
  const entitySelections = Object.create(null) as Record<
    string,
    PatchMapProjectionIndex['byEntityId'][string]
  >;
  const componentSelections = Object.create(null) as Record<
    string,
    NonNullable<PatchMapProjectionIndex['componentsByEntityId']>[string]
  >;
  const backgroundSelections = Object.create(null) as Record<
    string,
    NonNullable<PatchMapProjectionIndex['backgroundsByEntityId']>[string]
  >;
  const textSelections = Object.create(null) as Record<
    string,
    NonNullable<PatchMapProjectionIndex['textsByEntityId']>[string]
  >;
  const projectionEntityIds: string[] = [];
  const backgroundIds: string[] = [];
  const textIds: string[] = [];
  const imageSelections = new Map<string, PatchMapImageProjection | null>();
  const imageIds: string[] = [];
  const effectiveComponents = new Map<string, PatchMapComponent>();
  const effectiveTextTemplates = new Map<string, PatchMapTextComponent>();
  const componentProjectionCache: PatchMapInstanceComponentProjectionCache = {
    state: createPatchMapParseState(
      parseOptions ?? {},
      cacheRepeatedTextProjection ? new Map() : undefined,
    ),
    ...(cacheRepeatedTextProjection ? { textComponents: new Map() } : {}),
  };
  let ownerSlots: ReadonlyMap<string, number> | null = null;

  const project = (change: PatchMapChangedInstancePresentation): void => {
    const {
      patch,
      indexed,
      authoredComponent,
      stored,
      componentChanged,
      componentProjectionChanged,
    } = change;
    if (patch.type !== 'background' && patch.type !== 'text') {
      throw new TypeError('instance component projector requires a background or text patch');
    }
    if (!componentChanged || authoredComponent === null || ownedDataset === null) return;
    const entityId = indexed.entityId;
    if (patch.type === 'text' && !componentProjectionChanged && stored !== undefined) {
      ownerSlots ??= indexStoreSlots(store);
      const ownerSlot = ownerSlots.get(patch.target.id);
      if (ownerSlot === undefined) {
        throw new Error(`instance presentation owner slot is unavailable for ${entityId}`);
      }
      const ownerVisible = store.alive[ownerSlot] === 1 &&
        ((store.flags[ownerSlot] ?? 0) & RenderFlags.Visible) !== 0;
      const effectiveShow = stored.changes?.show ?? authoredComponent.show;
      const previousOverride = rendererOverrides.get(entityId);
      const nextOverride = Object.freeze({
        ...previousOverride,
        kind: RenderKind.Text,
        visible: ownerVisible && effectiveShow !== false,
      });
      rendererOverrides.set(entityId, nextOverride);
      if (!samePatchMapInstanceRendererOverride(previousOverride, nextOverride)) {
        changedEntityIds.add(entityId);
      }
      return;
    }

    projectionEntityIds.push(entityId);
    if (stored === undefined) {
      const authoredEntity = authored.byEntityId[entityId];
      const authoredVisual = authored.componentsByEntityId[entityId];
      if (
        authoredEntity === undefined ||
        (patch.type === 'background' && authoredVisual === undefined)
      ) {
        throw new Error(`authored instance presentation is missing ${entityId}`);
      }
      entitySelections[entityId] = authoredEntity;
      if (authoredVisual !== undefined) componentSelections[entityId] = authoredVisual;
      if (patch.type === 'background') {
        const authoredBackground = authored.backgroundsByEntityId[entityId];
        if (authoredBackground === undefined) {
          throw new Error(`authored background presentation is missing ${entityId}`);
        }
        backgroundSelections[entityId] = authoredBackground;
        backgroundIds.push(entityId);
        selectImageProjection(
          imageSelections,
          imageIds,
          entityId,
          authored.imagesByEntityId[entityId],
        );
      } else {
        const authoredText = authored.textsByEntityId[entityId];
        if (authoredText === undefined) {
          throw new Error(`authored text presentation is missing ${entityId}`);
        }
        textSelections[entityId] = authoredText;
        textIds.push(entityId);
      }
      rendererOverrides.delete(entityId);
      changedEntityIds.add(entityId);
      return;
    }

    const item = itemAtComponentPath(ownedDataset, indexed.componentPath);
    const ownerProjection = authored.byEntityId[patch.target.id];
    if (item === null || ownerProjection === undefined || indexed.componentPath === null) {
      throw new Error(`instance presentation owner is unavailable for ${entityId}`);
    }
    ownerSlots ??= indexStoreSlots(store);
    const ownerSlot = ownerSlots.get(patch.target.id);
    if (ownerSlot === undefined) {
      throw new Error(`instance presentation owner slot is unavailable for ${entityId}`);
    }
    const storedChanges = stored.changes ?? {};
    let effective: PatchMapComponent | undefined;
    if (
      patch.type === 'text' &&
      Object.hasOwn(storedChanges, 'text') &&
      typeof storedChanges.text === 'string'
    ) {
      const templateKey = `${indexed.componentPath}\u0000${textIndependentChangesSignature(
        storedChanges,
      )}`;
      let template = effectiveTextTemplates.get(templateKey);
      if (template === undefined) {
        const normalized = effectiveOverlayComponent(
          authoredComponent,
          storedChanges,
          indexed.componentPath,
        );
        if (normalized.type !== 'text') {
          throw new TypeError('instance presentation component type does not match authored component');
        }
        template = normalized;
        effectiveTextTemplates.set(templateKey, template);
      }
      const effectiveTextKey = cacheRepeatedTextProjection
        ? `${templateKey}\u0000${JSON.stringify(storedChanges.text)}`
        : null;
      effective = effectiveTextKey === null
        ? undefined
        : effectiveComponents.get(effectiveTextKey);
      effective ??= Object.freeze({ ...template, text: storedChanges.text });
      if (effectiveTextKey !== null) effectiveComponents.set(effectiveTextKey, effective);
    } else {
      const effectiveKey = cacheRepeatedTextProjection
        ? `${indexed.componentPath}\u0000${JSON.stringify(storedChanges)}`
        : null;
      effective = effectiveKey === null ? undefined : effectiveComponents.get(effectiveKey);
      effective ??= effectiveOverlayComponent(
        authoredComponent,
        storedChanges,
        indexed.componentPath,
      );
      if (effectiveKey !== null) effectiveComponents.set(effectiveKey, effective);
    }
    if (effective.type !== patch.type) {
      throw new TypeError('instance presentation component type does not match authored component');
    }
    const projected = projectPatchMapInstanceComponentOverlay(
      effective,
      indexed.componentPath,
      item,
      patch.target.id,
      indexed.semanticOwnerId,
      ownerProjection,
      store,
      ownerSlot,
      parseOptions,
      componentProjectionCache,
    );
    entitySelections[entityId] = projected.entityProjection;
    if (projected.componentProjection !== undefined) {
      componentSelections[entityId] = projected.componentProjection;
    }
    rendererOverrides.set(entityId, rendererOverrideFromEntity(projected.entity));
    if (patch.type === 'background') {
      if (projected.backgroundProjection === undefined) {
        throw new Error(`background overlay did not publish paint for ${entityId}`);
      }
      backgroundSelections[entityId] = projected.backgroundProjection;
      backgroundIds.push(entityId);
      selectImageProjection(imageSelections, imageIds, entityId, projected.imageProjection);
    } else {
      if (projected.textProjection === undefined) {
        throw new Error(`text overlay did not publish layout for ${entityId}`);
      }
      textSelections[entityId] = projected.textProjection;
      textIds.push(entityId);
    }
    changedEntityIds.add(entityId);
  };

  const finish = (projection: PatchMapProjectionIndex): PatchMapProjectionIndex => {
    let next = patchInstanceComponentProjection(
      projection,
      entitySelections,
      componentSelections,
      backgroundSelections,
      textSelections,
      projectionEntityIds,
      backgroundIds,
      textIds,
      recordStrategy,
    );
    if (imageIds.length > 0) {
      const imagesByEntityId = patchImageProjectionMembership(
        next.imagesByEntityId,
        imageSelections,
        imageIds,
      );
      next = Object.freeze({ ...next, imagesByEntityId });
    }
    return next;
  };

  return Object.freeze({ project, finish });
}

export function patchMapComponentAtDatasetPath(
  dataset: readonly unknown[],
  path: string | null,
): PatchMapComponent | null {
  const value = valueAtDatasetPath(dataset, path);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const component = value as Readonly<Record<string, unknown>>;
  return component.type === 'background' ||
      component.type === 'bar' ||
      component.type === 'icon' ||
      component.type === 'text'
    ? component as unknown as PatchMapComponent
    : null;
}

export function samePatchMapInstanceRendererOverride(
  left: PatchMapRendererEntityPresentationOverride | undefined,
  right: PatchMapRendererEntityPresentationOverride | null,
): boolean {
  if (!left || !right) return left === undefined && right === null;
  return Object.is(left.kind, right.kind) &&
    Object.is(left.visible, right.visible) &&
    Object.is(left.opacity, right.opacity) &&
    Object.is(left.fill, right.fill) &&
    Object.is(left.stroke, right.stroke) &&
    Object.is(left.strokeWidth, right.strokeWidth) &&
    Object.is(left.radius, right.radius) &&
    Object.is(left.source, right.source) &&
    Object.is(left.tint, right.tint) &&
    Object.is(left.trackFill, right.trackFill) &&
    Object.is(left.align, right.align);
}

function shouldCacheRepeatedTextProjection(
  changes: readonly Readonly<{
    readonly patch: NormalizedPresentationPatch;
    readonly stored: PatchMapStoredInstancePresentation | undefined;
    readonly componentProjectionChanged: boolean;
  }>[],
): boolean {
  const signatures = new Set<string>();
  let sampled = 0;
  for (const change of changes) {
    if (change.patch.type !== 'text' || !change.componentProjectionChanged) continue;
    signatures.add(JSON.stringify(change.stored?.changes ?? {}));
    sampled += 1;
    if (sampled >= 256) break;
  }
  return sampled < 64 || signatures.size <= sampled * 0.9;
}

function textIndependentChangesSignature(changes: Readonly<Record<string, unknown>>): string {
  let signature = '';
  for (const name of Object.keys(changes)) {
    if (name === 'text') continue;
    signature += `${JSON.stringify(name)}:${JSON.stringify(changes[name])};`;
  }
  return signature;
}

function itemAtComponentPath(
  dataset: readonly unknown[],
  componentPath: string | null,
): PatchMapGridItemTemplate | null {
  if (componentPath === null) return null;
  const path = componentPath.replace(/\.components\[\d+\]$/u, '');
  const value = valueAtDatasetPath(dataset, path);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Partial<PatchMapGridItemTemplate>;
  return item.size !== undefined && item.padding !== undefined &&
      item.contentOrientation !== undefined && Array.isArray(item.components)
    ? item as PatchMapGridItemTemplate
    : null;
}

function valueAtDatasetPath(dataset: readonly unknown[], path: string | null): unknown {
  if (path === null || !path.startsWith('$')) return null;
  let value: unknown = dataset;
  const tokens = path.slice(1).match(/(?:\.[A-Za-z]+|\[\d+\])/gu);
  if (!tokens || tokens.join('') !== path.slice(1)) return null;
  for (const token of tokens) {
    if (token.startsWith('[')) {
      if (!Array.isArray(value)) return null;
      value = value[Number(token.slice(1, -1))];
      continue;
    }
    if (value === null || typeof value !== 'object') return null;
    const key = token.slice(1);
    if (!Object.hasOwn(value, key)) return null;
    value = (value as Readonly<Record<string, unknown>>)[key];
  }
  return value;
}

function effectiveOverlayComponent(
  authored: PatchMapComponent,
  changes: Readonly<Record<string, unknown>>,
  path: string,
): PatchMapComponent {
  const candidate = mergeRecords(authored, changes);
  return normalizePatchMapComponent(
    candidate,
    path,
    `@instance-overlay:${authored.id}`,
    0,
    {
      elementIds: new Set(),
      componentIdsByOwner: new Map(),
      elementTypes: new Set(),
      componentTypes: new Set(),
    },
  );
}

function rendererOverrideFromEntity(
  entity: EntityInput,
): PatchMapRendererEntityPresentationOverride {
  const common = {
    visible: entity.visible ?? true,
    opacity: entity.opacity ?? 1,
  };
  if (entity.kind === 'rect') {
    return Object.freeze({
      ...common,
      kind: RenderKind.Rect,
      fill: entity.fill ?? 0x00000000,
      stroke: entity.stroke ?? 0x00000000,
      strokeWidth: entity.strokeWidth ?? 0,
      radius: entity.radius ?? 0,
    });
  }
  if (entity.kind === 'image') {
    return Object.freeze({
      ...common,
      kind: RenderKind.Image,
      source: entity.source,
      tint: entity.tint ?? 0xffffffff,
    });
  }
  if (entity.kind === 'text') {
    return Object.freeze({
      ...common,
      kind: RenderKind.Text,
      align: entity.align === 'center'
        ? RenderAlign.Center
        : entity.align === 'right'
          ? RenderAlign.Right
          : entity.align === 'justify'
            ? RenderAlign.Justify
            : RenderAlign.Left,
    });
  }
  throw new TypeError(`unsupported instance presentation entity kind: ${entity.kind}`);
}

function patchInstanceComponentProjection(
  projection: PatchMapProjectionIndex,
  entitySelections: Readonly<Record<string, PatchMapProjectionIndex['byEntityId'][string]>>,
  componentSelections: Readonly<Record<
    string,
    NonNullable<PatchMapProjectionIndex['componentsByEntityId']>[string]
  >>,
  backgroundSelections: Readonly<Record<
    string,
    NonNullable<PatchMapProjectionIndex['backgroundsByEntityId']>[string]
  >>,
  textSelections: Readonly<Record<
    string,
    NonNullable<PatchMapProjectionIndex['textsByEntityId']>[string]
  >>,
  entityIds: readonly string[],
  backgroundIds: readonly string[],
  textIds: readonly string[],
  strategy: PatchMapStableRecordStrategy,
): PatchMapProjectionIndex {
  if (entityIds.length === 0) return projection;
  const byEntityId = patchPatchMapStableRecord(
    projection.byEntityId,
    entitySelections,
    entityIds,
    strategy,
    true,
  );
  const componentsByEntityId = patchPatchMapStableRecord(
    projection.componentsByEntityId,
    componentSelections,
    entityIds,
    strategy,
    true,
  );
  const backgroundsByEntityId = backgroundIds.length === 0
    ? projection.backgroundsByEntityId
    : patchPatchMapStableRecord(
        projection.backgroundsByEntityId,
        backgroundSelections,
        backgroundIds,
        strategy,
        true,
      );
  const textsByEntityId = textIds.length === 0
    ? projection.textsByEntityId
    : patchPatchMapStableRecord(
        projection.textsByEntityId,
        textSelections,
        textIds,
        strategy,
        true,
      );
  if (
    byEntityId === null ||
    componentsByEntityId === null ||
    backgroundsByEntityId === null ||
    textsByEntityId === null
  ) {
    throw new Error('instance component overlay could not preserve projection membership');
  }
  return Object.freeze({
    ...projection,
    byEntityId,
    componentsByEntityId,
    ...(backgroundsByEntityId === undefined ? {} : { backgroundsByEntityId }),
    ...(textsByEntityId === undefined ? {} : { textsByEntityId }),
  });
}

function selectImageProjection(
  selections: Map<string, PatchMapImageProjection | null>,
  ids: string[],
  entityId: string,
  projection: PatchMapImageProjection | undefined,
): void {
  selections.set(entityId, projection ?? null);
  ids.push(entityId);
}

export function patchImageProjectionMembership(
  current: Readonly<Record<string, PatchMapImageProjection>> | undefined,
  selections: ReadonlyMap<string, PatchMapImageProjection | null>,
  ids: readonly string[],
): Readonly<Record<string, PatchMapImageProjection>> {
  const next = Object.assign(
    Object.create(null) as Record<string, PatchMapImageProjection>,
    current ?? {},
  );
  for (const entityId of ids) {
    const selected = selections.get(entityId);
    if (selected === undefined || selected === null) delete next[entityId];
    else next[entityId] = selected;
  }
  return Object.freeze(next);
}

function indexStoreSlots(store: RenderStoreView): ReadonlyMap<string, number> {
  const slots = new Map<string, number>();
  for (let slot = 0; slot < store.capacity; slot += 1) {
    if (store.alive[slot] === 1) slots.set(store.ids[slot] ?? '', slot);
  }
  return slots;
}
