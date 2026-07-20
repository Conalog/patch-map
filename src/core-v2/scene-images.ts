import type {
  CoreV2ImageDimensionMode,
  CoreV2ImageProjection,
  CoreV2ImageSourceKind,
  CoreV2ProjectionIndex,
} from './contracts';
import { normalizeCoreV2AssetDescriptor } from './assets';
import type { CoreV2AssetSource } from './semantic/dataset';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafAssetRenderRole,
  LeafSceneImageProbe,
} from './renderers/leaf-layer';

export type CoreV2SceneImageResourceState =
  | 'absent'
  | 'pending'
  | 'resolved'
  | 'failed';

export type CoreV2SceneImageAttachmentState = 'current' | 'unbound' | 'stale';

export interface CoreV2SceneImageRendererBridge {
  bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation>;
  unbindSceneAsset(key: string): Promise<boolean>;
  sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null;
  sceneImageProbe(entityId: string): LeafSceneImageProbe | null;
  finalizeAssetUnloads(): Promise<void>;
}

export interface CoreV2SceneImageControllerOptions {
  /** Schedules one aggregate frame; never creates an entity ticker or RAF. */
  readonly onInvalidate?: (reason: string) => void;
  /** Commits decoded logical size only for the still-current intrinsic target. */
  readonly onIntrinsicSize?: (resolution: CoreV2SceneImageIntrinsicSize) => void;
}

export interface CoreV2SceneImageIntrinsicSize {
  readonly entityId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly naturalSize: readonly [number, number];
}

export interface CoreV2SceneImageReconcileOptions {
  /** Omit to acquire every image. Hidden images should be excluded by the Core. */
  readonly activeEntityIds?: ReadonlySet<string>;
}

export interface CoreV2SceneImageReconcileResult {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly activated: readonly string[];
  readonly deactivated: readonly string[];
  readonly bindingsStarted: readonly string[];
  readonly bindingsRetired: readonly string[];
}

export interface CoreV2SceneImageDiagnostic {
  readonly level: 'warning';
  readonly code: 'ASSET_LOAD_FAILED';
  readonly targetId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly message: string;
}

export interface CoreV2SceneImageAttemptProbe {
  readonly generation: number;
  readonly bindingKey: string;
  readonly authoredSource: CoreV2AssetSource;
  readonly sourceKind: CoreV2ImageSourceKind;
  readonly dimensionMode: CoreV2ImageDimensionMode;
  readonly sourceCacheIdentity: string;
  readonly resourceState: CoreV2SceneImageResourceState;
  readonly attachmentState: CoreV2SceneImageAttachmentState;
  readonly rendererGeneration: number | null;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly diagnosticCount: number;
}

export interface CoreV2SceneImageProductProbe {
  readonly entityId: string;
  readonly active: boolean;
  readonly generation: number;
  readonly authoredSource: CoreV2AssetSource;
  readonly sourceKind: CoreV2ImageSourceKind;
  readonly dimensionMode: CoreV2ImageDimensionMode;
  readonly bindingKey: string;
  readonly sourceCacheIdentity: string;
  readonly state: CoreV2SceneImageResourceState;
  readonly attachmentState: CoreV2SceneImageAttachmentState;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly renderObjectCount: 0 | 1;
  readonly role: LeafAssetRenderRole;
  readonly rendererGeneration: number | null;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
  readonly diagnosticCount: number;
  readonly attempts: readonly CoreV2SceneImageAttemptProbe[];
}

export interface CoreV2SceneImagesProbe {
  readonly destroyed: boolean;
  readonly targetCount: number;
  readonly activeTargetCount: number;
  readonly bindingCount: number;
  readonly pendingBindingCount: number;
  readonly pendingSettlementCount: number;
  readonly pendingReleaseCount: number;
  readonly diagnosticCount: number;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
  readonly images: Readonly<Record<string, CoreV2SceneImageProductProbe>>;
  readonly diagnostics: readonly CoreV2SceneImageDiagnostic[];
  readonly abandonedRequests: Readonly<{
    readonly pendingSettlementCount: number;
    readonly pendingReleaseCount: number;
    readonly staleAttachmentCount: number;
  }>;
}

