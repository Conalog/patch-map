import type {
  PatchMapImageProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import type { EntityInput } from '../dense/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import { multiplyPatchMapRgba } from '../parser/color';
import { normalizePatchMapImageSource } from '../parser/image-source';
import {
  projectPatchMapInstanceComponentOverlay,
  type PatchMapInstanceComponentProjectionCache,
} from '../parser/instance-component-overlay';
import { createPatchMapParseState } from '../parser/parse-state';
import { resolveColor } from '../parser/value-normalization';
import type { PatchMapRendererEntityPresentationOverride } from '../renderers/presentation-store';
import type {
  PatchMapAssetSource,
  PatchMapBarComponent,
  PatchMapComponent,
  PatchMapGridItemTemplate,
  PatchMapIconComponent,
  PatchMapRectTexture,
} from '../semantic/dataset';
import { mergeRecords } from '../semantic/mutation/record-values';
import { normalizePatchMapComponent } from '../semantic/dataset/root-normalization';
import {
  normalizeAssetSource,
  normalizeColorLike,
  normalizeRectTexture,
} from '../semantic/dataset/style-normalization';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
} from '../semantic/transaction';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';
import type {
  PatchMapInstanceBarHeightBatchRequest,
  PatchMapInstanceBarTarget,
  PatchMapInstancePresentationComponentType,
  PatchMapRuntimeOptions,
} from './contracts';
import {
  planPatchMapInstanceBarOverlay,
  type PatchMapInstanceBarOverlayUpdate,
} from './instance-bar-overlay';
import type { PatchMapIndexedComponentTarget } from './published-scene-state';
import { patchMapComponentTargetKey } from './product-probe-reader';

export interface PatchMapStoredInstancePresentation {
  readonly type: PatchMapInstancePresentationComponentType;
  readonly target: PatchMapInstanceBarTarget;
  readonly height?: number;
  readonly tint?: unknown;
  readonly source?: PatchMapRectTexture | PatchMapAssetSource;
  readonly show?: boolean;
  /** Sparse background/text fields, recursively merged over the current template. */
  readonly changes?: Readonly<Record<string, unknown>>;
}

interface NormalizedPresentationPatch {
  readonly type: PatchMapInstancePresentationComponentType;
  readonly target: PatchMapInstanceBarTarget;
  readonly height?: number | null;
  readonly tint?: unknown;
  readonly source?: PatchMapRectTexture | PatchMapAssetSource | null;
  readonly show?: boolean | null;
  readonly changes?: Readonly<Record<string, unknown>>;
}

export interface PatchMapInstancePresentationPlan {
  readonly projection: PatchMapProjectionIndex;
  readonly presentations: ReadonlyMap<string, PatchMapStoredInstancePresentation>;
  readonly rendererOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
  readonly changedEntityIds: readonly string[];
  readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
  readonly missingTargets: readonly PatchMapInstanceBarTarget[];
  readonly overlayStateChanged: boolean;
}

export interface PatchMapInstanceBarHeightOnlyPlan {
  readonly projection: PatchMapProjectionIndex;
  readonly changedEntityIds: readonly string[];
  readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
  readonly missingTargets: readonly PatchMapInstanceBarTarget[];
  readonly storageUpdates: readonly Readonly<{
    readonly key: string;
    readonly presentation: PatchMapStoredInstancePresentation | null;
  }>[];
  readonly overlayStateChanged: boolean;
}

export function isPatchMapInstanceBarHeightOnlyRequest(
  request: PatchMapInstanceBarHeightBatchRequest,
): boolean {
  return request.targets !== undefined &&
    request.heights !== undefined &&
    request.background === undefined &&
    request.bar === undefined &&
    request.icon === undefined &&
    request.text === undefined;
}

