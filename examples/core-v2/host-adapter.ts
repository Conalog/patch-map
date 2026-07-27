import {
  CoreV2Engine,
  type CoreV2BulkPatchRequest,
  type CoreV2EngineExtractionResult,
  type CoreV2EngineLoadResult,
  type CoreV2EngineOptions,
  type CoreV2EngineSnapshot,
  type CoreV2EngineTransactionResult,
  type CoreV2EngineTransformerEditOptions,
  type CoreV2EngineTransformerEditResult,
  type CoreV2InitializeOptions,
  type CoreV2LoadOptions,
  type CoreV2LogicalTargetSnapshot,
  type CoreV2SelectionChange,
  type CoreV2TransformerEditRequest,
} from '@conalog/patch-map/core-v2';

export const CORE_V2_HOST_ADAPTER_REVISION = 'core-v2-host-adapter/1' as const;

export const CORE_V2_HOST_ADAPTER_CAPABILITIES = Object.freeze([
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

export type CoreV2HostHistoryCommand = 'inspect' | 'undo' | 'redo';

export interface CoreV2HostAdapterMountOptions {
  readonly engine?: Readonly<CoreV2EngineOptions>;
  readonly initialize: CoreV2InitializeOptions;
}

export interface CoreV2HostAdapterDisposer {
  readonly disposed: boolean;
  dispose(): boolean;
}

/**
 * Consumer-owned orchestration for the redesigned Core v2 API. Every semantic
 * operation delegates to CoreV2Engine; this adapter owns only host lifecycle
 * and subscription disposal.
 */
export class CoreV2HostAdapter {
  readonly #engine: CoreV2Engine;
  readonly #disposers = new Set<() => void>();
  #destroyed = false;

  private constructor(engine: CoreV2Engine) {
    this.#engine = engine;
  }

  public static async mount(
    options: CoreV2HostAdapterMountOptions,
  ): Promise<CoreV2HostAdapter> {
    const engine = new CoreV2Engine(options.engine);
    const adapter = new CoreV2HostAdapter(engine);
    try {
      await engine.initialize(options.initialize);
      return adapter;
    } catch (error) {
      await engine.destroy().catch(() => undefined);
      throw error;
    }
  }

  public load(input: unknown, options: CoreV2LoadOptions = {}): CoreV2EngineLoadResult {
    return this.#engine.loadDataset(input, options);
  }

  public lookup(id: string): CoreV2LogicalTargetSnapshot | null {
    return this.#engine.queryScene({
      recursive: true,
      where: { id },
    }).targets[0] ?? null;
  }

  public bulkUpdate(request: CoreV2BulkPatchRequest): CoreV2EngineTransactionResult {
    return this.#engine.bulkPatch(request);
  }

  public selection(ids: readonly string[]): CoreV2SelectionChange {
    return this.#engine.applySelection({
      op: 'replace',
      ids,
      source: 'external',
    });
  }

  public transform(
    request: CoreV2TransformerEditRequest,
    options: CoreV2EngineTransformerEditOptions = {},
  ): CoreV2EngineTransformerEditResult {
    return this.#engine.applyTransformerEdit(request, options);
  }

  public history(command: 'inspect'): ReturnType<CoreV2Engine['historyInspection']>;
  public history(command: 'undo' | 'redo'): ReturnType<CoreV2Engine['undo']>;
  public history(
    command: CoreV2HostHistoryCommand,
  ): ReturnType<CoreV2Engine['historyInspection']> | ReturnType<CoreV2Engine['undo']> {
    if (command === 'inspect') return this.#engine.historyInspection();
    return command === 'undo' ? this.#engine.undo() : this.#engine.redo();
  }

  public observeSelection(
    listener: Parameters<CoreV2Engine['bindSelectionHost']>[0],
  ): CoreV2HostAdapterDisposer {
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

  public publish(timeMs = globalThis.performance?.now() ?? Date.now()): CoreV2EngineSnapshot {
    this.#engine.publishFrame(timeMs);
    return this.#engine.snapshot();
  }

  public snapshot(): CoreV2EngineSnapshot {
    return this.#engine.snapshot();
  }

  public assetProbe(alias?: string): ReturnType<CoreV2Engine['assetProbe']> {
    return this.#engine.assetProbe(alias);
  }

  public async extract(): Promise<CoreV2EngineExtractionResult> {
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