interface ImageAttempt {
  readonly entityId: string;
  readonly generation: number;
  readonly bindingKey: string;
  readonly authoredSource: CoreV2AssetSource;
  readonly sourceKind: CoreV2ImageSourceKind;
  readonly dimensionMode: CoreV2ImageDimensionMode;
  readonly sourceCacheIdentity: string;
  resourceState: CoreV2SceneImageResourceState;
  attachmentState: CoreV2SceneImageAttachmentState;
  rendererGeneration: number | null;
  cacheIdentity: string | null;
  normalizedResourceIdentity: string | null;
  naturalSize: readonly [number, number] | null;
  reusedResolvedResource: boolean;
  diagnosticCount: number;
  staleCompletionRecorded: boolean;
  intrinsicSizePublished: boolean;
  /** Pending outcome owner; cleared on settlement or bounded-history eviction. */
  binding: ImageBinding | null;
}

interface ImageTarget {
  readonly entityId: string;
  projection: CoreV2ImageProjection;
  signature: string;
  generation: number;
  active: boolean;
  current: ImageAttempt;
  readonly attempts: ImageAttempt[];
  staleAttachCount: number;
  staleCompletionCount: number;
  diagnosticCount: number;
}

interface ImageBinding {
  readonly key: string;
  readonly request: LeafAssetBindingRequest;
  readonly requestSignature: string;
  readonly consumers: Map<string, number>;
  readonly attempts: Set<ImageAttempt>;
  retired: boolean;
  resourceState: Exclude<CoreV2SceneImageResourceState, 'absent'>;
  observation: LeafAssetBindingObservation | null;
  rendererGeneration: number | null;
  settlement: Promise<void> | null;
}

interface DesiredImage {
  readonly projection: CoreV2ImageProjection;
  readonly request: LeafAssetBindingRequest;
  readonly requestSignature: string;
  readonly signature: string;
  readonly active: boolean;
}

const EMPTY_RECONCILE_RESULT: CoreV2SceneImageReconcileResult = Object.freeze({
  added: Object.freeze([]),
  updated: Object.freeze([]),
  removed: Object.freeze([]),
  activated: Object.freeze([]),
  deactivated: Object.freeze([]),
  bindingsStarted: Object.freeze([]),
  bindingsRetired: Object.freeze([]),
});

export const CORE_V2_SCENE_IMAGE_ATTEMPT_LIMIT = 8;

/**
 * Expected-blind scene image ownership above the Pixi leaf bridge.
 *
 * The parser projection remains the semantic authority. The bridge owns Pixi
 * textures and Sprites; this controller only owns target/binding generations,
 * diagnostic de-duplication, and the state-versus-frame release boundary.
 */
export class CoreV2SceneImageController {
  private readonly targets = new Map<string, ImageTarget>();
  private readonly bindings = new Map<string, ImageBinding>();
  private readonly generations = new Map<string, number>();
  private readonly diagnosticsValue: CoreV2SceneImageDiagnostic[] = [];
  private readonly diagnosticKeys = new Set<string>();
  private readonly pendingSettlements = new Set<Promise<void>>();
  private readonly pendingReleases = new Set<Promise<void>>();
  private readonly pendingFrameReleases = new Set<ImageBinding>();
  private readonly pendingFinalizations = new Set<Promise<void>>();
  private readonly lifecycleFailures: unknown[] = [];
  private destroyedValue = false;