/** Keep the established height-only hot path out of general presentation planning. */
export function planPatchMapInstanceBarHeightOnlyOverlay(
  request: PatchMapInstanceBarHeightBatchRequest,
  current: PatchMapProjectionIndex,
  authored: PatchMapProjectionIndex,
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  presentations: ReadonlyMap<string, PatchMapStoredInstancePresentation>,
  recordStrategy: PatchMapStableRecordStrategy,
): PatchMapInstanceBarHeightOnlyPlan {
  if (request.animate !== undefined && typeof request.animate !== 'boolean') {
    throw new TypeError('instance presentation animate must be a boolean');
  }
  if (!Array.isArray(request.targets)) {
    throw new TypeError('instance bar targets must be an array');
  }
  const heights = request.heights;
  if (heights === undefined || heights === null || typeof heights !== 'object') {
    throw new TypeError('instance bar height must be array-like');
  }
  if (!Number.isSafeInteger(heights.length) || heights.length < 0) {
    throw new TypeError('instance bar height length must be a non-negative safe integer');
  }
  if (heights.length !== request.targets.length) {
    throw new RangeError('instance bar height length must match targets length');
  }

  const updates: PatchMapInstanceBarOverlayUpdate[] = [];
  for (let index = 0; index < request.targets.length; index += 1) {
    const target = normalizeTarget(request.targets[index], `instance bar targets[${index}]`);
    const height = heights[index];
    if (height !== null &&
      (typeof height !== 'number' || !Number.isFinite(height) || height < 0)) {
      throw new RangeError(`instance bar height[${index}] must be null or finite and non-negative`);
    }
    updates.push(Object.freeze({ target, height }));
  }

  const barPlan = planPatchMapInstanceBarOverlay(
    current,
    authored,
    updates,
    componentTargets,
    recordStrategy,
  );
  if (barPlan.missingTargets.length > 0) {
    return Object.freeze({
      projection: current,
      changedEntityIds: Object.freeze([]),
      appliedTargets: Object.freeze([]),
      missingTargets: barPlan.missingTargets,
      storageUpdates: Object.freeze([]),
      overlayStateChanged: false,
    });
  }

  let overlayStateChanged = false;
  const storageUpdates = updates.flatMap(({ target, height }) => {
    const key = storedKey('bar', target);
    const previous = presentations.get(key);
    const presentation = presentationWithHeight(previous, target, height);
    if (sameStoredPresentation(previous, presentation)) return [];
    overlayStateChanged = true;
    return [Object.freeze({ key, presentation })];
  });
  return Object.freeze({
    projection: barPlan.projection,
    changedEntityIds: barPlan.changedEntityIds,
    appliedTargets: barPlan.appliedTargets,
    missingTargets: Object.freeze([]),
    storageUpdates: Object.freeze(storageUpdates),
    overlayStateChanged,
  });
}

export function applyPatchMapInstanceBarHeightStorageUpdates(
  presentations: Map<string, PatchMapStoredInstancePresentation>,
  updates: PatchMapInstanceBarHeightOnlyPlan['storageUpdates'],
): void {
  for (const { key, presentation } of updates) {
    if (presentation === null) presentations.delete(key);
    else presentations.set(key, presentation);
  }
}

