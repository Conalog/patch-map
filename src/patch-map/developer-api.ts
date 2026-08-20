import type {
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
} from './assets';
import type { PatchMapInstanceBarHeightBatchRequest } from './core/contracts';
import type { PatchMapHistoryState } from './history';
import type {
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEngineExtractionResult,
  PatchMapEngineLoadResult,
  PatchMapEngineQueryResult,
  PatchMapEngineTransactionResult,
  PatchMapLoadOptions as PatchMapEngineLoadOptions,
  PatchMapViewportChangeResult,
  PatchMapViewportFitOptions,
  PatchMapViewportFitResult,
  PatchMapViewportRestoreResult,
  PatchMapViewportState,
} from './engine/public-contracts';
import type {
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryResult,
  PatchMapEngineSnapshot,
  PatchMapEngineTransformerEditOptions,
  PatchMapEngineTransformerEditResult,
} from './engine/public-contracts';
import { preparePatchMapPersistenceExport } from './migration';
import type {
  PatchMapLogicalTargetSnapshot,
  PatchMapSceneQuery,
  PatchMapSelectionChange,
  PatchMapSelectionSetOperation,
} from './query-selection';
import type {
  PatchMapBarHeightBatchRequest,
  PatchMapMutationTransactionRequest,
  PatchMapTextBatchRequest,
} from './semantic/transaction';
import type {
  PatchMapTargetSet,
  PatchMapDataReplaceResult,
  PatchMapApi,
  PatchMapFitOptions,
  PatchMapOneOrMany,
  PatchMapPointerHoverEvent,
  PatchMapPointerSelectionChange,
  PatchMapSelectionInput,
  PatchMapDataReplaceOptions,
  PatchMapTarget,
  PatchMapTargetMatch,
  PatchMapTargetScope,
  PatchMapTargetsInput,
  PatchMapTargetQuery,
  PatchMapTransformOptions,
  PatchMapUpdateTargetsInput,
} from './developer-api/contracts';
import { createPatchMapMutationApi } from './developer-api/mutations';
import { createPatchMapPresentationApi } from './developer-api/presentation';
import type {
  PatchMapLogicalPresentationLayerInput,
  PatchMapPresentationLayerChange,
} from './presentation-layers';
import type { PatchMapTransformerEditRequest } from './transformer-edit';
import { normalizePatchMapViewportPadding } from './viewport';

export type * from './developer-api/contracts';

interface PatchMapApiHost {
  readonly selectionIds: readonly string[];
  loadDataset(input: unknown, options?: PatchMapEngineLoadOptions): PatchMapEngineLoadResult;
  loadDatasetAsync(
    input: unknown,
    options?: PatchMapEngineLoadOptions,
  ): Promise<PatchMapEngineLoadResult>;
  exportDataset(): readonly unknown[];
  transact(request: PatchMapMutationTransactionRequest): PatchMapEngineTransactionResult;
  updateBarHeights(request: PatchMapBarHeightBatchRequest): PatchMapEngineTransactionResult;
  updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapEngineInstanceBarHeightResult;
  updateTexts(request: PatchMapTextBatchRequest): PatchMapEngineTransactionResult;
  queryScene(input?: PatchMapSceneQuery): PatchMapEngineQueryResult;
  reuseQueryResult(
    result: PatchMapEngineQueryResult,
    operation: 'update' | 'focus' | 'select' | 'presentation',
  ): {
    readonly status: 'accepted' | 'rejected';
  };
  on(
    event: 'selectionChanged',
    listener: (change: PatchMapSelectionChange) => void,
  ): () => void;
  onPointerHover(listener: (event: PatchMapPointerHoverEvent) => void): () => void;
  onPointerSelectionChange(
    listener: (change: PatchMapPointerSelectionChange) => void,
  ): () => void;
  applySelection(input: PatchMapSelectionSetOperation): PatchMapSelectionChange;
  applyTransformerEdit(
    request: PatchMapTransformerEditRequest,
    options?: PatchMapEngineTransformerEditOptions,
  ): PatchMapEngineTransformerEditResult;
  fitViewport(options?: PatchMapViewportFitOptions): PatchMapViewportFitResult;
  restoreViewport(
    input: unknown,
    fallback?: PatchMapViewportFitOptions,
  ): PatchMapViewportRestoreResult;
  panViewport(delta: readonly [number, number]): PatchMapViewportChangeResult;
  zoomViewportAt(input: Readonly<{
    readonly factor: number;
    readonly anchorCss: readonly [number, number];
    readonly source: 'programmatic';
  }>): PatchMapViewportChangeResult;
  viewportProbe(): PatchMapViewportState;
  resize(width: number, height: number, pixelRatio?: number): boolean;
  historyState(): PatchMapHistoryState;
  undo(): PatchMapEngineHistoryResult;
  redo(): PatchMapEngineHistoryResult;
  clearHistory(): PatchMapEngineHistoryClearResult;
  registerAssets(
    instanceId: string,
    registrations: readonly PatchMapAssetRegistration[],
  ): PatchMapAssetRegistrationResult;
  assetProbe(alias?: string): Readonly<{
    session: PatchMapAssetSessionProbe | null;
    runtime: PatchMapAssetRuntimeProbe;
  }>;
  captureManagedPng(): Promise<PatchMapEngineExtractionResult>;
  snapshot(): PatchMapEngineSnapshot;
  setPresentationLayer(input: PatchMapLogicalPresentationLayerInput): PatchMapPresentationLayerChange;
  clearPresentationLayer(key: string): PatchMapPresentationLayerChange;
}