  public constructor(
    private readonly renderer: CoreV2SceneImageRendererBridge,
    private readonly options: CoreV2SceneImageControllerOptions = {},
  ) {}

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  /**
   * Atomically validates the next parser sidecar, then diffs target ownership.
   * Request-compatible ownership transfers reserve a binding across the diff;
   * every other old binding retires before its replacement starts.
   */
  public reconcile(
    index: CoreV2ProjectionIndex,
    options: CoreV2SceneImageReconcileOptions = {},
  ): CoreV2SceneImageReconcileResult {
    this.assertAlive();
    const desired = normalizeDesiredImages(index, options.activeEntityIds);
    if (desired.size === 0 && this.targets.size === 0) return EMPTY_RECONCILE_RESULT;

    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const activated: string[] = [];
    const deactivated: string[] = [];
    const bindingsStarted: string[] = [];
    const bindingsRetired: string[] = [];
    const reservedBindings = desiredActiveBindingSignatures(desired);

    for (const entityId of [...this.targets.keys()].sort()) {
      const target = this.targets.get(entityId)!;
      const next = desired.get(entityId);
      if (!next) {
        this.detachCurrent(target, bindingsRetired, reservedBindings);
        this.targets.delete(entityId);
        this.forgetTargetHistory(target);
        removed.push(entityId);
        continue;
      }
      if (target.signature === next.signature && target.active === next.active) continue;
      this.detachCurrent(target, bindingsRetired, reservedBindings);
    }

    for (const [entityId, next] of desired) {
      let target = this.targets.get(entityId);
      if (target && target.signature === next.signature && target.active === next.active) {
        target.projection = next.projection;
        continue;
      }

      const previousActive = target?.active ?? false;
      const generation = (this.generations.get(entityId) ?? 0) + 1;
      this.generations.set(entityId, generation);
      const attempt = createAttempt(entityId, next.projection, generation, next.active);
      if (!target) {
        target = {
          entityId,
          projection: next.projection,
          signature: next.signature,
          generation,
          active: next.active,
          current: attempt,
          attempts: [attempt],
          staleAttachCount: 0,
          staleCompletionCount: 0,
          diagnosticCount: 0,
        };
        this.targets.set(entityId, target);
        added.push(entityId);
      } else {
        target.projection = next.projection;
        target.signature = next.signature;
        target.generation = generation;
        target.active = next.active;
        target.current = attempt;
        target.attempts.push(attempt);
        this.pruneTargetAttempts(target);
        updated.push(entityId);
      }
      if (!previousActive && next.active) activated.push(entityId);
      if (previousActive && !next.active) deactivated.push(entityId);
      if (next.active) this.attachCurrent(target, next, bindingsStarted);
    }

    const result = freezeReconcileResult({
      added,
      updated,
      removed,
      activated,
      deactivated,
      bindingsStarted,
      bindingsRetired,
    });
    if (reconcileChanged(result)) this.invalidate('scene-images:reconcile');
    return result;
  }

  /** Waits only currently issued asset settlements; controlled requests may intentionally block it. */
  public async settle(): Promise<void> {
    this.assertAlive();
    while (this.pendingSettlements.size > 0) {
      await Promise.all([...this.pendingSettlements]);
    }
    await this.waitForCleanupChain();
    this.throwLifecycleFailures();
  }

  /** Waits selected semantic bindings without blocking on unrelated controlled requests. */
  public async settleBindings(bindingKeys: readonly string[]): Promise<void> {
    this.assertAlive();
    const bindings = bindingKeys.map((key) => {
      const binding = this.bindings.get(key);
      if (!binding) throw new Error(`Unknown scene image binding: ${key}`);
      return binding;
    });
    const settlements = bindings.map(({ settlement }) => settlement)
      .filter((value): value is Promise<void> => value !== null && value !== undefined);
    await Promise.all(settlements);
    await this.waitForCleanupChain();
    this.throwLifecycleFailures();
  }

  /**
   * Call after Pixi has rendered replacement Sprites. It never confirms a
   * frame itself, so the Core cannot unload a still-referenced texture early.
   */
  public finalizeAfterRenderedFrame(): Promise<void> {
    this.assertAlive();
    const releaseBatch = [...this.pendingFrameReleases];
    if (releaseBatch.length === 0) return Promise.resolve();
    const finalization = (async (): Promise<void> => {
      while (this.pendingReleases.size > 0) {
        await Promise.all([...this.pendingReleases]);
      }
      if (this.lifecycleFailures.length > 0) return;
      await this.renderer.finalizeAssetUnloads();
      for (const binding of releaseBatch) this.pendingFrameReleases.delete(binding);
    })().catch((error: unknown) => {
      this.lifecycleFailures.push(error);
    });
    this.pendingFinalizations.add(finalization);
    void finalization.finally(() => this.pendingFinalizations.delete(finalization));
    return finalization;
  }

  public imageProbe(entityId: string): CoreV2SceneImageProductProbe | null {
    const target = this.targets.get(entityId);
    return target ? this.projectTarget(target) : null;
  }

