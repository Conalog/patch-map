import type { PatchMapAssetRegistration } from './assets';
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
  PatchMapViewportFocusResult,
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
  PatchMapTextBatchRequest,
} from './semantic/transaction';
import type {
  PatchMapBarUpdate,
  PatchMapBarUpdateOptions,
  PatchMapCompiledTargets,
  PatchMapDataLoadResult,
  PatchMapDeveloperApi,
  PatchMapFitOptions,
  PatchMapInstanceBarUpdate,
  PatchMapInstanceBarUpdateOptions,
  PatchMapOneOrMany,
  PatchMapSelectionTargets,
  PatchMapDataLoadOptions,
  PatchMapTarget,
  PatchMapTargetMatch,
  PatchMapTargetScope,
  PatchMapTargets,
  PatchMapTargetSelector,
  PatchMapTextUpdate,
  PatchMapTextUpdateOptions,
  PatchMapTransformOptions,
  PatchMapUpdateResult,
} from './developer-api/contracts';
import type { PatchMapTransformerEditRequest } from './transformer-edit';

export type * from './developer-api/contracts';

interface PatchMapDeveloperHost {
  readonly selectionIds: readonly string[];
  loadDataset(input: unknown, options?: PatchMapEngineLoadOptions): PatchMapEngineLoadResult;
  loadDatasetAsync(
    input: unknown,
    options?: PatchMapEngineLoadOptions,
  ): Promise<PatchMapEngineLoadResult>;
  exportDataset(): readonly unknown[];
  updateBarHeights(request: PatchMapBarHeightBatchRequest): PatchMapEngineTransactionResult;
  updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapEngineInstanceBarHeightResult;
  updateTexts(request: PatchMapTextBatchRequest): PatchMapEngineTransactionResult;
  queryScene(input?: PatchMapSceneQuery): PatchMapEngineQueryResult;
  reuseQueryResult(result: PatchMapEngineQueryResult, operation: 'update' | 'focus' | 'select'): {
    readonly status: 'accepted' | 'rejected';
  };
  on(
    event: 'selectionChanged',
    listener: (change: PatchMapSelectionChange) => void,
  ): () => void;
  applySelection(input: PatchMapSelectionSetOperation): PatchMapSelectionChange;
  applyTransformerEdit(
    request: PatchMapTransformerEditRequest,
    options?: PatchMapEngineTransformerEditOptions,
  ): PatchMapEngineTransformerEditResult;
  fitViewport(options?: PatchMapViewportFitOptions): PatchMapViewportFitResult;
  focusViewport(
    options?: { readonly targets?: readonly string[] | null },
  ): PatchMapViewportFocusResult;
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
  registerAssets(instanceId: string, registrations: readonly PatchMapAssetRegistration[]): unknown;
  assetProbe(alias?: string): unknown;
  captureManagedPng(): Promise<PatchMapEngineExtractionResult>;
  snapshot(): PatchMapEngineSnapshot;
}