interface TargetSetAuthority {
  readonly query: PatchMapEngineQueryResult;
  readonly logical: readonly PatchMapLogicalTargetSnapshot[];
  readonly logicalByKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>;
}

interface LogicalTargetAddressIndex {
  readonly elements: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>;
  readonly components: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>;
}

const LOGICAL_TARGET_ADDRESS_CACHE = new WeakMap<object, LogicalTargetAddressIndex>();
const INCLUDE_ALL_LOGICAL_TARGETS = (): boolean => true;

function componentAddress(ownerId: string, componentId: string): string {
  return `${ownerId}\u0000${componentId}`;
}

function logicalTargetAddressIndex(
  targets: readonly PatchMapLogicalTargetSnapshot[],
): LogicalTargetAddressIndex {
  const cached = LOGICAL_TARGET_ADDRESS_CACHE.get(targets);
  if (cached !== undefined) return cached;
  const elements = new Map<string, PatchMapLogicalTargetSnapshot>();
  const components = new Map<string, PatchMapLogicalTargetSnapshot>();
  for (const target of targets) {
    if (target.kind === 'element') elements.set(target.id, target);
    else components.set(componentAddress(target.ownerId!, target.id), target);
  }
  const result = Object.freeze({ elements, components });
  LOGICAL_TARGET_ADDRESS_CACHE.set(targets, result);
  return result;
}

function nonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function targetMatch(target: PatchMapLogicalTargetSnapshot): PatchMapTargetMatch {
  if (target.kind === 'element') {
    return Object.freeze({
      id: target.id,
      kind: target.kind,
      type: target.type,
      label: target.label,
      value: target.value,
    });
  }
  return Object.freeze({
    id: target.ownerId!,
    componentId: target.id,
    kind: target.kind,
    type: target.type,
    label: target.label,
    value: target.value,
  });
}

function isTargetSet(value: PatchMapTargetsInput): value is PatchMapTargetSet {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'matches' in value &&
    'count' in value;
}

function oneOrMany<T>(value: PatchMapOneOrMany<T>): readonly T[] {
  return Array.isArray(value) ? value : [value as T];
}

function instanceTarget(
  target: PatchMapLogicalTargetSnapshot,
  byKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>,
): boolean {
  if (target.type === 'grid-cell') return true;
  if (target.parentKey === null) return false;
  return byKey.get(target.parentKey)?.type === 'grid-cell';
}

function inScope(
  target: PatchMapLogicalTargetSnapshot,
  scope: PatchMapTargetScope,
  byKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>,
): boolean {
  if (scope === 'all') return true;
  const instance = instanceTarget(target, byKey);
  return scope === 'instances' ? instance : !instance;
}

function matchesSelector(
  target: PatchMapLogicalTargetSnapshot,
  selector: PatchMapTargetQuery,
  byKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>,
): boolean {
  if (!inScope(target, selector.scope ?? 'all', byKey)) return false;
  if (selector.type !== undefined && target.type !== selector.type) return false;
  if (selector.componentId !== undefined) {
    if (target.kind !== 'component' || target.id !== selector.componentId) return false;
  }
  if (selector.id !== undefined) {
    const id = target.kind === 'component' ? target.ownerId : target.id;
    if (id !== selector.id) return false;
  }
  if (selector.within !== undefined) {
    const withinKey = `element:${selector.within}`;
    if (
      target.key !== withinKey &&
      !target.ancestorKeys.some((ancestorKey) => ancestorKey === withinKey)
    ) return false;
  }
  return true;
}

function engineLoadOptions(options: PatchMapDataReplaceOptions): PatchMapEngineLoadOptions {
  return Object.freeze({
    ...(options.datasetRef === undefined ? {} : { datasetRef: options.datasetRef }),
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });
}

