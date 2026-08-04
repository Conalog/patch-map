import type {
  PatchMapImageProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import { multiplyPatchMapRgba } from '../parser/color';
import { normalizePatchMapImageSource } from '../parser/image-source';
import { createPatchMapParseState } from '../parser/parse-state';
import { resolveColor } from '../parser/value-normalization';
import type { PatchMapRendererEntityPresentationOverride } from '../renderers/presentation-store';
import type {
  PatchMapAssetSource,
  PatchMapBarComponent,
  PatchMapIconComponent,
  PatchMapRectTexture,
} from '../semantic/dataset';
import {
  normalizeAssetSource,
  normalizeColorLike,
  normalizeRectTexture,
} from '../semantic/dataset/style-normalization';
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
}

interface NormalizedPresentationPatch {
  readonly type: PatchMapInstancePresentationComponentType;
  readonly target: PatchMapInstanceBarTarget;
  readonly height?: number | null;
  readonly tint?: unknown;
  readonly source?: PatchMapRectTexture | PatchMapAssetSource | null;
  readonly show?: boolean | null;
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

export function planPatchMapInstancePresentationOverlay(
  request: PatchMapInstanceBarHeightBatchRequest,
  current: PatchMapProjectionIndex,
  authored: PatchMapProjectionIndex,
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  ownedDataset: readonly unknown[] | null,
  parseOptions: PatchMapRuntimeOptions['parse'],
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
    authoredComponent: PatchMapBarComponent | PatchMapIconComponent | null;
  }>> = [];
  const appliedTargets: PatchMapInstanceBarTarget[] = [];
  const missingTargets: PatchMapInstanceBarTarget[] = [];
  const componentByPath = new Map<
    string | null,
    PatchMapBarComponent | PatchMapIconComponent | null
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
    const componentPath = indexed?.componentPath ?? null;
    let authoredComponent = componentByPath.get(componentPath);
    if (authoredComponent === undefined) {
      authoredComponent = indexed && ownedDataset
        ? componentAtPath(ownedDataset, componentPath)
        : null;
      componentByPath.set(componentPath, authoredComponent);
    }
    const needsAuthoredPresentation =
      Object.hasOwn(patch, 'tint') ||
      Object.hasOwn(patch, 'source') ||
      Object.hasOwn(patch, 'show');
    const semanticMatches = patch.type === 'bar'
      ? bar?.ownerId === patch.target.id && bar.componentId === patch.target.componentId
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
  for (const { patch } of resolved) {
    const key = storedKey(patch.type, patch.target);
    const previous = nextPresentations.get(key);
    const next = mergePresentation(previous, patch);
    if (!sameStoredPresentation(previous, next)) overlayStateChanged = true;
    if (next === null) nextPresentations.delete(key);
    else nextPresentations.set(key, next);
  }