export function planPatchMapInstancePresentationOverlay(
  request: PatchMapInstanceBarHeightBatchRequest,
  current: PatchMapProjectionIndex,
  authored: PatchMapProjectionIndex,
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  ownedDataset: readonly unknown[] | null,
  parseOptions: PatchMapRuntimeOptions['parse'],
  store: RenderStoreView,
  presentations: ReadonlyMap<string, PatchMapStoredInstancePresentation>,
  rendererOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  recordStrategy: PatchMapStableRecordStrategy,
  options: Readonly<{ readonly strictMissing?: boolean }> = {},
): PatchMapInstancePresentationPlan {
  const patches = normalizePresentationPatches(request);
  const nextPresentations = new Map(presentations);
  const nextRendererOverrides = new Map(rendererOverrides);
  const resolved: Array<Readonly<{
    patch: NormalizedPresentationPatch;
    indexed: PatchMapIndexedComponentTarget;
    authoredComponent: PatchMapComponent | null;
  }>> = [];
  const appliedTargets: PatchMapInstanceBarTarget[] = [];
  const missingTargets: PatchMapInstanceBarTarget[] = [];
  const componentByPath = new Map<
    string | null,
    PatchMapComponent | null
  >();

  for (const patch of patches) {
    const indexed = componentTargets.get(patchMapComponentTargetKey(
      patch.target.id,
      patch.target.componentId,
    ));
    const component = indexed
      ? authored.componentsByEntityId?.[indexed.entityId]
      : undefined;
    const bar = indexed ? authored.barsByEntityId?.[indexed.entityId] : undefined;
    const text = indexed ? authored.textsByEntityId?.[indexed.entityId] : undefined;
    const componentPath = indexed?.componentPath ?? null;
    let authoredComponent = componentByPath.get(componentPath);
    if (authoredComponent === undefined) {
      authoredComponent = indexed && ownedDataset
        ? componentAtPath(ownedDataset, componentPath)
        : null;
      componentByPath.set(componentPath, authoredComponent);
    }
    const needsAuthoredPresentation = patch.type === 'background' ||
      patch.type === 'text' ||
      Object.hasOwn(patch, 'tint') ||
      Object.hasOwn(patch, 'source') ||
      Object.hasOwn(patch, 'show');
    const semanticMatches = patch.type === 'bar'
      ? bar?.ownerId === patch.target.id && bar.componentId === patch.target.componentId
      : patch.type === 'text'
        ? text?.ownerId === patch.target.id && text.componentId === patch.target.componentId
        : component?.ownerId === patch.target.id &&
          component.componentId === patch.target.componentId &&
          component.componentType === patch.type;
    if (
      !indexed ||
      !semanticMatches ||
      (needsAuthoredPresentation &&
        (!authoredComponent || authoredComponent.type !== patch.type))
    ) {
      missingTargets.push(patch.target);
      continue;
    }
    appliedTargets.push(patch.target);
    resolved.push(Object.freeze({ patch, indexed, authoredComponent }));
  }

  if ((options.strictMissing ?? true) && missingTargets.length > 0) {
    return Object.freeze({
      projection: current,
      presentations,
      rendererOverrides,
      changedEntityIds: Object.freeze([]),
      appliedTargets: Object.freeze([]),
      missingTargets: Object.freeze(missingTargets),
      overlayStateChanged: false,
    });
  }

  let overlayStateChanged = false;
  const changedPresentations: Array<Readonly<{
    patch: NormalizedPresentationPatch;
    indexed: PatchMapIndexedComponentTarget;
    authoredComponent: PatchMapComponent | null;
    stored: PatchMapStoredInstancePresentation | undefined;
    heightChanged: boolean;
    rendererChanged: boolean;
    sourceChanged: boolean;
    componentChanged: boolean;
    componentProjectionChanged: boolean;
  }>> = [];
  for (const { patch, indexed, authoredComponent } of resolved) {
    const key = storedKey(patch.type, patch.target);
    const previous = nextPresentations.get(key);
    const next = mergePresentation(previous, patch);
    if (sameStoredPresentation(previous, next)) continue;
    overlayStateChanged = true;
    if (next === null) nextPresentations.delete(key);
    else nextPresentations.set(key, next);
    changedPresentations.push(Object.freeze({
      patch,
      indexed,
      authoredComponent,
      stored: next ?? undefined,
      heightChanged: patch.type === 'bar' &&
        !Object.is(previous?.height, next?.height),
      rendererChanged:
        !sameNormalizedPresentationValue(previous?.tint, next?.tint) ||
        !sameNormalizedPresentationValue(previous?.source, next?.source) ||
        !Object.is(previous?.show, next?.show),
      sourceChanged: !sameNormalizedPresentationValue(previous?.source, next?.source),
      componentChanged: !sameNormalizedPresentationValue(previous?.changes, next?.changes),
      componentProjectionChanged:
        !sameNormalizedPresentationValue(previous?.changes, next?.changes) &&
        Object.keys(patch.changes ?? {}).some((name) => name !== 'show'),
    }));
  }
  const cacheRepeatedTextProjection = shouldCacheRepeatedTextProjection(changedPresentations);

  const barHeightUpdates: PatchMapInstanceBarOverlayUpdate[] = [];
  for (const { patch, stored, heightChanged } of changedPresentations) {
    if (patch.type !== 'bar' || !heightChanged) continue;
    barHeightUpdates.push(Object.freeze({
      target: patch.target,
      height: stored?.height ?? null,
    }));
  }
  const barPlan = planPatchMapInstanceBarOverlay(
    current,
    authored,
    barHeightUpdates,
    componentTargets,
    recordStrategy,
  );
  let projection = barPlan.projection;
  const changed = new Set(barPlan.changedEntityIds);
  const entitySelections = Object.create(null) as Record<string, PatchMapProjectionIndex['byEntityId'][string]>;
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
  const colorState = createPatchMapParseState(parseOptions ?? {});
  const resolvedColors = new Map<unknown, Map<number, number>>();
  const effectiveComponents = new Map<string, PatchMapComponent>();
  const componentProjectionCache: PatchMapInstanceComponentProjectionCache | undefined =
    cacheRepeatedTextProjection
      ? { textLayouts: new Map(), textComponents: new Map() }
      : undefined;
  let ownerSlots: ReadonlyMap<string, number> | null = null;

  for (const {
    patch,
    indexed,
    authoredComponent,
    stored,
    rendererChanged,
    sourceChanged,
    componentChanged,
    componentProjectionChanged,
  } of changedPresentations) {
    if (patch.type === 'background' || patch.type === 'text') {
      if (!componentChanged || authoredComponent === null || ownedDataset === null) continue;
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
        const previousOverride = nextRendererOverrides.get(entityId);
        const nextOverride = Object.freeze({
          ...previousOverride,
          kind: RenderKind.Text,
          visible: ownerVisible && effectiveShow !== false,
        });
        nextRendererOverrides.set(entityId, nextOverride);
        if (!sameRendererOverride(previousOverride, nextOverride)) changed.add(entityId);
        continue;
      }
      projectionEntityIds.push(entityId);
      if (stored === undefined) {
        const authoredEntity = authored.byEntityId[entityId];
        const authoredVisual = authored.componentsByEntityId?.[entityId];
        if (
          authoredEntity === undefined ||
          (patch.type === 'background' && authoredVisual === undefined)
        ) {
          throw new Error(`authored instance presentation is missing ${entityId}`);
        }
        entitySelections[entityId] = authoredEntity;
        if (authoredVisual !== undefined) componentSelections[entityId] = authoredVisual;
        if (patch.type === 'background') {
          const authoredBackground = authored.backgroundsByEntityId?.[entityId];
          if (authoredBackground === undefined) {
            throw new Error(`authored background presentation is missing ${entityId}`);
          }
          backgroundSelections[entityId] = authoredBackground;
          backgroundIds.push(entityId);
          selectImageProjection(imageSelections, imageIds, entityId, authored.imagesByEntityId?.[entityId]);
        } else {
          const authoredText = authored.textsByEntityId?.[entityId];
          if (authoredText === undefined) {
            throw new Error(`authored text presentation is missing ${entityId}`);
          }
          textSelections[entityId] = authoredText;
          textIds.push(entityId);
        }
        nextRendererOverrides.delete(entityId);
        changed.add(entityId);
        continue;
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
      const effectiveKey = cacheRepeatedTextProjection
        ? `${indexed.componentPath}\u0000${JSON.stringify(stored.changes ?? {})}`
        : null;
      let effective = effectiveKey === null ? undefined : effectiveComponents.get(effectiveKey);
      effective ??= effectiveOverlayComponent(
        authoredComponent,
        stored.changes ?? {},
        indexed.componentPath,
      );
      if (effectiveKey !== null) effectiveComponents.set(effectiveKey, effective);
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
      nextRendererOverrides.set(entityId, rendererOverrideFromEntity(projected.entity));
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
      changed.add(entityId);
      continue;
    }

    if (!rendererChanged) continue;
    if (
      authoredComponent !== null &&
      authoredComponent.type !== 'bar' &&
      authoredComponent.type !== 'icon'
    ) {
      throw new TypeError('instance presentation component type does not match authored component');
    }
    const nextOverride = authoredComponent === null
      ? null
      : presentationOverride(stored, authoredComponent, colorState, resolvedColors);
    const previousOverride = nextRendererOverrides.get(indexed.entityId);
    if (nextOverride === null) nextRendererOverrides.delete(indexed.entityId);
    else nextRendererOverrides.set(indexed.entityId, nextOverride);
    if (!sameRendererOverride(previousOverride, nextOverride)) changed.add(indexed.entityId);

    if (patch.type !== 'icon' || !sourceChanged) continue;
    const authoredImage = authored.imagesByEntityId?.[indexed.entityId];
    if (!authoredImage) continue;
    const nextImage = stored?.source === undefined
      ? authoredImage
      : imageProjection(indexed.entityId, stored.source as PatchMapAssetSource, authoredImage);
    imageSelections.set(indexed.entityId, nextImage);
    imageIds.push(indexed.entityId);
    if (!sameImageProjection(current.imagesByEntityId?.[indexed.entityId], nextImage)) {
      changed.add(indexed.entityId);
    }
  }
  projection = patchInstanceComponentProjection(
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
      projection.imagesByEntityId,
      imageSelections,
      imageIds,
    );
    projection = Object.freeze({ ...projection, imagesByEntityId });
  }

  return Object.freeze({
    projection,
    presentations: nextPresentations,
    rendererOverrides: nextRendererOverrides,
    changedEntityIds: Object.freeze([...changed]),
    appliedTargets: Object.freeze(appliedTargets),
    missingTargets: Object.freeze(missingTargets),
    overlayStateChanged,
  });
}