  public probe(): CoreV2SceneImagesProbe {
    const images: Record<string, CoreV2SceneImageProductProbe> = Object.create(null) as Record<
      string,
      CoreV2SceneImageProductProbe
    >;
    let activeTargetCount = 0;
    let staleAttachCount = 0;
    let staleCompletionCount = 0;
    for (const entityId of [...this.targets.keys()].sort()) {
      const target = this.targets.get(entityId)!;
      if (target.active) activeTargetCount += 1;
      const probe = this.projectTarget(target);
      images[entityId] = probe;
      staleAttachCount += probe.staleAttachCount;
      staleCompletionCount += probe.staleCompletionCount;
    }
    const pendingReleaseCount = this.pendingFrameReleases.size;
    const pendingSettlementCount = this.pendingSettlements.size;
    const diagnostics = Object.freeze([...this.diagnosticsValue]);
    return Object.freeze({
      destroyed: this.destroyedValue,
      targetCount: this.targets.size,
      activeTargetCount,
      bindingCount: this.bindings.size,
      pendingBindingCount: [...this.bindings.values()].filter(
        ({ resourceState }) => resourceState === 'pending',
      ).length,
      pendingSettlementCount,
      pendingReleaseCount,
      diagnosticCount: diagnostics.length,
      staleAttachCount,
      staleCompletionCount,
      images: Object.freeze(images),
      diagnostics,
      abandonedRequests: Object.freeze({
        pendingSettlementCount,
        pendingReleaseCount,
        staleAttachmentCount: staleAttachCount,
      }),
    });
  }

  /** Invalidates generations without waiting for deliberately pending decoders. */
  public async destroy(): Promise<void> {
    if (this.destroyedValue) return;
    this.destroyedValue = true;
    for (const binding of [...this.bindings.values()]) {
      binding.retired = true;
      this.bindings.delete(binding.key);
      for (const attempt of binding.attempts) attempt.binding = null;
      binding.attempts.clear();
      this.trackRelease(binding, this.renderer.unbindSceneAsset(binding.key));
    }
    for (const target of this.targets.values()) {
      if (target.current.attachmentState === 'current') {
        target.current.attachmentState = target.current.resourceState === 'pending'
          ? 'stale'
          : 'unbound';
      }
      target.active = false;
      this.forgetTargetHistory(target);
    }
    await Promise.all([...this.pendingReleases]);
    await Promise.all([...this.pendingFinalizations]);
    this.targets.clear();
    this.generations.clear();
    this.diagnosticKeys.clear();
    this.diagnosticsValue.length = 0;
    this.pendingSettlements.clear();
    this.pendingFrameReleases.clear();
    this.pendingFinalizations.clear();
    this.throwLifecycleFailures();
  }

  private attachCurrent(
    target: ImageTarget,
    desired: DesiredImage,
    bindingsStarted: string[],
  ): void {
    let binding = this.bindings.get(desired.projection.bindingKey);
    if (binding && binding.requestSignature !== desired.requestSignature) {
      throw new TypeError(`image binding key collision: ${desired.projection.bindingKey}`);
    }
    if (!binding) {
      binding = {
        key: desired.projection.bindingKey,
        request: desired.request,
        requestSignature: desired.requestSignature,
        consumers: new Map(),
        attempts: new Set(),
        retired: false,
        resourceState: 'pending',
        observation: null,
        rendererGeneration: null,
        settlement: null,
      };
      this.bindings.set(binding.key, binding);
      bindingsStarted.push(binding.key);
      this.startBinding(binding);
    }
    binding.consumers.set(target.entityId, target.generation);
    binding.attempts.add(target.current);
    target.current.binding = binding;
    const rendererProbe = this.renderer.sceneAssetBindingProbe(binding.key);
    binding.rendererGeneration = rendererProbe?.generation ?? binding.rendererGeneration;
    target.current.rendererGeneration = binding.rendererGeneration;
    if (binding.observation) {
      this.applyBindingOutcome(binding, target.current);
      binding.attempts.delete(target.current);
      target.current.binding = null;
    }
  }