interface CompiledAuthority {
  readonly query: PatchMapEngineQueryResult;
  readonly logical: readonly PatchMapLogicalTargetSnapshot[];
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

function isCompiledTargets(value: PatchMapTargets): value is PatchMapCompiledTargets {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'selector' in value &&
    'targets' in value;
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
  selector: PatchMapTargetSelector,
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

function engineLoadOptions(options: PatchMapDataLoadOptions): PatchMapEngineLoadOptions {
  return Object.freeze({
    ...(options.datasetRef === undefined ? {} : { datasetRef: options.datasetRef }),
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });
}

function dataLoadResult(result: PatchMapEngineLoadResult): PatchMapDataLoadResult {
  return Object.freeze({
    rootIds: result.rootIds,
    semanticHash: result.semanticHash,
    sceneRevision: result.sceneRevision,
  });
}

function projectTransactionResult(result: PatchMapEngineTransactionResult): PatchMapUpdateResult {
  return Object.freeze({
    status: result.status === 'committed'
      ? 'committed'
      : result.status === 'rejected'
        ? 'rejected'
        : 'unchanged',
    changed: result.changed,
    appliedCount: result.applied.length,
    missing: Object.freeze(result.missing.map((target) => target.kind === 'element'
      ? Object.freeze({ id: target.id })
      : Object.freeze({ id: target.ownerId, componentId: target.id }))),
    diagnostic: result.status === 'rejected' ? result.diagnostic : null,
  });
}

function projectInstanceResult(
  result: PatchMapEngineInstanceBarHeightResult,
): PatchMapUpdateResult {
  return Object.freeze({
    status: result.status,
    changed: result.changed,
    appliedCount: result.appliedTargets.length,
    missing: result.missingTargets,
    diagnostic: result.status === 'rejected' ? result.diagnostic : null,
  });
}

function resolveSelectionIds(
  targets: PatchMapSelectionTargets,
  compiled: WeakMap<PatchMapCompiledTargets, CompiledAuthority>,
): readonly string[] {
  if (typeof targets === 'string') return Object.freeze([targets]);
  if (Array.isArray(targets) && (targets.length === 0 || typeof targets[0] === 'string')) {
    return Object.freeze([...(targets as readonly string[])]);
  }
  if (isCompiledTargets(targets as PatchMapTargets)) {
    const authority = compiled.get(targets as PatchMapCompiledTargets);
    if (authority === undefined) throw new TypeError('compiled targets belong to another PatchMap');
    return Object.freeze([...new Set(authority.logical.map((target) => target.selectionId))]);
  }
  return Object.freeze([...new Set(oneOrMany(targets as PatchMapOneOrMany<PatchMapTarget>)
    .map((target) => target.id))]);
}

export function createPatchMapDeveloperApi(host: PatchMapDeveloperHost): PatchMapDeveloperApi {
  const compiled = new WeakMap<PatchMapCompiledTargets, CompiledAuthority>();

  const assertReusable = (
    targets: PatchMapCompiledTargets,
    operation: 'update' | 'focus' | 'select',
  ): CompiledAuthority => {
    const authority = compiled.get(targets);
    if (authority === undefined) {
      throw new TypeError('compiled targets belong to another PatchMap instance');
    }
    if (host.reuseQueryResult(authority.query, operation).status === 'rejected') {
      throw new TypeError('compiled targets are stale; compile the selector again after loading data');
    }
    return authority;
  };

  const targetsOf = (
    value: PatchMapTargets,
    operation: 'update' | 'focus' | 'select',
  ): readonly PatchMapTarget[] => isCompiledTargets(value)
    ? assertReusable(value, operation).logical.map(targetMatch)
    : oneOrMany(value as PatchMapOneOrMany<PatchMapTarget>);

  const fit = (options: PatchMapFitOptions = {}): PatchMapViewportFitResult => host.fitViewport({
    ...(options.padding === undefined ? {} : { paddingCssPx: options.padding }),
    ...(options.targets === undefined
      ? {}
      : { targets: targetsOf(options.targets, 'focus').map((target) => target.id) }),
  });

  const data = Object.freeze({
    load(input: unknown, options: PatchMapDataLoadOptions = {}): PatchMapDataLoadResult {
      const result = dataLoadResult(host.loadDataset(input, engineLoadOptions(options)));
      if (options.fit !== false) fit(options.fit === true || options.fit === undefined ? {} : options.fit);
      return result;
    },
    async loadAsync(
      input: unknown,
      options: PatchMapDataLoadOptions = {},
    ): Promise<PatchMapDataLoadResult> {
      const result = dataLoadResult(await host.loadDatasetAsync(input, engineLoadOptions(options)));
      if (options.fit !== false) fit(options.fit === true || options.fit === undefined ? {} : options.fit);
      return result;
    },
    export(): readonly unknown[] {
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
    compile(selector: PatchMapTargetSelector): PatchMapCompiledTargets {
      if (selector.id !== undefined) nonEmptyString(selector.id, 'selector.id');
      if (selector.componentId !== undefined) {
        nonEmptyString(selector.componentId, 'selector.componentId');
      }
      if (selector.type !== undefined) nonEmptyString(selector.type, 'selector.type');
      if (selector.within !== undefined) nonEmptyString(selector.within, 'selector.within');
      const query = host.queryScene({ recursive: true });
      const byKey = new Map<string, PatchMapLogicalTargetSnapshot>(
        query.targets.map((target) => [target.key, target]),
      );
      const logical = Object.freeze(query.targets.filter((target) =>
        matchesSelector(target, selector, byKey)));
      const frozenSelector = Object.freeze({ ...selector });
      const result = Object.freeze({
        selector: frozenSelector,
        targets: Object.freeze(logical.map(targetMatch)),
        count: logical.length,
        sceneRevision: query.sceneRevision,
      });
      compiled.set(result, Object.freeze({ query, logical }));
      return result;
    },
  });

  const setBarBatch = (
      selected: PatchMapTargets,
      heights: ArrayLike<number>,
      options: PatchMapBarUpdateOptions = {},
  ): PatchMapUpdateResult => {
    const resolved = targetsOf(selected, 'update');
    const request: PatchMapBarHeightBatchRequest = {
      targets: resolved.map((target) => ({
        ownerId: nonEmptyString(target.id, 'target.id'),
        componentId: nonEmptyString(target.componentId ?? '', 'target.componentId'),
      })),
      heights,
      ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
      ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
    };
    return projectTransactionResult(host.updateBarHeights(request));
  };
  const setInstanceBarBatch = (
      selected: PatchMapTargets,
      heights: ArrayLike<number | null>,
      options: PatchMapInstanceBarUpdateOptions = {},
  ): PatchMapUpdateResult => {
    const resolved = targetsOf(selected, 'update');
    return projectInstanceResult(host.updateInstanceBarHeights({
      targets: resolved.map((target) => ({
        id: nonEmptyString(target.id, 'target.id'),
        componentId: nonEmptyString(target.componentId ?? '', 'target.componentId'),
      })),
      heights,
      ...(options.animate === undefined ? {} : { animate: options.animate }),
    }));
  };
  const bars = Object.freeze({
    set: (input: PatchMapOneOrMany<PatchMapBarUpdate>, options: PatchMapBarUpdateOptions = {}) => {
      const updates = oneOrMany(input);
      return setBarBatch(updates, updates.map((update) => update.height), options);
    },
    setBatch: setBarBatch,
    setInstances: (
      input: PatchMapOneOrMany<PatchMapInstanceBarUpdate>,
      options: PatchMapInstanceBarUpdateOptions = {},
    ) => {
      const updates = oneOrMany(input);
      return setInstanceBarBatch(updates, updates.map((update) => update.height), options);
    },
    setInstanceBatch: setInstanceBarBatch,
  });

  const texts = Object.freeze({
    set(input: PatchMapOneOrMany<PatchMapTextUpdate>, options: PatchMapTextUpdateOptions = {}): PatchMapUpdateResult {
      const updates = oneOrMany(input);
      const hasStyle = updates.some((update) => update.style !== undefined);
      return projectTransactionResult(host.updateTexts({
        targets: updates.map((update) => ({ ownerId: update.id, componentId: update.componentId })),
        texts: updates.map((update) => update.text),
        ...(hasStyle ? { styles: updates.map((update) => update.style ?? {}) } : {}),
        ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
        ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
      }));
    },
  });

  const selectionOperation = (
    op: 'replace' | 'add' | 'remove' | 'toggle',
    selected: PatchMapSelectionTargets,
  ): readonly string[] => {
    if (isCompiledTargets(selected as PatchMapTargets)) {
      assertReusable(selected as PatchMapCompiledTargets, 'select');
    }
    return host.applySelection({
      op,
      ids: resolveSelectionIds(selected, compiled),
      source: 'external',
    }).current;
  };
  const selection = Object.freeze({
    get ids(): readonly string[] {
      return host.selectionIds;
    },
    set: (selected: PatchMapSelectionTargets) => selectionOperation('replace', selected),
    add: (selected: PatchMapSelectionTargets) => selectionOperation('add', selected),
    remove: (selected: PatchMapSelectionTargets) => selectionOperation('remove', selected),
    toggle: (selected: PatchMapSelectionTargets) => selectionOperation('toggle', selected),
    clear: () => host.applySelection({ op: 'clear', source: 'external' }).current,
    onChange(listener: (ids: readonly string[]) => void): () => void {
      return host.on('selectionChanged', (change) => listener(change.current));
    },
  });

  const transformIds = (selected: PatchMapTargets): readonly string[] =>
    resolveSelectionIds(selected, compiled);
  const transformOptions = (
    options: PatchMapTransformOptions,
  ): PatchMapEngineTransformerEditOptions => Object.freeze({
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  });
  const transform = Object.freeze({
    move(
      selected: PatchMapTargets,
      by: readonly [number, number],
      options: PatchMapTransformOptions = {},
    ): PatchMapEngineTransformerEditResult {
      return host.applyTransformerEdit({
        kind: 'move',
        selectionIds: transformIds(selected),
        deltaWorld: by,
      }, transformOptions(options));
    },
    resize(
      selected: PatchMapTargets,
      resize: Readonly<{
        readonly handle: Parameters<PatchMapDeveloperApi['transform']['resize']>[1]['handle'];
        readonly by: readonly [number, number];
        readonly lockAspectRatio?: boolean;
        readonly minSize?: number;
      }>,
      options: PatchMapTransformOptions = {},
    ): PatchMapEngineTransformerEditResult {
      return host.applyTransformerEdit({
        kind: 'resize',
        selectionIds: transformIds(selected),
        handle: resize.handle,
        deltaWorld: resize.by,
        ...(resize.lockAspectRatio === undefined
          ? {}
          : { lockAspectRatio: resize.lockAspectRatio }),
        ...(resize.minSize === undefined ? {} : { minSize: resize.minSize }),
      }, transformOptions(options));
    },
    rotate(
      selected: PatchMapTargets,
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
    focus(selected?: PatchMapTargets): PatchMapViewportFocusResult {
      return host.focusViewport(selected === undefined
        ? {}
        : { targets: targetsOf(selected, 'focus').map((target) => target.id) });
    },
    reset: (options: PatchMapFitOptions = {}) => host.restoreViewport(null, {
      ...(options.padding === undefined ? {} : { paddingCssPx: options.padding }),
      ...(options.targets === undefined
        ? {}
        : { targets: targetsOf(options.targets, 'focus').map((target) => target.id) }),
    }),
    pan: (x: number, y: number) => host.panViewport([x, y]),
    zoom(factor: number, anchor?: readonly [number, number]): PatchMapViewportChangeResult {
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
    register(input: PatchMapOneOrMany<PatchMapAssetRegistration>): unknown {
      const instanceId = host.snapshot().instanceId;
      if (instanceId === null) throw new TypeError('mount PatchMap before registering assets');
      return host.registerAssets(instanceId, oneOrMany(input));
    },
    inspect: (alias?: string) => host.assetProbe(alias),
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
    data,
    targets,
    bars,
    texts,
    selection,
    transform,
    viewport,
    history,
    assets,
    debug: Object.freeze({ snapshot: () => host.snapshot() }),
    capture,
  });
}