export function instancePresentationRequestFromStored(
  values: readonly PatchMapStoredInstancePresentation[],
  animate: boolean,
): PatchMapInstanceBarHeightBatchRequest {
  const backgrounds = values.filter((value) => value.type === 'background');
  const bars = values.filter((value) => value.type === 'bar');
  const icons = values.filter((value) => value.type === 'icon');
  const texts = values.filter((value) => value.type === 'text');
  const columns = (entries: readonly PatchMapStoredInstancePresentation[]) => {
    const include = (name: 'height' | 'tint' | 'source' | 'show'): boolean =>
      entries.some((entry) => Object.hasOwn(entry, name));
    return Object.freeze({
      targets: Object.freeze(entries.map((entry) => entry.target)),
      ...(include('height') ? { height: entries.map((entry) => entry.height ?? null) } : {}),
      ...(include('tint') ? { tint: entries.map((entry) => entry.tint ?? null) } : {}),
      ...(include('source') ? { source: entries.map((entry) => entry.source ?? null) } : {}),
      ...(include('show') ? { show: entries.map((entry) => entry.show ?? null) } : {}),
    });
  };
  const componentColumns = (entries: readonly PatchMapStoredInstancePresentation[]) => {
    const names = [...new Set(entries.flatMap((entry) => Object.keys(entry.changes ?? {})))];
    return Object.freeze({
      targets: Object.freeze(entries.map((entry) => entry.target)),
      changes: Object.freeze(Object.fromEntries(names.map((name) => [
        name,
        entries.map((entry) => entry.changes?.[name] ?? null),
      ]))),
    });
  };
  return Object.freeze({
    ...(backgrounds.length === 0 ? {} : { background: componentColumns(backgrounds) }),
    ...(bars.length === 0 ? {} : { bar: columns(bars) }),
    ...(icons.length === 0 ? {} : { icon: columns(icons) }),
    ...(texts.length === 0 ? {} : { text: componentColumns(texts) }),
    animate,
  });
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

function normalizePresentationPatches(
  request: PatchMapInstanceBarHeightBatchRequest,
): readonly NormalizedPresentationPatch[] {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('instance presentation batch must be an object');
  }
  if (request.animate !== undefined && typeof request.animate !== 'boolean') {
    throw new TypeError('instance presentation animate must be a boolean');
  }
  if ((request.targets === undefined) !== (request.heights === undefined)) {
    throw new TypeError('legacy instance bar targets and heights must be provided together');
  }
  if (request.targets !== undefined && request.bar !== undefined) {
    throw new TypeError('legacy and columnar instance bar inputs cannot be mixed');
  }
  const result: NormalizedPresentationPatch[] = [];
  const normalizedColors = new Map<unknown, unknown>();
  const normalizedBarSources = new Map<unknown, PatchMapRectTexture>();
  const normalizedIconSources = new Map<unknown, PatchMapAssetSource>();
  if (request.targets !== undefined && request.heights !== undefined) {
    normalizeColumns(
      'bar',
      { targets: request.targets, height: request.heights },
      result,
      normalizedColors,
      normalizedBarSources,
      normalizedIconSources,
    );
  }
  if (request.background !== undefined) {
    normalizeComponentColumns('background', request.background, result);
  }
  if (request.bar !== undefined) {
    normalizeColumns(
      'bar',
      request.bar,
      result,
      normalizedColors,
      normalizedBarSources,
      normalizedIconSources,
    );
  }
  if (request.icon !== undefined) {
    normalizeColumns(
      'icon',
      request.icon,
      result,
      normalizedColors,
      normalizedBarSources,
      normalizedIconSources,
    );
  }
  if (request.text !== undefined) {
    normalizeComponentColumns('text', request.text, result);
  }
  if (result.length === 0) {
    throw new TypeError('instance presentation batch requires at least one value column');
  }
  return Object.freeze(result);
}