  const barHeightUpdates: PatchMapInstanceBarOverlayUpdate[] = [];
  for (const { patch } of resolved) {
    if (patch.type !== 'bar') continue;
    const stored = nextPresentations.get(storedKey('bar', patch.target));
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
  const imageSelections = Object.create(null) as Record<string, PatchMapImageProjection>;
  const imageIds: string[] = [];
  const colorState = createPatchMapParseState(parseOptions ?? {});
  const resolvedColors = new Map<unknown, Map<number, number>>();

  for (const { patch, indexed, authoredComponent } of resolved) {
    const stored = nextPresentations.get(storedKey(patch.type, patch.target));
    const nextOverride = authoredComponent === null
      ? null
      : presentationOverride(stored, authoredComponent, colorState, resolvedColors);
    const previousOverride = nextRendererOverrides.get(indexed.entityId);
    if (nextOverride === null) nextRendererOverrides.delete(indexed.entityId);
    else nextRendererOverrides.set(indexed.entityId, nextOverride);
    if (!sameRendererOverride(previousOverride, nextOverride)) changed.add(indexed.entityId);

    if (patch.type !== 'icon') continue;
    const authoredImage = authored.imagesByEntityId?.[indexed.entityId];
    if (!authoredImage) continue;
    const nextImage = stored?.source === undefined
      ? authoredImage
      : imageProjection(indexed.entityId, stored.source as PatchMapAssetSource, authoredImage);
    imageSelections[indexed.entityId] = nextImage;
    imageIds.push(indexed.entityId);
    if (!sameImageProjection(current.imagesByEntityId?.[indexed.entityId], nextImage)) {
      changed.add(indexed.entityId);
    }
  }

  if (imageIds.length > 0) {
    const imagesByEntityId = patchPatchMapStableRecord(
      projection.imagesByEntityId,
      imageSelections,
      imageIds,
      recordStrategy,
      true,
    );
    if (imagesByEntityId === null) {
      throw new Error('instance icon overlay could not preserve projection membership');
    }
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
  const bars = values.filter((value) => value.type === 'bar');
  const icons = values.filter((value) => value.type === 'icon');
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
  return Object.freeze({
    ...(bars.length === 0 ? {} : { bar: columns(bars) }),
    ...(icons.length === 0 ? {} : { icon: columns(icons) }),
    animate,
  });
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
  if (result.length === 0) {
    throw new TypeError('instance presentation batch requires at least one value column');
  }
  return Object.freeze(result);
}

function normalizeColumns(
  type: PatchMapInstancePresentationComponentType,
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
    if (!Number.isSafeInteger(column.length) || column.length < 0) {
      throw new TypeError(`instance ${type} ${name} length must be a non-negative safe integer`);
    }
    if (column.length !== columns.targets.length) {
      throw new RangeError(`instance ${type} ${name} length must match targets length`);
    }
  }
  const seen = new Set<string>();
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(columns.targets[index], `instance ${type} targets[${index}]`);
    const key = patchMapComponentTargetKey(target.id, target.componentId);
    if (seen.has(key)) throw new TypeError(`duplicate instance ${type} target: ${target.id}/${target.componentId}`);
    seen.add(key);
    const height = columns.height?.[index];
    const tint = columns.tint?.[index];
    const source = columns.source?.[index];
    const show = columns.show?.[index];
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

function normalizeTarget(value: unknown, path: string): PatchMapInstanceBarTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const target = value as Readonly<Record<string, unknown>>;
  if (typeof target.id !== 'string' || target.id.length === 0) {
    throw new TypeError(`${path.replace(/targets\[\d+\]$/u, 'target')} id must be a non-empty string`);
  }
  if (typeof target.componentId !== 'string' || target.componentId.length === 0) {
    throw new TypeError(`${path} componentId must be a non-empty string`);
  }
  return Object.freeze({ id: target.id, componentId: target.componentId });
}

function mergePresentation(
  previous: PatchMapStoredInstancePresentation | undefined,
  patch: NormalizedPresentationPatch,
): PatchMapStoredInstancePresentation | null {
  const next: Record<string, unknown> = {
    type: patch.type,
    target: patch.target,
    ...(previous?.height === undefined ? {} : { height: previous.height }),
    ...(previous?.tint === undefined ? {} : { tint: previous.tint }),
    ...(previous?.source === undefined ? {} : { source: previous.source }),
    ...(previous?.show === undefined ? {} : { show: previous.show }),
  };
  for (const name of ['height', 'tint', 'source', 'show'] as const) {
    if (!Object.hasOwn(patch, name)) continue;
    const value = patch[name];
    if (value === null) delete next[name];
    else next[name] = value;
  }
  if (!['height', 'tint', 'source', 'show'].some((name) => Object.hasOwn(next, name))) {
    return null;
  }
  return Object.freeze(next) as unknown as PatchMapStoredInstancePresentation;
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
): PatchMapBarComponent | PatchMapIconComponent | null {
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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const component = value as Readonly<Record<string, unknown>>;
  return component.type === 'bar' || component.type === 'icon'
    ? component as unknown as PatchMapBarComponent | PatchMapIconComponent
    : null;
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
    Object.is(left.tint, right.tint) &&
    Object.is(left.source, right.source) &&
    Object.is(left.show, right.show);
}

function sameRendererOverride(
  left: PatchMapRendererEntityPresentationOverride | undefined,
  right: PatchMapRendererEntityPresentationOverride | null,
): boolean {
  if (!left || !right) return left === undefined && right === null;
  return Object.is(left.visible, right.visible) &&
    Object.is(left.fill, right.fill) &&
    Object.is(left.radius, right.radius) &&
    Object.is(left.source, right.source) &&
    Object.is(left.tint, right.tint) &&
    Object.is(left.trackFill, right.trackFill);
}

function sameImageProjection(
  left: PatchMapImageProjection | undefined,
  right: PatchMapImageProjection,
): boolean {
  return left?.bindingKey === right.bindingKey &&
    left.cacheIdentity === right.cacheIdentity &&
    left.sourceKind === right.sourceKind;
}