  private detachCurrent(
    target: ImageTarget,
    bindingsRetired: string[],
    reservedBindings: ReadonlyMap<string, string>,
  ): void {
    const attempt = target.current;
    const rendererProbe = target.active
      ? this.renderer.sceneImageProbe(target.entityId)
      : null;
    target.staleAttachCount = Math.max(
      target.staleAttachCount,
      rendererProbe?.staleAttachCount ?? 0,
    );
    if (attempt.attachmentState === 'current') {
      attempt.attachmentState = attempt.resourceState === 'pending' ? 'stale' : 'unbound';
    }
    if (!target.active) return;
    const binding = this.bindings.get(attempt.bindingKey);
    if (!binding) return;
    binding.consumers.delete(target.entityId);
    if (binding.consumers.size > 0) return;
    if (reservedBindings.get(binding.key) === binding.requestSignature) return;
    binding.retired = true;
    this.bindings.delete(binding.key);
    bindingsRetired.push(binding.key);
    this.trackRelease(binding, this.renderer.unbindSceneAsset(binding.key));
  }

  private startBinding(binding: ImageBinding): void {
    let completion: Promise<LeafAssetBindingObservation>;
    try {
      completion = this.renderer.bindSceneAsset(binding.key, binding.request);
    } catch (error) {
      completion = Promise.reject(asError(error));
    }
    const rendererProbe = this.renderer.sceneAssetBindingProbe(binding.key);
    binding.rendererGeneration = rendererProbe?.generation ?? null;
    const settlement = completion.then(
      (observation) => this.settleBinding(binding, observation),
      (error: unknown) => this.rejectBinding(binding, error),
    );
    binding.settlement = settlement;
    this.pendingSettlements.add(settlement);
    void settlement.finally(() => this.pendingSettlements.delete(settlement));
  }

  private settleBinding(
    binding: ImageBinding,
    observation: LeafAssetBindingObservation,
  ): void {
    binding.observation = observation;
    binding.rendererGeneration = observation.generation;
    const probe = this.renderer.sceneAssetBindingProbe(binding.key);
    binding.resourceState = observation.normalizedResourceIdentity !== null
      ? 'resolved'
      : probe?.state === 'resolved'
        ? 'resolved'
        : 'failed';
    const attempts = [...binding.attempts];
    binding.attempts.clear();
    for (const attempt of attempts) {
      attempt.binding = null;
      this.applyBindingOutcome(binding, attempt, probe);
    }
    if (!binding.retired && this.bindings.get(binding.key) === binding) {
      this.invalidate(`scene-image:${binding.key}:${binding.resourceState}`);
    }
  }

  private rejectBinding(binding: ImageBinding, error: unknown): void {
    binding.resourceState = 'failed';
    const attempts = [...binding.attempts];
    binding.attempts.clear();
    for (const attempt of attempts) {
      attempt.binding = null;
      this.applyBindingOutcome(binding, attempt);
    }
    this.lifecycleFailures.push(error);
    if (!binding.retired && this.bindings.get(binding.key) === binding) {
      this.invalidate(`scene-image:${binding.key}:failed`);
    }
  }