function normalizeColumns(
  type: 'bar' | 'icon',
  columns: Readonly<{
    readonly targets: readonly PatchMapInstanceBarTarget[];
    readonly height?: ArrayLike<number | null>;
    readonly tint?: ArrayLike<unknown>;
    readonly source?: ArrayLike<unknown>;
    readonly show?: ArrayLike<boolean | null>;
  }>,
  output: NormalizedPresentationPatch[],
  normalizedColors: Map<unknown, unknown>,
  normalizedBarSources: Map<unknown, PatchMapRectTexture>,
  normalizedIconSources: Map<unknown, PatchMapAssetSource>,
): void {
  if (!Array.isArray(columns.targets)) {
    throw new TypeError(`instance ${type} targets must be an array`);
  }
  const valueColumns = [columns.height, columns.tint, columns.source, columns.show]
    .filter((value) => value !== undefined);
  if (valueColumns.length === 0) {
    throw new TypeError(`instance ${type} presentation requires at least one value column`);
  }
  for (const [name, column] of [
    ['height', columns.height],
    ['tint', columns.tint],
    ['source', columns.source],
    ['show', columns.show],
  ] as const) {
    if (column === undefined) continue;
    if (column === null || typeof column !== 'object') {
      throw new TypeError(`instance ${type} ${name} must be array-like`);
    }
    const length = instanceColumnLength(column, `instance ${type} ${name}`);
    if (length !== columns.targets.length) {
      throw new RangeError(`instance ${type} ${name} length must match targets length`);
    }
  }
  const seen = new Set<string>();
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(
      instanceColumnValue(columns.targets, index, `instance ${type} targets`),
      `instance ${type} targets[${index}]`,
    );
    const key = patchMapComponentTargetKey(target.id, target.componentId);
    if (seen.has(key)) throw new TypeError(`duplicate instance ${type} target: ${target.id}/${target.componentId}`);
    seen.add(key);
    const height = columns.height === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.height, index, `instance ${type} height`);
    const tint = columns.tint === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.tint, index, `instance ${type} tint`);
    const source = columns.source === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.source, index, `instance ${type} source`);
    const show = columns.show === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.show, index, `instance ${type} show`);
    if (type === 'icon' && height !== undefined) {
      throw new TypeError('instance icon presentation does not support height');
    }
    if (height !== undefined && height !== null &&
      (typeof height !== 'number' || !Number.isFinite(height) || height < 0)) {
      throw new RangeError(`instance bar height[${index}] must be null or finite and non-negative`);
    }
    if (show !== undefined && show !== null && typeof show !== 'boolean') {
      throw new TypeError(`instance ${type} show[${index}] must be null or boolean`);
    }
    output.push(Object.freeze({
      type,
      target,
      ...(height === undefined ? {} : { height }),
      ...(tint === undefined ? {} : {
        tint: tint === null
          ? null
          : cachedNormalize(
              normalizedColors,
              tint,
              () => normalizeColorLike(tint, `instance ${type} tint[${index}]`),
            ),
      }),
      ...(source === undefined ? {} : {
        source: source === null
          ? null
          : type === 'bar'
            ? cachedNormalize(
                normalizedBarSources,
                source,
                () => normalizeRectTexture(source, `instance bar source[${index}]`),
              )
            : cachedNormalize(
                normalizedIconSources,
                source,
                () => normalizeAssetSource(source, `instance icon source[${index}]`),
              ),
      }),
      ...(show === undefined ? {} : { show }),
    }));
  }
}

