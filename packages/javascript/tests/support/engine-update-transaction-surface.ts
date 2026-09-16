import type {
  PatchMap,
  PatchMapEngineSurface,
  PatchMapPoint,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceViewportInput,
} from '../../src/engine';
import { createPublicApiEngine } from './public-api-engine';

export interface RecordedReconcile {
  readonly input: unknown;
  readonly options: Readonly<{
    animateBarChanges: boolean;
    animatedBarTargets: readonly Readonly<{
      ownerId: string;
      componentId: string;
    }>[];
    allowedComponentOrderOwners: readonly string[];
    allowedElementOrderIds?: readonly string[];
    selectionIds?: readonly string[];
    incrementalRootIds?: readonly string[];
    directBarHeightUpdates?: readonly Readonly<{
      ownerId: string;
      componentId: string;
      height: number;
    }>[];
    directTextUpdates?: readonly Readonly<{
      ownerId: string;
      componentId: string;
      text: string;
    }>[];
  }>;
}

export class TransactionSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public frameCount = 0;
  public loaded: unknown = null;
  public mode: 'committed' | 'refused' | 'throw' | 'terminal' = 'committed';
  public onTerminalFailure: ((error: Error) => void) | null = null;
  public hitId: string | null = null;
  public selectionIds: readonly string[] = Object.freeze([]);
  public readonly reconcileCalls: RecordedReconcile[] = [];
  private width: number;
  private height: number;
  private pixelRatio: number;
  private viewportInputListener: ((input: PatchMapSurfaceViewportInput) => void) | null = null;
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loadCount += 1;
    this.loaded = input;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.reconcileCalls.push(Object.freeze({
      input,
      options: Object.freeze({
        animateBarChanges: options.animateBarChanges ?? false,
        animatedBarTargets: Object.freeze(
          (options.animatedBarTargets ?? []).map((target) => Object.freeze({
            ownerId: target.ownerId,
            componentId: target.componentId,
          })),
        ),
        allowedComponentOrderOwners: Object.freeze([
          ...(options.allowedComponentOrderOwners ?? []),
        ]),
        ...(options.allowedElementOrderIds === undefined
          ? {}
          : { allowedElementOrderIds: Object.freeze([...options.allowedElementOrderIds]) }),
        ...(options.selectionIds === undefined
          ? {}
          : { selectionIds: Object.freeze([...options.selectionIds]) }),
        ...(options.incrementalRootIds === undefined
          ? {}
          : { incrementalRootIds: Object.freeze([...options.incrementalRootIds]) }),
        ...(options.directBarHeightUpdates === undefined
          ? {}
          : {
              directBarHeightUpdates: Object.freeze(
                options.directBarHeightUpdates.map((update) =>
                  Object.freeze({ ...update })),
              ),
            }),
        ...(options.directTextUpdates === undefined
          ? {}
          : {
              directTextUpdates: Object.freeze(
                options.directTextUpdates.map((update) =>
                  Object.freeze({ ...update })),
              ),
            }),
      }),
    }));
    if (this.mode === 'terminal') {
      const cause = new Error('surface mutation boundary failure');
      const terminal = new Error('terminal surface mutation failure', { cause });
      this.onTerminalFailure?.(terminal);
      throw cause;
    }
    if (this.mode === 'throw') throw new Error('surface transaction failure');
    if (this.mode === 'refused') {
      return Object.freeze({
        status: 'refused',
        operationCount: 0,
        denseChanged: false,
        diagnostics: Object.freeze([Object.freeze({
          severity: 'error' as const,
          code: 'UNPROJECTED_SEMANTIC_DELTA' as const,
          message: 'transaction surface refusal',
          path: '$.surface',
        })]),
      });
    }
    this.loaded = input;
    if (options.selectionIds !== undefined) {
      this.selectionIds = Object.freeze([...options.selectionIds]);
    }
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void {
    this.frameCount += 1;
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public bindViewportInput(
    listener: (input: PatchMapSurfaceViewportInput) => void,
  ): () => void {
    this.viewportInputListener = listener;
    return () => {
      if (this.viewportInputListener === listener) this.viewportInputListener = null;
    };
  }

  public emitViewportInput(input: PatchMapSurfaceViewportInput): void {
    this.viewportInputListener?.(input);
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return this.hitId;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 0,
      visiblePrimitiveCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

export async function createEngine(
  engines: PatchMap[],
  instanceId: string,
): Promise<Readonly<{
  engine: ReturnType<typeof createPublicApiEngine>;
  surface: TransactionSurface;
}>> {
  const surface = new TransactionSurface({ width: 800, height: 600, pixelRatio: 1 });
  const engine = createPublicApiEngine({
    surfaceFactory: (options) => {
      surface.onTerminalFailure = options.onTerminalFailure ?? null;
      return Promise.resolve(surface);
    },
    historyLimit: 16,
  });
  engines.push(engine);
  await engine.initialize({ instanceId, width: 800, height: 600 });
  return Object.freeze({ engine, surface });
}