  private applyBindingOutcome(
    binding: ImageBinding,
    attempt: ImageAttempt,
    suppliedProbe: LeafAssetBindingProbe | null = this.renderer.sceneAssetBindingProbe(binding.key),
  ): void {
    const observation = binding.observation;
    attempt.rendererGeneration = observation?.generation ?? suppliedProbe?.generation ?? null;
    attempt.cacheIdentity = observation?.cacheIdentity ?? suppliedProbe?.cacheIdentity ?? null;
    attempt.normalizedResourceIdentity = observation?.normalizedResourceIdentity ??
      suppliedProbe?.normalizedResourceIdentity ??
      null;
    attempt.naturalSize = normalizeNaturalSize(
      observation?.naturalSize ?? suppliedProbe?.naturalSize ?? null,
    );
    attempt.reusedResolvedResource = observation?.reusedResolvedResource ??
      suppliedProbe?.reusedResolvedResource ??
      false;
    attempt.resourceState = binding.resourceState;

    const target = this.targets.get(attempt.entityId);
    const current = target !== undefined &&
      target.current === attempt &&
      target.active &&
      this.bindings.get(binding.key) === binding &&
      !binding.retired &&
      observation?.status !== 'stale';
    attempt.attachmentState = current ? 'current' : 'stale';
    if (!current) this.recordStaleCompletion(target, attempt);

    if (current && binding.resourceState === 'failed' && target) {
      this.recordFailureDiagnostic(target, attempt);
    }
    if (
      current &&
      target &&
      binding.resourceState === 'resolved' &&
      attempt.dimensionMode === 'intrinsic' &&
      attempt.naturalSize !== null &&
      !attempt.intrinsicSizePublished
    ) {
      attempt.intrinsicSizePublished = true;
      try {
        this.options.onIntrinsicSize?.(Object.freeze({
          entityId: target.entityId,
          bindingKey: attempt.bindingKey,
          generation: attempt.generation,
          naturalSize: attempt.naturalSize,
        }));
      } catch (error) {
        this.lifecycleFailures.push(error);
      }
    }
    if (current && target) {
      const imageProbe = this.renderer.sceneImageProbe(target.entityId);
      target.staleAttachCount = Math.max(
        target.staleAttachCount,
        imageProbe?.staleAttachCount ?? 0,
      );
    }
  }

  private recordStaleCompletion(target: ImageTarget | undefined, attempt: ImageAttempt): void {
    if (attempt.staleCompletionRecorded) return;
    attempt.staleCompletionRecorded = true;
    if (target) target.staleCompletionCount += 1;
  }

  private recordFailureDiagnostic(target: ImageTarget, attempt: ImageAttempt): void {
    const key = diagnosticKey(target.entityId, attempt.generation);
    if (this.diagnosticKeys.has(key)) return;
    this.diagnosticKeys.add(key);
    attempt.diagnosticCount += 1;
    target.diagnosticCount += 1;
    this.diagnosticsValue.push(Object.freeze({
      level: 'warning',
      code: 'ASSET_LOAD_FAILED',
      targetId: target.entityId,
      bindingKey: attempt.bindingKey,
      generation: attempt.generation,
      message: `Image asset failed for ${target.entityId}`,
    }));
  }

  private projectTarget(target: ImageTarget): CoreV2SceneImageProductProbe {
    const current = target.current;
    const bindingProbe = target.active
      ? this.renderer.sceneAssetBindingProbe(current.bindingKey)
      : null;
    const imageProbe = this.renderer.sceneImageProbe(target.entityId);
    const attempts = Object.freeze(target.attempts.map(freezeAttemptProbe));
    const staleAttachCount = Math.max(
      target.staleAttachCount,
      imageProbe?.staleAttachCount ?? 0,
    );
    return Object.freeze({
      entityId: target.entityId,
      active: target.active,
      generation: target.generation,
      authoredSource: current.authoredSource,
      sourceKind: current.sourceKind,
      dimensionMode: current.dimensionMode,
      bindingKey: current.bindingKey,
      sourceCacheIdentity: current.sourceCacheIdentity,
      state: current.resourceState,
      attachmentState: current.attachmentState,
      cacheIdentity: current.cacheIdentity ?? bindingProbe?.cacheIdentity ?? null,
      normalizedResourceIdentity: current.normalizedResourceIdentity ??
        bindingProbe?.normalizedResourceIdentity ??
        null,
      naturalSize: current.naturalSize ?? normalizeNaturalSize(bindingProbe?.naturalSize ?? null),
      reusedResolvedResource: current.reusedResolvedResource ||
        (bindingProbe?.reusedResolvedResource ?? false),
      renderObjectCount: imageProbe?.renderObjectCount ?? 0,
      role: imageProbe?.role ?? 'none',
      rendererGeneration: current.rendererGeneration ?? bindingProbe?.generation ?? null,
      staleAttachCount,
      staleCompletionCount: target.staleCompletionCount,
      diagnosticCount: target.diagnosticCount,
      attempts,
    });
  }

  private trackRelease(binding: ImageBinding, operation: Promise<boolean>): void {
    this.pendingFrameReleases.add(binding);
    const tracked = operation.then(
      () => undefined,
      (error: unknown) => {
        this.lifecycleFailures.push(error);
      },
    );
    this.pendingReleases.add(tracked);
    void tracked.finally(() => this.pendingReleases.delete(tracked));
  }