function normalizeComponentColumns(
  type: 'background' | 'text',
  columns: NonNullable<
    PatchMapInstanceBarHeightBatchRequest['background'] |
    PatchMapInstanceBarHeightBatchRequest['text']
  >,
  output: NormalizedPresentationPatch[],
): void {
  if (!Array.isArray(columns.targets)) {
    throw new TypeError(`instance ${type} targets must be an array`);
  }
  const changes = columns.changes ?? {};
  const directText = type === 'text' && 'text' in columns ? columns.text : undefined;
  const directStyle = type === 'text' && 'style' in columns ? columns.style : undefined;
  const changeEntries = instanceDataEntries(changes, `instance ${type} changes`);
  const allowed = type === 'background'
    ? new Set(['show', 'source', 'tint', 'size', 'attrs'])
    : new Set(['show', 'text', 'placement', 'margin', 'tint', 'style', 'split', 'attrs']);
  const unknown = changeEntries.find(([name]) => !allowed.has(name))?.[0];
  if (unknown !== undefined) {
    throw new TypeError(`instance ${type} presentation does not support ${unknown}`);
  }
  if (directText !== undefined && Object.hasOwn(changes, 'text')) {
    throw new TypeError('instance text presentation cannot set text twice');
  }
  if (directStyle !== undefined && Object.hasOwn(changes, 'style')) {
    throw new TypeError('instance text presentation cannot set style twice');
  }
  const valueColumns = [
    ...changeEntries.map(([, value]) => value),
    directText,
    directStyle,
  ].filter((value) => value !== undefined);
  if (valueColumns.length === 0) {
    throw new TypeError(`instance ${type} presentation requires at least one value column`);
  }
  for (const [name, column] of [
    ...changeEntries,
    ['text', directText],
    ['style', directStyle],
  ] as readonly (readonly [string, ArrayLike<unknown> | undefined])[]) {
    if (column === undefined) continue;
    if (column === null || typeof column !== 'object') {
      throw new TypeError(`instance ${type} ${name} must be array-like`);
    }
    const length = instanceColumnLength(column, `instance ${type} ${name}`);
    if (length !== columns.targets.length) {
      throw new RangeError(`instance ${type} ${name} length must match targets length`);
    }
  }

  const seen = new Set<string>();
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(
      instanceColumnValue(columns.targets, index, `instance ${type} targets`),
      `instance ${type} targets[${index}]`,
    );
    const key = patchMapComponentTargetKey(target.id, target.componentId);
    if (seen.has(key)) {
      throw new TypeError(`duplicate instance ${type} target: ${target.id}/${target.componentId}`);
    }
    seen.add(key);
    const patch: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [name, column] of changeEntries) {
      patch[name] = detachedInstanceColumnValue(
        column,
        index,
        `instance ${type} ${name}`,
      );
    }
    if (directText !== undefined) {
      const text = detachedInstanceColumnValue(directText, index, 'instance text text');
      if (text !== null && typeof text !== 'string') {
        throw new TypeError(`instance text text[${index}] must be null or string`);
      }
      patch.text = text;
    }
    if (directStyle !== undefined) {
      const style = detachedInstanceColumnValue(directStyle, index, 'instance text style');
      if (style !== null && (typeof style !== 'object' || Array.isArray(style))) {
        throw new TypeError(`instance text style[${index}] must be null or a record`);
      }
      patch.style = style;
    }
    output.push(Object.freeze({
      type,
      target,
      changes: Object.freeze(patch),
    }));
  }
}

function instanceColumnLength(column: ArrayLike<unknown>, path: string): number {
  if (Array.isArray(column) || ArrayBuffer.isView(column)) return column.length;
  const descriptor = Object.getOwnPropertyDescriptor(column, 'length');
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path} length must be an own data property`);
  }
  if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 0) {
    throw new TypeError(`${path} length must be a non-negative safe integer`);
  }
  return descriptor.value as number;
}

function instanceColumnValue<T>(column: ArrayLike<T>, index: number, path: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(column, String(index));
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path}[${index}] must be a present data property`);
  }
  return descriptor.value as T;
}

function detachedInstanceColumnValue(
  column: ArrayLike<unknown>,
  index: number,
  path: string,
): PatchMapMutationJsonValue {
  return detachPatchMapMutationJsonValue(
    instanceColumnValue(column, index, path),
    `${path}[${index}]`,
  );
}

