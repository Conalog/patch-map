import {
  PatchMapAdvanced,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
  type PatchMapBulkPatchRequest,
  type PatchMapEngineExtractionResult,
  type PatchMapEngineLoadResult,
  type PatchMapOptions,
  type PatchMapEngineSnapshot,
  type PatchMapEngineTransactionResult,
  type PatchMapEngineTransformerEditOptions,
  type PatchMapEngineTransformerEditResult,
  type PatchMapInitializeOptions,
  type PatchMapLoadOptions,
  type PatchMapLogicalTargetSnapshot,
  type PatchMapPersistenceExport,
  type PatchMapSelectionChange,
  type PatchMapTransformerEditRequest,
} from '@conalog/patch-map';

export const PATCH_MAP_HOST_ADAPTER_REVISION = 'patch-map-host-adapter/1' as const;

export const PATCH_MAP_HOST_ADAPTER_CAPABILITIES = Object.freeze([
  'load',
  'lookup',
  'bulk-update',
  'selection',
  'transform',
  'history',
  'dispose',
  'snapshot',
  'extract',
  'destroy',
] as const);

export type PatchMapHostHistoryCommand = 'inspect' | 'undo' | 'redo';

export interface PatchMapHostAdapterMountOptions {
  readonly engine?: Readonly<PatchMapOptions>;
  readonly initialize: PatchMapInitializeOptions;
}

export interface PatchMapHostAdapterDisposer {
  readonly disposed: boolean;
  dispose(): boolean;
}

/**
 * Consumer-owned orchestration for the redesigned PatchMap API. Every semantic
 * operation delegates to PatchMap; this adapter owns only host lifecycle
 * and subscription disposal.
 */
export class PatchMapHostAdapter {
  readonly #engine: PatchMapAdvanced;
  readonly #disposers = new Set<() => void>();
  #destroyed = false;

  private constructor(engine: PatchMapAdvanced) {
    this.#engine = engine;
  }

  public static async mount(
    options: PatchMapHostAdapterMountOptions,
  ): Promise<PatchMapHostAdapter> {
    const engine = new PatchMapAdvanced(options.engine);
    const adapter = new PatchMapHostAdapter(engine);
    try {
      await engine.initialize(options.initialize);
      return adapter;
    } catch (error) {
      await engine.destroy().catch(() => undefined);
      throw error;
    }
  }

  public load(input: unknown, options: PatchMapLoadOptions = {}): PatchMapEngineLoadResult {
    const compatible = materializePatchMapCompatibilityDataset(input);
    return this.#engine.loadDataset(compatible.canonicalDataset, options);
  }

  public prepareSave(strictReferences = true): PatchMapPersistenceExport {
    return preparePatchMapPersistenceExport(this.#engine.exportDataset(), {
      strictReferences,
    });
  }

  public lookup(id: string): PatchMapLogicalTargetSnapshot | null {
    return this.#engine.queryScene({
      recursive: true,
      where: { id },
    }).targets[0] ?? null;
  }

  public bulkUpdate(request: PatchMapBulkPatchRequest): PatchMapEngineTransactionResult {
    return this.#engine.bulkPatch(request);
  }

  public selection(ids: readonly string[]): PatchMapSelectionChange {
    return this.#engine.applySelection({
      op: 'replace',
      ids,
      source: 'external',
    });
  }

  public transform(
    request: PatchMapTransformerEditRequest,
    options: PatchMapEngineTransformerEditOptions = {},
  ): PatchMapEngineTransformerEditResult {
    return this.#engine.applyTransformerEdit(request, options);
  }

  public history(command: 'inspect'): ReturnType<PatchMapAdvanced['historyInspection']>;
  public history(command: 'undo' | 'redo'): ReturnType<PatchMapAdvanced['undo']>;
  public history(
    command: PatchMapHostHistoryCommand,
  ): ReturnType<PatchMapAdvanced['historyInspection']> | ReturnType<PatchMapAdvanced['undo']> {
    if (command === 'inspect') return this.#engine.historyInspection();
    return command === 'undo' ? this.#engine.undo() : this.#engine.redo();
  }

  public observeSelection(
    listener: Parameters<PatchMapAdvanced['bindSelectionHost']>[0],
  ): PatchMapHostAdapterDisposer {
    const release = this.#engine.bindSelectionHost(listener);
    this.#disposers.add(release);
    let disposed = false;
    return {
      get disposed(): boolean {
        return disposed;
      },
      dispose: (): boolean => {
        if (disposed) return false;
        disposed = true;
        this.#disposers.delete(release);
        release();
        return true;
      },
    };
  }

  public dispose(): number {
    const releases = [...this.#disposers];
    this.#disposers.clear();
    for (const release of releases) release();
    return releases.length;
  }

  public publish(timeMs = globalThis.performance?.now() ?? Date.now()): PatchMapEngineSnapshot {
    this.#engine.publishFrame(timeMs);
    return this.#engine.snapshot();
  }

  public snapshot(): PatchMapEngineSnapshot {
    return this.#engine.snapshot();
  }

  public assetProbe(alias?: string): ReturnType<PatchMapAdvanced['assetProbe']> {
    return this.#engine.assetProbe(alias);
  }

  public async extract(): Promise<PatchMapEngineExtractionResult> {
    const snapshot = this.publish();
    return this.#engine.extractPublishedScene({
      targetTuple: snapshot.publishedTuple,
      cssSize: snapshot.resources.canvas.cssSize,
      mime: 'image/png',
    });
  }

  public async destroy(): Promise<boolean> {
    if (this.#destroyed) return false;
    this.#destroyed = true;
    this.dispose();
    return this.#engine.destroy();
  }
}