  private pruneTargetAttempts(target: ImageTarget): void {
    const excess = target.attempts.length - CORE_V2_SCENE_IMAGE_ATTEMPT_LIMIT;
    if (excess <= 0) return;
    // `attempts[0]` is the public initial source record. Retain it and bound
    // only the rolling recent history so churn cannot silently rewrite initial.
    for (const attempt of target.attempts.splice(1, excess)) {
      this.forgetAttempt(target, attempt);
    }
  }

  private forgetTargetHistory(target: ImageTarget): void {
    this.generations.delete(target.entityId);
    for (const attempt of target.attempts) this.forgetAttempt(target, attempt);
    target.attempts.length = 0;
  }

  private forgetAttempt(target: ImageTarget, attempt: ImageAttempt): void {
    attempt.binding?.attempts.delete(attempt);
    attempt.binding = null;
    this.forgetAttemptDiagnostic(target, attempt);
  }

  private forgetAttemptDiagnostic(target: ImageTarget, attempt: ImageAttempt): void {
    const key = diagnosticKey(target.entityId, attempt.generation);
    if (!this.diagnosticKeys.delete(key)) return;
    target.diagnosticCount = Math.max(0, target.diagnosticCount - attempt.diagnosticCount);
    const index = this.diagnosticsValue.findIndex(
      (diagnostic) => diagnostic.targetId === target.entityId &&
        diagnostic.generation === attempt.generation,
    );
    if (index >= 0) this.diagnosticsValue.splice(index, 1);
  }

  private throwLifecycleFailures(): void {
    if (this.lifecycleFailures.length === 0) return;
    const failures = this.lifecycleFailures.splice(0);
    throw new AggregateError(failures, 'Core v2 scene image lifecycle failed');
  }

  private async waitForCleanupChain(): Promise<void> {
    while (this.pendingReleases.size > 0 || this.pendingFinalizations.size > 0) {
      await Promise.all([
        ...this.pendingReleases,
        ...this.pendingFinalizations,
      ]);
    }
  }

  private invalidate(reason: string): void {
    if (!this.destroyedValue) this.options.onInvalidate?.(reason);
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('CoreV2SceneImageController is destroyed');
  }
}

function normalizeDesiredImages(
  index: CoreV2ProjectionIndex,
  activeEntityIds: ReadonlySet<string> | undefined,
): ReadonlyMap<string, DesiredImage> {
  const result = new Map<string, DesiredImage>();
  const bindingSignatures = new Map<string, string>();
  const images = index.imagesByEntityId ?? {};
  for (const entityId of Object.keys(images).sort()) {
    const projection = cloneProjection(entityId, images[entityId]!);
    const request = requestFor(projection);
    const requestSignature = stableSerialize(request);
    const previous = bindingSignatures.get(projection.bindingKey);
    if (previous !== undefined && previous !== requestSignature) {
      throw new TypeError(`image binding key collision: ${projection.bindingKey}`);
    }
    bindingSignatures.set(projection.bindingKey, requestSignature);
    const active = activeEntityIds?.has(entityId) ?? true;
    result.set(entityId, Object.freeze({
      projection,
      request,
      requestSignature,
      signature: [
        projection.bindingKey,
        requestSignature,
        projection.dimensionMode,
        projection.authoredSize ? 'authored-size' : 'derived-size',
      ].join('|'),
      active,
    }));
  }
  return result;
}

function desiredActiveBindingSignatures(
  desired: ReadonlyMap<string, DesiredImage>,
): ReadonlyMap<string, string> {
  const signatures = new Map<string, string>();
  for (const image of desired.values()) {
    if (image.active) signatures.set(image.projection.bindingKey, image.requestSignature);
  }
  return signatures;
}

function cloneProjection(entityId: string, value: CoreV2ImageProjection): CoreV2ImageProjection {
  if (value.entityId !== entityId) throw new TypeError(`image projection identity mismatch: ${entityId}`);
  const bindingKey = nonempty(value.bindingKey, 'image binding key');
  const cacheIdentity = nonempty(value.cacheIdentity, 'image cache identity');
  const authoredSource = value.sourceKind === 'descriptor'
    ? normalizeCoreV2AssetDescriptor(value.authoredSource)
    : nonemptyStringSource(value.authoredSource, value.sourceKind);
  return Object.freeze({
    entityId,
    authoredSource,
    bindingKey,
    cacheIdentity,
    sourceKind: value.sourceKind,
    authoredSize: value.authoredSize,
    dimensionMode: value.dimensionMode,
  });
}