function instanceDataEntries<T>(
  record: Readonly<Record<string, T>>,
  path: string,
): readonly (readonly [string, T])[] {
  const entries: (readonly [string, T])[] = [];
  for (const key of Object.keys(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${path}.${key} must be a data property`);
    }
    entries.push(Object.freeze([key, descriptor.value as T] as const));
  }
  return Object.freeze(entries);
}

function normalizeTarget(value: unknown, path: string): PatchMapInstanceBarTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const target = value as Readonly<Record<string, unknown>>;
  const id = instanceDataProperty(target, 'id', path);
  const componentId = instanceDataProperty(target, 'componentId', path);
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError(`${path.replace(/targets\[\d+\]$/u, 'target')} id must be a non-empty string`);
  }
  if (typeof componentId !== 'string' || componentId.length === 0) {
    throw new TypeError(`${path} componentId must be a non-empty string`);
  }
  return Object.freeze({ id, componentId });
}

function instanceDataProperty(
  record: Readonly<Record<string, unknown>>,
  name: string,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor)) {
    throw new TypeError(`${path}.${name} must be a data property`);
  }
  return descriptor.value;
}

function mergePresentation(
  previous: PatchMapStoredInstancePresentation | undefined,
  patch: NormalizedPresentationPatch,
): PatchMapStoredInstancePresentation | null {
  if (
    previous !== undefined &&
    (!Object.hasOwn(patch, 'height') ||
      Object.is(previous.height, patch.height === null ? undefined : patch.height)) &&
    (!Object.hasOwn(patch, 'tint') ||
      sameNormalizedPresentationValue(
        previous.tint,
        patch.tint === null ? undefined : patch.tint,
      )) &&
    (!Object.hasOwn(patch, 'source') ||
      sameNormalizedPresentationValue(
        previous.source,
        patch.source === null ? undefined : patch.source,
      )) &&
    (!Object.hasOwn(patch, 'show') ||
      Object.is(previous.show, patch.show === null ? undefined : patch.show)) &&
    (!Object.hasOwn(patch, 'changes') ||
      sameNormalizedPresentationValue(
        previous.changes,
        mergeOverlayChanges(previous.changes, patch.changes ?? {}),
      ))
  ) {
    return previous;
  }
  const next: Record<string, unknown> = {
    type: patch.type,
    target: patch.target,
    ...(previous?.height === undefined ? {} : { height: previous.height }),
    ...(previous?.tint === undefined ? {} : { tint: previous.tint }),
    ...(previous?.source === undefined ? {} : { source: previous.source }),
    ...(previous?.show === undefined ? {} : { show: previous.show }),
    ...(previous?.changes === undefined ? {} : { changes: previous.changes }),
  };
  for (const name of ['height', 'tint', 'source', 'show'] as const) {
    if (!Object.hasOwn(patch, name)) continue;
    const value = patch[name];
    if (value === null) delete next[name];
    else next[name] = value;
  }
  if (Object.hasOwn(patch, 'changes')) {
    const changes = mergeOverlayChanges(previous?.changes, patch.changes ?? {});
    if (changes === undefined) delete next.changes;
    else next.changes = changes;
  }
  if (!['height', 'tint', 'source', 'show', 'changes'].some((name) => Object.hasOwn(next, name))) {
    return null;
  }
  return Object.freeze(next) as unknown as PatchMapStoredInstancePresentation;
}

function presentationWithHeight(
  previous: PatchMapStoredInstancePresentation | undefined,
  target: PatchMapInstanceBarTarget,
  height: number | null,
): PatchMapStoredInstancePresentation | null {
  if (height === null) {
    if (previous === undefined) return null;
    if (previous.height === undefined) return previous;
    if (
      previous.tint === undefined &&
      previous.source === undefined &&
      previous.show === undefined
      && previous.changes === undefined
    ) return null;
    return Object.freeze({
      type: 'bar',
      target: previous.target,
      ...(previous.tint === undefined ? {} : { tint: previous.tint }),
      ...(previous.source === undefined ? {} : { source: previous.source }),
      ...(previous.show === undefined ? {} : { show: previous.show }),
      ...(previous.changes === undefined ? {} : { changes: previous.changes }),
    });
  }
  if (previous !== undefined && Object.is(previous.height, height)) return previous;
  return Object.freeze({
    type: 'bar',
    target: previous?.target ?? target,
    height,
    ...(previous?.tint === undefined ? {} : { tint: previous.tint }),
    ...(previous?.source === undefined ? {} : { source: previous.source }),
    ...(previous?.show === undefined ? {} : { show: previous.show }),
    ...(previous?.changes === undefined ? {} : { changes: previous.changes }),
  });
}

function presentationOverride(
  stored: PatchMapStoredInstancePresentation | undefined,
  authored: PatchMapBarComponent | PatchMapIconComponent,
  colorState: ReturnType<typeof createPatchMapParseState>,
  resolvedColors: Map<unknown, Map<number, number>>,
): PatchMapRendererEntityPresentationOverride | null {
  if (!stored ||
    (stored.tint === undefined && stored.source === undefined && stored.show === undefined)) {
    return null;
  }
  if (stored.type === 'icon' && authored.type === 'icon') {
    return Object.freeze({
      ...(stored.show === undefined ? {} : { visible: stored.show }),
      ...(stored.tint === undefined ? {} : {
        tint: resolveOverlayColor(stored.tint, 0xffffffff, colorState, resolvedColors),
      }),
      ...(stored.source === undefined ? {} : {
        source: typeof stored.source === 'string'
          ? stored.source
          : (stored.source as Exclude<PatchMapAssetSource, string>).src,
      }),
    });
  }
  if (stored.type === 'bar' && authored.type === 'bar') {
    const source = (stored.source ?? authored.source) as PatchMapRectTexture;
    const tintValue = stored.tint ?? authored.tint;
    const trackFill = resolveOverlayColor(
      source.fill,
      0x00000000,
      colorState,
      resolvedColors,
    );
    const tint = resolveOverlayColor(tintValue, 0xffffffff, colorState, resolvedColors);
    return Object.freeze({
      ...(stored.show === undefined ? {} : { visible: stored.show }),
      fill: multiplyPatchMapRgba(trackFill === 0 ? 0xffffffff : trackFill, tint),
      trackFill,
      ...(typeof source.radius === 'number' ? { radius: source.radius } : {}),
    });
  }
  throw new TypeError('instance presentation component type does not match authored component');
}

function resolveOverlayColor(
  value: unknown,
  fallback: number,
  state: ReturnType<typeof createPatchMapParseState>,
  cache: Map<unknown, Map<number, number>>,
): number {
  const cached = cache.get(value)?.get(fallback);
  if (cached !== undefined) return cached;
  const resolved = resolveColor(value, fallback, '$.instancePresentation', state);
  const byFallback = cache.get(value);
  if (byFallback === undefined) cache.set(value, new Map([[fallback, resolved]]));
  else byFallback.set(fallback, resolved);
  return resolved;
}

function cachedNormalize<T>(
  cache: Map<unknown, T>,
  input: unknown,
  normalize: () => T,
): T {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const normalized = normalize();
  cache.set(input, normalized);
  return normalized;
}

function imageProjection(
  entityId: string,
  source: PatchMapAssetSource,
  authored: PatchMapImageProjection,
): PatchMapImageProjection {
  return Object.freeze({
    ...authored,
    entityId,
    ...normalizePatchMapImageSource(source),
  });
}

function componentAtPath(
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

function mergeOverlayChanges(
  previous: Readonly<Record<string, unknown>> | undefined,
  incoming: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const next: Record<string, unknown> = Object.assign(
    Object.create(null) as Record<string, unknown>,
    previous ?? {},
  );
  for (const [name, value] of Object.entries(incoming)) {
    if (value === null) {
      delete next[name];
      continue;
    }
    const current = next[name];
    if (isOverlayRecord(current) && isOverlayRecord(value)) {
      const nested = mergeOverlayChanges(current, value);
      if (nested === undefined) delete next[name];
      else next[name] = nested;
      continue;
    }
    next[name] = value;
  }
  return Object.keys(next).length === 0 ? undefined : Object.freeze(next);
}

function isOverlayRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function patchImageProjectionMembership(
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

function storedKey(
  type: PatchMapInstancePresentationComponentType,
  target: PatchMapInstanceBarTarget,
): string {
  return `${type}\u0000${patchMapComponentTargetKey(target.id, target.componentId)}`;
}

function sameStoredPresentation(
  left: PatchMapStoredInstancePresentation | undefined,
  right: PatchMapStoredInstancePresentation | null,
): boolean {
  if (!left || !right) return left === undefined && right === null;
  return left.type === right.type &&
    left.target.id === right.target.id &&
    left.target.componentId === right.target.componentId &&
    Object.is(left.height, right.height) &&
    sameNormalizedPresentationValue(left.tint, right.tint) &&
    sameNormalizedPresentationValue(left.source, right.source) &&
    Object.is(left.show, right.show) &&
    sameNormalizedPresentationValue(left.changes, right.changes);
}

function sameNormalizedPresentationValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length &&
      left.every((value, index) => sameNormalizedPresentationValue(value, right[index]));
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      Object.hasOwn(rightRecord, key) &&
      sameNormalizedPresentationValue(leftRecord[key], rightRecord[key])
    );
}

function sameRendererOverride(
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

function sameImageProjection(
  left: PatchMapImageProjection | undefined,
  right: PatchMapImageProjection,
): boolean {
  return left?.bindingKey === right.bindingKey &&
    left.cacheIdentity === right.cacheIdentity &&
    left.sourceKind === right.sourceKind;
}
