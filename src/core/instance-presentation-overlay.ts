import type {
  PatchMapImageProjection,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import type { RenderStoreView } from '../dense/renderer-types';
import { multiplyPatchMapRgba } from '../parsing/color';
import { normalizePatchMapImageSource } from '../parsing/image-source';
import { createPatchMapParseState } from '../parsing/parse-state';
import { resolveColor } from '../parsing/value-normalization';
import type { PatchMapRendererEntityPresentationOverride } from '../rendering-port';
import type {
  PatchMapAssetSource,
  PatchMapBarComponent,
  PatchMapComponent,
  PatchMapIconComponent,
  PatchMapRectTexture,
} from '../semantic/dataset';
import type { PatchMapStableRecordStrategy } from '../semantic/stable-record-overlay';
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
import {
  normalizePresentationPatches,
  normalizeTarget,
  type NormalizedPresentationPatch,
} from './instance-presentation-request';
import {
  createPatchMapInstanceComponentPresentationProjector,
  patchImageProjectionMembership,
  patchMapComponentAtDatasetPath,
  samePatchMapInstanceRendererOverride,
  type PatchMapChangedInstancePresentation,
} from './instance-component-presentation-projection';
import type { PatchMapIndexedComponentTarget } from './published-scene-state';
import { patchMapComponentTargetKey } from './component-target-key';

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
  return request.bar?.height !== undefined &&
    request.background === undefined &&
    request.icon === undefined &&
    request.text === undefined &&
    request.bar.tint === undefined &&
    request.bar.source === undefined &&
    request.bar.show === undefined;
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
  const columns = request.bar;
  if (columns === undefined || !Array.isArray(columns.targets)) {
    throw new TypeError('instance bar targets must be an array');
  }
  const heightColumn = columns.height;
  if (heightColumn === undefined || heightColumn === null || typeof heightColumn !== 'object') {
    throw new TypeError('instance bar height must be array-like');
  }
  if (!Number.isSafeInteger(heightColumn.length) || heightColumn.length < 0) {
    throw new TypeError('instance bar height length must be a non-negative safe integer');
  }
  if (heightColumn.length !== columns.targets.length) {
    throw new RangeError('instance bar height length must match targets length');
  }

  const updates: PatchMapInstanceBarOverlayUpdate[] = [];
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(columns.targets[index], `instance bar targets[${index}]`);
    const height = heightColumn[index];
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
      ? authored.componentsByEntityId[indexed.entityId]
      : undefined;
    const bar = indexed ? authored.barsByEntityId[indexed.entityId] : undefined;
    const text = indexed ? authored.textsByEntityId[indexed.entityId] : undefined;
    const componentPath = indexed?.componentPath ?? null;
    let authoredComponent = componentByPath.get(componentPath);
    if (authoredComponent === undefined) {
      authoredComponent = indexed && ownedDataset
        ? patchMapComponentAtDatasetPath(ownedDataset, componentPath)
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
  const changedPresentations: Array<Readonly<PatchMapChangedInstancePresentation & {
    heightChanged: boolean;
    rendererChanged: boolean;
    sourceChanged: boolean;
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
  const imageSelections = new Map<string, PatchMapImageProjection | null>();
  const imageIds: string[] = [];
  const colorState = createPatchMapParseState(parseOptions ?? {});
  const resolvedColors = new Map<unknown, Map<number, number>>();
  const componentProjector = createPatchMapInstanceComponentPresentationProjector({
    changes: changedPresentations,
    authored,
    ownedDataset,
    parseOptions,
    store,
    rendererOverrides: nextRendererOverrides,
    changedEntityIds: changed,
    recordStrategy,
  });

  for (const change of changedPresentations) {
    const {
      patch,
      indexed,
      authoredComponent,
      stored,
      rendererChanged,
      sourceChanged,
    } = change;
    if (patch.type === 'background' || patch.type === 'text') {
      componentProjector.project(change);
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
    if (!samePatchMapInstanceRendererOverride(previousOverride, nextOverride)) {
      changed.add(indexed.entityId);
    }

    if (patch.type !== 'icon' || !sourceChanged) continue;
    const authoredImage = authored.imagesByEntityId[indexed.entityId];
    if (!authoredImage) continue;
    const nextImage = stored?.source === undefined
      ? authoredImage
      : imageProjection(indexed.entityId, stored.source as PatchMapAssetSource, authoredImage);
    imageSelections.set(indexed.entityId, nextImage);
    imageIds.push(indexed.entityId);
    if (!sameImageProjection(current.imagesByEntityId[indexed.entityId], nextImage)) {
      changed.add(indexed.entityId);
    }
  }
  projection = componentProjector.finish(projection);
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

function sameImageProjection(
  left: PatchMapImageProjection | undefined,
  right: PatchMapImageProjection,
): boolean {
  return left?.bindingKey === right.bindingKey &&
    left.cacheIdentity === right.cacheIdentity &&
    left.sourceKind === right.sourceKind;
}