function dataReplaceResult(result: PatchMapEngineLoadResult): PatchMapDataReplaceResult {
  return Object.freeze({
    rootIds: result.rootIds,
    semanticHash: result.semanticHash,
    sceneRevision: result.sceneRevision,
  });
}

function resolveSelectionIds(
  targets: PatchMapSelectionInput,
  targetSets: WeakMap<PatchMapTargetSet, TargetSetAuthority>,
): readonly string[] {
  if (typeof targets === 'string') return Object.freeze([targets]);
  if (Array.isArray(targets) && (targets.length === 0 || typeof targets[0] === 'string')) {
    return Object.freeze([...(targets as readonly string[])]);
  }
  if (isTargetSet(targets as PatchMapTargetsInput)) {
    const authority = targetSets.get(targets as PatchMapTargetSet);
    if (authority === undefined) throw new TypeError('target set belongs to another PatchMap');
    return Object.freeze([...new Set(authority.logical.map((target) => target.selectionId))]);
  }
  return Object.freeze([...new Set(oneOrMany(targets as PatchMapOneOrMany<PatchMapTarget>)
    .map((target) => target.id))]);
}

export function createPatchMapApi(host: PatchMapApiHost): PatchMapApi {
  const targetSets = new WeakMap<PatchMapTargetSet, TargetSetAuthority>();

  const assertReusable = (
    targets: PatchMapTargetSet,
    operation: 'update' | 'focus' | 'select' | 'presentation',
  ): TargetSetAuthority => {
    const authority = targetSets.get(targets);
    if (authority === undefined) {
      throw new TypeError('target set belongs to another PatchMap instance');
    }
    if (host.reuseQueryResult(authority.query, operation).status === 'rejected') {
      throw new TypeError('target set is stale; run targets.query() again after loading data');
    }
    return authority;
  };

  const targetsOf = (
    value: PatchMapTargetsInput,
    operation: 'update' | 'focus' | 'select',
  ): readonly PatchMapTarget[] => isTargetSet(value)
    ? assertReusable(value, operation).logical.map(targetMatch)
    : oneOrMany(value as PatchMapOneOrMany<PatchMapTarget>);

  const logicalTargetsOf = (
    value: PatchMapUpdateTargetsInput,
  ): Readonly<{
    readonly selected: readonly PatchMapLogicalTargetSnapshot[];
    readonly sceneTargets: readonly PatchMapLogicalTargetSnapshot[];
  }> => {
    if (isTargetSet(value as PatchMapTargetsInput)) {
      const authority = assertReusable(value as PatchMapTargetSet, 'update');
      return Object.freeze({
        selected: authority.logical,
        sceneTargets: authority.query.targets,
      });
    }
    const requested: readonly PatchMapTarget[] = typeof value === 'string'
      ? Object.freeze([{ id: value }])
      : Array.isArray(value) && (value.length === 0 || typeof value[0] === 'string')
        ? Object.freeze((value as readonly string[]).map((id) => Object.freeze({ id })))
        : oneOrMany(value as PatchMapOneOrMany<PatchMapTarget>);
    const logical = host.queryScene({
      recursive: true,
      predicate: INCLUDE_ALL_LOGICAL_TARGETS,
    }).targets;
    if (requested.length === 0) {
      return Object.freeze({ selected: Object.freeze([]), sceneTargets: logical });
    }
    const index = logicalTargetAddressIndex(logical);
    const selected = Object.freeze(requested.map((target) => {
      nonEmptyString(target.id, 'target.id');
      if (target.componentId !== undefined) {
        nonEmptyString(target.componentId, 'target.componentId');
      }
      const match = target.componentId === undefined
        ? index.elements.get(target.id)
        : index.components.get(componentAddress(target.id, target.componentId));
      if (match === undefined) {
        throw new TypeError(target.componentId === undefined
          ? `No PatchMap target has id ${target.id}`
          : `No PatchMap component matches ${target.id}/${target.componentId}`);
      }
      return match;
    }));
    return Object.freeze({ selected, sceneTargets: logical });
  };

  const engineFitOptions = (
    options: PatchMapFitOptions = {},
  ): PatchMapViewportFitOptions => {
    const padding = options.padding === undefined
      ? null
      : normalizePatchMapViewportPadding(options.padding);
    return Object.freeze({
      ...(padding === null
        ? {}
        : { paddingCssPx: Object.freeze([padding.x, padding.y] as const) }),
      ...(options.targets === undefined
        ? {}
        : { targets: targetsOf(options.targets, 'focus').map((target) => target.id) }),
    });
  };

  const fit = (options: PatchMapFitOptions = {}): PatchMapViewportFitResult =>
    host.fitViewport(engineFitOptions(options));

  const replaceFitOptions = (
    options: PatchMapDataReplaceOptions,
  ): PatchMapViewportFitOptions | null => options.fit === false
    ? null
    : engineFitOptions(options.fit === true || options.fit === undefined ? {} : options.fit);

  const data = Object.freeze({
    replace(input: unknown, options: PatchMapDataReplaceOptions = {}): PatchMapDataReplaceResult {
      const fitOptions = replaceFitOptions(options);
      const result = dataReplaceResult(host.loadDataset(input, engineLoadOptions(options)));
      if (fitOptions !== null) host.fitViewport(fitOptions);
      return result;
    },
    async replaceAsync(
      input: unknown,
      options: PatchMapDataReplaceOptions = {},
    ): Promise<PatchMapDataReplaceResult> {
      const fitOptions = replaceFitOptions(options);
      const result = dataReplaceResult(await host.loadDatasetAsync(input, engineLoadOptions(options)));
      if (fitOptions !== null) host.fitViewport(fitOptions);
      return result;
    },
    snapshot(): readonly unknown[] {
      return host.exportDataset();
    },
    serialize(strictReferences = true): string {
      return preparePatchMapPersistenceExport(host.exportDataset(), { strictReferences }).serialized;
    },
  });

  const targets = Object.freeze({
    get(target: PatchMapTarget): PatchMapTargetMatch | null {
      nonEmptyString(target.id, 'target.id');
      if (target.componentId !== undefined) nonEmptyString(target.componentId, 'target.componentId');
      const result = host.queryScene({
        recursive: true,
        where: target.componentId === undefined
          ? { id: target.id }
          : { id: target.componentId, ownerId: target.id },
      });
      return result.targets[0] === undefined ? null : targetMatch(result.targets[0]);
    },
    query(selector: PatchMapTargetQuery): PatchMapTargetSet {
      if (selector.id !== undefined) nonEmptyString(selector.id, 'selector.id');
      if (selector.componentId !== undefined) {
        nonEmptyString(selector.componentId, 'selector.componentId');
      }
      if (selector.type !== undefined) nonEmptyString(selector.type, 'selector.type');
      if (selector.within !== undefined) nonEmptyString(selector.within, 'selector.within');
      const query = host.queryScene({
        recursive: true,
        predicate: INCLUDE_ALL_LOGICAL_TARGETS,
      });
      const byKey = new Map<string, PatchMapLogicalTargetSnapshot>(
        query.targets.map((target) => [target.key, target]),
      );
      const logical = Object.freeze(query.targets.filter((target) =>
        matchesSelector(target, selector, byKey)));
      const result = Object.freeze({
        matches: Object.freeze(logical.map(targetMatch)),
        count: logical.length,
      });
      targetSets.set(result, Object.freeze({
        query,
        logical,
        logicalByKey: new Map(logical.map((target) => [target.key, target])),
      }));
      return result;
    },
  });

  const presentation = createPatchMapPresentationApi(host, {
    targetSetAuthority(targetSet) {
      return assertReusable(targetSet, 'presentation');
    },
  });

  const mutations = createPatchMapMutationApi(host, {
    resolveTargets: logicalTargetsOf,
    sceneTargets: () => host.queryScene({
      recursive: true,
      predicate: INCLUDE_ALL_LOGICAL_TARGETS,
    }).targets,
  });

  const selectionOperation = (
    op: 'replace' | 'add' | 'remove' | 'toggle',
    selected: PatchMapSelectionInput,
  ): readonly string[] => {
    if (isTargetSet(selected as PatchMapTargetsInput)) {
      assertReusable(selected as PatchMapTargetSet, 'select');
    }
    return host.applySelection({
      op,
      ids: resolveSelectionIds(selected, targetSets),
      source: 'external',
    }).current;
  };
  const selection = Object.freeze({
    get ids(): readonly string[] {
      return host.selectionIds;
    },
    set: (selected: PatchMapSelectionInput) => selectionOperation('replace', selected),
    add: (selected: PatchMapSelectionInput) => selectionOperation('add', selected),
    remove: (selected: PatchMapSelectionInput) => selectionOperation('remove', selected),
    toggle: (selected: PatchMapSelectionInput) => selectionOperation('toggle', selected),
    clear: () => host.applySelection({ op: 'clear', source: 'external' }).current,
    onChange(listener: (ids: readonly string[]) => void): () => void {
      return host.on('selectionChanged', (change) => listener(change.current));
    },
    onPointerChange(listener: (change: PatchMapPointerSelectionChange) => void): () => void {
      return host.onPointerSelectionChange(listener);
    },
  });

  const pointer = Object.freeze({
    onHover(listener: (event: PatchMapPointerHoverEvent) => void): () => void {
      return host.onPointerHover(listener);
    },
  });

  const transformIds = (selected: PatchMapTargetsInput): readonly string[] =>
    resolveSelectionIds(selected, targetSets);
  const transformOptions = (
    options: PatchMapTransformOptions,
  ): PatchMapEngineTransformerEditOptions => Object.freeze({
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  });
  const transform = Object.freeze({
    moveBy(
      selected: PatchMapTargetsInput,
      delta: readonly [number, number],
      options: PatchMapTransformOptions = {},
    ): PatchMapEngineTransformerEditResult {
      return host.applyTransformerEdit({
        kind: 'move',
        selectionIds: transformIds(selected),
        deltaWorld: delta,
      }, transformOptions(options));
    },
    resizeBy(
      selected: PatchMapTargetsInput,
      resize: Readonly<{
        readonly handle: Parameters<PatchMapApi['transform']['resizeBy']>[1]['handle'];
        readonly delta: readonly [number, number];
        readonly lockAspectRatio?: boolean;
        readonly minSize?: number;
      }>,
      options: PatchMapTransformOptions = {},
    ): PatchMapEngineTransformerEditResult {
      return host.applyTransformerEdit({
        kind: 'resize',
        selectionIds: transformIds(selected),
        handle: resize.handle,
        deltaWorld: resize.delta,
        ...(resize.lockAspectRatio === undefined
          ? {}
          : { lockAspectRatio: resize.lockAspectRatio }),
        ...(resize.minSize === undefined ? {} : { minSize: resize.minSize }),
      }, transformOptions(options));
    },
    rotateBy(
      selected: PatchMapTargetsInput,
      degrees: number,
      options: PatchMapTransformOptions = {},
    ): PatchMapEngineTransformerEditResult {
      return host.applyTransformerEdit({
        kind: 'rotate',
        selectionIds: transformIds(selected),
        deltaDegrees: degrees,
      }, transformOptions(options));
    },
  });

  const viewport = Object.freeze({
    fit,
    reset: (options: PatchMapFitOptions = {}) => host.restoreViewport(null, {
      ...(options.padding === undefined ? {} : { paddingCssPx: options.padding }),
      ...(options.targets === undefined
        ? {}
        : { targets: targetsOf(options.targets, 'focus').map((target) => target.id) }),
    }),
    panBy: (delta: readonly [number, number]) => host.panViewport(delta),
    zoomBy(factor: number, anchor?: readonly [number, number]): PatchMapViewportChangeResult {
      const size = host.snapshot().resources.canvas.cssSize;
      const resolvedAnchor = anchor ?? [size[0] / 2, size[1] / 2];
      return host.zoomViewportAt({ factor, anchorCss: resolvedAnchor, source: 'programmatic' });
    },
    resize: (width: number, height: number, pixelRatio?: number) =>
      host.resize(width, height, pixelRatio),
    get state(): PatchMapViewportState {
      return host.viewportProbe();
    },
  });

  const history = Object.freeze({
    get state(): PatchMapHistoryState {
      return host.historyState();
    },
    undo: () => host.undo(),
    redo: () => host.redo(),
    clear: () => host.clearHistory(),
  });

  const assets = Object.freeze({
    register(
      input: PatchMapOneOrMany<PatchMapAssetRegistration>,
    ): PatchMapAssetRegistrationResult {
      const instanceId = host.snapshot().instanceId;
      if (instanceId === null) throw new TypeError('mount PatchMap before registering assets');
      return host.registerAssets(instanceId, oneOrMany(input));
    },
    status: (alias?: string) => host.assetProbe(alias),
  });

  const capture = Object.freeze({
    async png(): Promise<Readonly<{
      readonly dataUrl: string;
      readonly mime: 'image/png';
      readonly size: readonly [number, number];
    }>> {
      const result = await host.captureManagedPng();
      return Object.freeze({
        dataUrl: result.dataUrl,
        mime: result.mime,
        size: result.cssSize,
      });
    },
  });

  return Object.freeze({
    update: mutations.update,
    updateBatch: mutations.updateBatch,
    transaction: mutations.transaction,
    data,
    targets,
    pointer,
    selection,
    presentation,
    transform,
    viewport,
    history,
    assets,
    debug: Object.freeze({ snapshot: () => host.snapshot() }),
    capture,
  });
}
