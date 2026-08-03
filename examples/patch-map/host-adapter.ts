import {
  PatchMap,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
  type PatchMap as PatchMapInstance,
  type PatchMapDataLoadOptions,
  type PatchMapDataLoadResult,
  type PatchMapEngineHistoryResult,
  type PatchMapEngineSnapshot,
  type PatchMapEngineTransformerEditResult,
  type PatchMapHistoryState,
  type PatchMapMountOptions,
  type PatchMapPersistenceExport,
  type PatchMapTargets,
  type PatchMapTransformOptions,
  type PatchMapTransactionOperation,
  type PatchMapUpdateResult,
} from '@conalog/patch-map';

export const PATCH_MAP_HOST_ADAPTER_REVISION = 'patch-map-host-adapter/2' as const;

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
export type PatchMapHostAdapterMountOptions = PatchMapMountOptions;

export interface PatchMapHostAdapterDisposer {
  readonly disposed: boolean;
  dispose(): boolean;
}

/**
 * Consumer-owned orchestration over the same high-level API used by normal
 * applications. The adapter owns only host subscription disposal.
 */
export class PatchMapHostAdapter {
  readonly #map: PatchMapInstance;
  readonly #disposers = new Set<() => void>();
  #destroyed = false;

  private constructor(map: PatchMapInstance) {
    this.#map = map;
  }

  public static async mount(
    options: PatchMapHostAdapterMountOptions,
  ): Promise<PatchMapHostAdapter> {
    return new PatchMapHostAdapter(await PatchMap.mount(options));
  }

  public load(
    input: unknown,
    options: PatchMapDataLoadOptions = {},
  ): PatchMapDataLoadResult {
    const compatible = materializePatchMapCompatibilityDataset(input);
    return this.#map.data.load(compatible.canonicalDataset, options);
  }

  public prepareSave(strictReferences = true): PatchMapPersistenceExport {
    return preparePatchMapPersistenceExport(this.#map.data.export(), {
      strictReferences,
    });
  }

  public lookup(id: string) {
    return this.#map.targets.get({ id });
  }

  public bulkUpdate(
    operations: readonly PatchMapTransactionOperation[],
  ): PatchMapUpdateResult {
    return this.#map.transaction(operations);
  }

  public selection(ids: readonly string[]): readonly string[] {
    return this.#map.selection.set(ids);
  }

  public transform(
    targets: PatchMapTargets,
    by: readonly [number, number],
    options: PatchMapTransformOptions = {},
  ): PatchMapEngineTransformerEditResult {
    return this.#map.transform.move(targets, by, options);
  }

  public history(command: 'inspect'): PatchMapHistoryState;
  public history(command: 'undo' | 'redo'): PatchMapEngineHistoryResult;
  public history(
    command: PatchMapHostHistoryCommand,
  ): PatchMapHistoryState | PatchMapEngineHistoryResult {
    if (command === 'inspect') return this.#map.history.state;
    return command === 'undo' ? this.#map.history.undo() : this.#map.history.redo();
  }

  public observeSelection(
    listener: (ids: readonly string[]) => void,
  ): PatchMapHostAdapterDisposer {
    const release = this.#map.selection.onChange(listener);
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

  public snapshot(): PatchMapEngineSnapshot {
    return this.#map.debug.snapshot();
  }

  public assetProbe(alias?: string): unknown {
    return this.#map.assets.inspect(alias);
  }

  public extract() {
    return this.#map.capture.png();
  }

  public async destroy(): Promise<boolean> {
    if (this.#destroyed) return false;
    this.#destroyed = true;
    this.dispose();
    return this.#map.destroy();
  }
}