function nonemptyStringSource(
  source: CoreV2AssetSource,
  kind: Exclude<CoreV2ImageSourceKind, 'descriptor'>,
): string {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError(`${kind} image source must be a non-empty string`);
  }
  return source;
}

function requestFor(projection: CoreV2ImageProjection): LeafAssetBindingRequest {
  if (projection.sourceKind === 'alias') {
    if (typeof projection.authoredSource !== 'string') {
      throw new TypeError('alias image source must be a string');
    }
    return Object.freeze({ kind: 'alias', alias: projection.authoredSource });
  }
  return Object.freeze({ kind: 'source', source: projection.authoredSource });
}

function createAttempt(
  entityId: string,
  projection: CoreV2ImageProjection,
  generation: number,
  active: boolean,
): ImageAttempt {
  return {
    entityId,
    generation,
    bindingKey: projection.bindingKey,
    authoredSource: projection.authoredSource,
    sourceKind: projection.sourceKind,
    dimensionMode: projection.dimensionMode,
    sourceCacheIdentity: projection.cacheIdentity,
    resourceState: active ? 'pending' : 'absent',
    attachmentState: active ? 'current' : 'unbound',
    rendererGeneration: null,
    cacheIdentity: null,
    normalizedResourceIdentity: null,
    naturalSize: null,
    reusedResolvedResource: false,
    diagnosticCount: 0,
    staleCompletionRecorded: false,
    intrinsicSizePublished: false,
    binding: null,
  };
}

function freezeAttemptProbe(attempt: ImageAttempt): CoreV2SceneImageAttemptProbe {
  return Object.freeze({
    generation: attempt.generation,
    bindingKey: attempt.bindingKey,
    authoredSource: attempt.authoredSource,
    sourceKind: attempt.sourceKind,
    dimensionMode: attempt.dimensionMode,
    sourceCacheIdentity: attempt.sourceCacheIdentity,
    resourceState: attempt.resourceState,
    attachmentState: attempt.attachmentState,
    rendererGeneration: attempt.rendererGeneration,
    cacheIdentity: attempt.cacheIdentity,
    normalizedResourceIdentity: attempt.normalizedResourceIdentity,
    naturalSize: attempt.naturalSize,
    reusedResolvedResource: attempt.reusedResolvedResource,
    diagnosticCount: attempt.diagnosticCount,
  });
}

function freezeReconcileResult(
  value: Omit<CoreV2SceneImageReconcileResult, never>,
): CoreV2SceneImageReconcileResult {
  return Object.freeze({
    added: Object.freeze(value.added),
    updated: Object.freeze(value.updated),
    removed: Object.freeze(value.removed),
    activated: Object.freeze(value.activated),
    deactivated: Object.freeze(value.deactivated),
    bindingsStarted: Object.freeze(value.bindingsStarted),
    bindingsRetired: Object.freeze(value.bindingsRetired),
  });
}

function reconcileChanged(result: CoreV2SceneImageReconcileResult): boolean {
  return result.added.length > 0 ||
    result.updated.length > 0 ||
    result.removed.length > 0 ||
    result.activated.length > 0 ||
    result.deactivated.length > 0 ||
    result.bindingsStarted.length > 0 ||
    result.bindingsRetired.length > 0;
}

function diagnosticKey(entityId: string, generation: number): string {
  return `${entityId.length}:${entityId}:${generation}`;
}

function nonempty(value: string, label: string): string {
  if (value.length === 0) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map(
    (key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  ).join(',')}}`;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function normalizeNaturalSize(
  value: readonly [number, number] | null,
): readonly [number, number] | null {
  if (
    value === null ||
    value.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    value[0] <= 0 ||
    value[1] <= 0
  ) {
    return null;
  }
  return Object.freeze([value[0], value[1]] as const);
}
