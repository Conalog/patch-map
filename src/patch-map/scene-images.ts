import type {
  PatchMapImageDimensionMode,
  PatchMapImageProjection,
  PatchMapImageSourceKind,
  PatchMapProjectionIndex,
} from './contracts';
import { normalizePatchMapAssetDescriptor } from './assets';
import type { PatchMapAssetSource } from './semantic/dataset';
import type {
  PatchMapSceneImageAssetBindingObservation as LeafAssetBindingObservation,
  PatchMapSceneImageAssetBindingProbe as LeafAssetBindingProbe,
  PatchMapSceneImageAssetBindingRequest as LeafAssetBindingRequest,
  PatchMapSceneImageAssetRenderRole as LeafAssetRenderRole,
  PatchMapSceneImageRendererBridge,
} from './scene-images/contracts';

export type { PatchMapSceneImageRendererBridge } from './scene-images/contracts';

export type PatchMapSceneImageResourceState =
  | 'absent'
  | 'pending'
  | 'resolved'
  | 'failed';

export type PatchMapSceneImageAttachmentState = 'current' | 'unbound' | 'stale';

export interface PatchMapSceneImageControllerOptions {
  /** Schedules one aggregate frame; never creates an entity ticker or RAF. */
  readonly onInvalidate?: (reason: string) => void;
  /** Commits decoded logical size only for the still-current intrinsic target. */
  readonly onIntrinsicSize?: (resolution: PatchMapSceneImageIntrinsicSize) => void;
}

export interface PatchMapSceneImageIntrinsicSize {
  readonly entityId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly naturalSize: readonly [number, number];
}

export interface PatchMapSceneImageReconcileOptions {
  /** Omit to acquire every image. Hidden images should be excluded by the Core. */
  readonly activeEntityIds?: ReadonlySet<string>;
}

/**
 * Opaque, single-use image ownership plan produced without touching renderer or
 * controller state. A plan is valid only for the controller and reconcile
 * revision that prepared it.
 */
export interface PatchMapSceneImageReconcilePlan {
  readonly kind: 'patch-map-scene-image-reconcile-plan';
  readonly imageCount: number;
  readonly activeImageCount: number;
}

export interface PatchMapSceneImageReconcileResult {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly activated: readonly string[];
  readonly deactivated: readonly string[];
  readonly bindingsStarted: readonly string[];
  readonly bindingsRetired: readonly string[];
}

export interface PatchMapSceneImageRetryResult {
  readonly status: 'started' | 'deduplicated' | 'unavailable';
  readonly entityId: string;
  readonly bindingKey: string | null;
  readonly generation: number;
}

export interface PatchMapSceneImageDiagnostic {
  readonly level: 'warning';
  readonly code: 'ASSET_LOAD_FAILED';
  readonly targetId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly message: string;
}

export interface PatchMapSceneImageAttemptProbe {
  readonly generation: number;
  readonly bindingKey: string;
  readonly authoredSource: PatchMapAssetSource;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly dimensionMode: PatchMapImageDimensionMode;
  readonly sourceCacheIdentity: string;
  readonly resourceState: PatchMapSceneImageResourceState;
  readonly attachmentState: PatchMapSceneImageAttachmentState;
  readonly rendererGeneration: number | null;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly diagnosticCount: number;
}

export interface PatchMapSceneImageProductProbe {
  readonly entityId: string;
  readonly active: boolean;
  readonly generation: number;
  readonly authoredSource: PatchMapAssetSource;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly dimensionMode: PatchMapImageDimensionMode;
  readonly bindingKey: string;
  readonly sourceCacheIdentity: string;
  readonly state: PatchMapSceneImageResourceState;
  readonly attachmentState: PatchMapSceneImageAttachmentState;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly publication: Readonly<{
    /** Physical Sprite facts are current only for the matching binding generation. */
    readonly rendererFacts: 'current' | 'pending';
  }>;
  readonly renderObjectCount: 0 | 1;
  readonly placeholderCount: 0 | 1;
  /** Current binding-wide semantic consumers; zero for inactive targets. */
  readonly bindingConsumerCount: number;
  readonly role: LeafAssetRenderRole;
  readonly rendererGeneration: number | null;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
  readonly diagnosticCount: number;
  readonly attempts: readonly PatchMapSceneImageAttemptProbe[];
}

export interface PatchMapSceneImagesProbe {
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
  readonly images: Readonly<Record<string, PatchMapSceneImageProductProbe>>;
  readonly diagnostics: readonly PatchMapSceneImageDiagnostic[];
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
  readonly authoredSource: PatchMapAssetSource;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly dimensionMode: PatchMapImageDimensionMode;
  readonly sourceCacheIdentity: string;
  resourceState: PatchMapSceneImageResourceState;
  attachmentState: PatchMapSceneImageAttachmentState;
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
  projection: PatchMapImageProjection;
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
  resourceState: Exclude<PatchMapSceneImageResourceState, 'absent'>;
  observation: LeafAssetBindingObservation | null;
  rendererGeneration: number | null;
  settlement: Promise<void> | null;
}

interface DesiredImage {
  readonly projection: PatchMapImageProjection;
  readonly request: LeafAssetBindingRequest;
  readonly requestSignature: string;
  readonly signature: string;
  readonly active: boolean;
}

interface PreparedReconcilePlan {
  readonly owner: PatchMapSceneImageController;
  readonly revision: number;
  readonly desired: ReadonlyMap<string, DesiredImage>;
  readonly reservedBindings: ReadonlyMap<string, string>;
  consumed: boolean;
}

const preparedReconcilePlans = new WeakMap<
  PatchMapSceneImageReconcilePlan,
  PreparedReconcilePlan
>();

const EMPTY_RECONCILE_RESULT: PatchMapSceneImageReconcileResult = Object.freeze({
  added: Object.freeze([]),
  updated: Object.freeze([]),
  removed: Object.freeze([]),
  activated: Object.freeze([]),
  deactivated: Object.freeze([]),
  bindingsStarted: Object.freeze([]),
  bindingsRetired: Object.freeze([]),
});

export const PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT = 8;

/**
 * Expected-blind scene image ownership above the Pixi leaf bridge.
 *
 * The parser projection remains the semantic authority. The bridge owns Pixi
 * textures and Sprites; this controller only owns target/binding generations,
 * diagnostic de-duplication, and the state-versus-frame release boundary.
 */
export class PatchMapSceneImageController {
  private readonly targets = new Map<string, ImageTarget>();
  private readonly bindings = new Map<string, ImageBinding>();
  private readonly generations = new Map<string, number>();
  private readonly diagnosticsValue: PatchMapSceneImageDiagnostic[] = [];
  private readonly diagnosticKeys = new Set<string>();
  private readonly pendingSettlements = new Set<Promise<void>>();
  private readonly pendingReleases = new Set<Promise<void>>();
  private readonly pendingFrameReleases = new Set<ImageBinding>();
  private readonly pendingFinalizations = new Set<Promise<void>>();
  private readonly lifecycleFailures: unknown[] = [];
  private reconcileRevision = 0;
  private destroyedValue = false;

  public constructor(
    private readonly renderer: PatchMapSceneImageRendererBridge,
    private readonly options: PatchMapSceneImageControllerOptions = {},
  ) {}

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  /**
   * Normalizes and collision-validates the next parser sidecar without reading
   * renderer probes or mutating target, binding, generation, or attempt state.
   */
  public prepareReconcile(
    index: PatchMapProjectionIndex,
    options: PatchMapSceneImageReconcileOptions = {},
  ): PatchMapSceneImageReconcilePlan {
    this.assertAlive();
    const desired = normalizeDesiredImages(index, options.activeEntityIds);
    assertPreparedBindingCompatibility(desired, this.targets, this.bindings);
    const plan = Object.freeze({
      kind: 'patch-map-scene-image-reconcile-plan' as const,
      imageCount: desired.size,
      activeImageCount: countActiveDesiredImages(desired),
    });
    preparedReconcilePlans.set(plan, {
      owner: this,
      revision: this.reconcileRevision,
      desired,
      reservedBindings: desiredActiveBindingSignatures(desired),
      consumed: false,
    });
    return plan;
  }

  /**
   * Commits one prepared ownership plan. Once validation succeeds, supported
   * renderer bind/unbind/probe failures are recorded for `settle()` rather than
   * escaping synchronously after logical ownership has started to mutate.
   */
  public commitReconcile(
    plan: PatchMapSceneImageReconcilePlan,
  ): PatchMapSceneImageReconcileResult {
    this.assertAlive();
    const prepared = preparedReconcilePlans.get(plan);
    if (!prepared || prepared.owner !== this) {
      throw new TypeError('scene image reconcile plan belongs to another controller');
    }
    if (prepared.consumed) {
      throw new TypeError('scene image reconcile plan was already committed');
    }
    if (prepared.revision !== this.reconcileRevision) {
      throw new TypeError('scene image reconcile plan is stale');
    }
    prepared.consumed = true;
    this.reconcileRevision += 1;

    const { desired, reservedBindings } = prepared;
    if (desired.size === 0 && this.targets.size === 0) return EMPTY_RECONCILE_RESULT;

    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const activated: string[] = [];
    const deactivated: string[] = [];
    const bindingsStarted: string[] = [];
    const bindingsRetired: string[] = [];

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

  /**
   * Atomically validates the next parser sidecar, then diffs target ownership.
   * Request-compatible ownership transfers reserve a binding across the diff;
   * every other old binding retires before its replacement starts.
   */
  public reconcile(
    index: PatchMapProjectionIndex,
    options: PatchMapSceneImageReconcileOptions = {},
  ): PatchMapSceneImageReconcileResult {
    return this.commitReconcile(this.prepareReconcile(index, options));
  }

  /**
   * Retry one failed logical image target. Consumers sharing the same binding
   * join one new request generation; a concurrent retry observes and reuses
   * that pending generation instead of issuing another backend request.
   */
  public retry(entityId: string): PatchMapSceneImageRetryResult {
    this.assertAlive();
    const target = this.targets.get(nonempty(entityId, 'image retry entityId'));
    if (!target || !target.active) {
      return retryResult('unavailable', entityId, null, 0);
    }
    const binding = this.bindings.get(target.current.bindingKey);
    if (!binding) {
      return retryResult(
        'unavailable',
        target.entityId,
        target.current.bindingKey,
        target.generation,
      );
    }
    if (binding.resourceState === 'pending') {
      return retryResult(
        'deduplicated',
        target.entityId,
        binding.key,
        target.generation,
      );
    }
    if (binding.resourceState !== 'failed') {
      return retryResult(
        'unavailable',
        target.entityId,
        binding.key,
        target.generation,
      );
    }

    this.reconcileRevision += 1;
    binding.resourceState = 'pending';
    binding.observation = null;
    binding.rendererGeneration = null;
    binding.settlement = null;
    for (const consumerId of [...binding.consumers.keys()].sort()) {
      const consumer = this.targets.get(consumerId);
      if (
        !consumer ||
        !consumer.active ||
        consumer.current.bindingKey !== binding.key
      ) {
        binding.consumers.delete(consumerId);
        continue;
      }
      const generation = (this.generations.get(consumerId) ?? consumer.generation) + 1;
      this.generations.set(consumerId, generation);
      const attempt = createAttempt(consumerId, consumer.projection, generation, true);
      consumer.generation = generation;
      consumer.current = attempt;
      consumer.attempts.push(attempt);
      this.pruneTargetAttempts(consumer);
      binding.consumers.set(consumerId, generation);
      binding.attempts.add(attempt);
      attempt.binding = binding;
    }
    this.startBinding(binding);
    this.invalidate(`scene-image:${binding.key}:retry`);
    return retryResult(
      'started',
      target.entityId,
      binding.key,
      this.targets.get(target.entityId)?.generation ?? target.generation,
    );
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

  public imageProbe(
    entityId: string,
    rendererFactsPublished = true,
  ): PatchMapSceneImageProductProbe | null {
    const target = this.targets.get(entityId);
    return target ? this.projectTarget(target, rendererFactsPublished) : null;
  }

  public probe(rendererFactsPublished = true): PatchMapSceneImagesProbe {
    const images: Record<string, PatchMapSceneImageProductProbe> = Object.create(null) as Record<
      string,
      PatchMapSceneImageProductProbe
    >;
    let activeTargetCount = 0;
    let staleAttachCount = 0;
    let staleCompletionCount = 0;
    for (const entityId of [...this.targets.keys()].sort()) {
      const target = this.targets.get(entityId)!;
      if (target.active) activeTargetCount += 1;
      const probe = this.projectTarget(target, rendererFactsPublished);
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
      this.startBinding(binding, true);
    }
    binding.consumers.set(target.entityId, target.generation);
    binding.attempts.add(target.current);
    target.current.binding = binding;
    const rendererProbe = this.safeBindingProbe(binding.key);
    binding.rendererGeneration = rendererProbe?.generation ?? binding.rendererGeneration;
    target.current.rendererGeneration = binding.rendererGeneration;
    if (binding.observation) {
      this.applyBindingOutcome(binding, target.current, undefined, true);
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
      ? this.safeLeafImageProbe(target.entityId)
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
    this.trackRelease(binding, this.safeUnbindSceneAsset(binding.key));
  }

  private startBinding(binding: ImageBinding, bridgeFailuresAreLifecycle = false): void {
    const completion = this.bindSceneAsset(binding.key, binding.request);
    const rendererProbe = bridgeFailuresAreLifecycle
      ? this.safeBindingProbe(binding.key)
      : this.renderer.sceneAssetBindingProbe(binding.key);
    binding.rendererGeneration = rendererProbe?.generation ?? null;
    const outcome = completion.then(
      (observation) => this.settleBinding(binding, observation, bridgeFailuresAreLifecycle),
      (error: unknown) => this.rejectBinding(binding, error, bridgeFailuresAreLifecycle),
    );
    const settlement = bridgeFailuresAreLifecycle
      ? outcome.catch((error: unknown) => {
        this.lifecycleFailures.push(error);
        if (!binding.retired && this.bindings.get(binding.key) === binding) {
          binding.resourceState = 'failed';
          this.invalidate(`scene-image:${binding.key}:failed`);
        }
      })
      : outcome;
    binding.settlement = settlement;
    this.pendingSettlements.add(settlement);
    void settlement.finally(() => this.pendingSettlements.delete(settlement));
  }

  private settleBinding(
    binding: ImageBinding,
    observation: LeafAssetBindingObservation,
    bridgeFailuresAreLifecycle: boolean,
  ): void {
    binding.observation = observation;
    binding.rendererGeneration = observation.generation;
    const probe = bridgeFailuresAreLifecycle
      ? this.safeBindingProbe(binding.key)
      : this.renderer.sceneAssetBindingProbe(binding.key);
    binding.resourceState = observation.normalizedResourceIdentity !== null
      ? 'resolved'
      : probe?.state === 'resolved'
        ? 'resolved'
        : 'failed';
    const attempts = [...binding.attempts];
    binding.attempts.clear();
    for (const attempt of attempts) {
      attempt.binding = null;
      this.applyBindingOutcome(binding, attempt, probe, bridgeFailuresAreLifecycle);
    }
    if (!binding.retired && this.bindings.get(binding.key) === binding) {
      this.invalidate(`scene-image:${binding.key}:${binding.resourceState}`);
    }
  }

  private rejectBinding(
    binding: ImageBinding,
    error: unknown,
    bridgeFailuresAreLifecycle: boolean,
  ): void {
    binding.resourceState = 'failed';
    const attempts = [...binding.attempts];
    binding.attempts.clear();
    for (const attempt of attempts) {
      attempt.binding = null;
      this.applyBindingOutcome(binding, attempt, undefined, bridgeFailuresAreLifecycle);
    }
    this.lifecycleFailures.push(error);
    if (!binding.retired && this.bindings.get(binding.key) === binding) {
      this.invalidate(`scene-image:${binding.key}:failed`);
    }
  }

  private applyBindingOutcome(
    binding: ImageBinding,
    attempt: ImageAttempt,
    suppliedProbe?: LeafAssetBindingProbe | null,
    bridgeFailuresAreLifecycle = false,
  ): void {
    const rendererProbe = suppliedProbe === undefined
      ? bridgeFailuresAreLifecycle
        ? this.safeBindingProbe(binding.key)
        : this.renderer.sceneAssetBindingProbe(binding.key)
      : suppliedProbe;
    const observation = binding.observation;
    attempt.rendererGeneration = observation?.generation ?? rendererProbe?.generation ?? null;
    attempt.cacheIdentity = observation?.cacheIdentity ?? rendererProbe?.cacheIdentity ?? null;
    attempt.normalizedResourceIdentity = observation?.normalizedResourceIdentity ??
      rendererProbe?.normalizedResourceIdentity ??
      null;
    attempt.naturalSize = normalizeNaturalSize(
      observation?.naturalSize ?? rendererProbe?.naturalSize ?? null,
    );
    attempt.reusedResolvedResource = observation?.reusedResolvedResource ??
      rendererProbe?.reusedResolvedResource ??
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
      const imageProbe = bridgeFailuresAreLifecycle
        ? this.safeLeafImageProbe(target.entityId)
        : this.renderer.sceneImageProbe(target.entityId);
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

  private projectTarget(
    target: ImageTarget,
    rendererFactsPublished: boolean,
  ): PatchMapSceneImageProductProbe {
    const current = target.current;
    const bindingProbe = target.active
      ? this.renderer.sceneAssetBindingProbe(current.bindingKey)
      : null;
    const imageProbe = this.renderer.sceneImageProbe(target.entityId);
    const rendererGeneration = current.rendererGeneration ?? bindingProbe?.generation ?? null;
    const rendererFactsCurrent = rendererFactsPublished && (
      !target.active || (
        imageProbe !== null &&
        imageProbe.bindingKey === current.bindingKey &&
        rendererGeneration !== null &&
        imageProbe.bindingGeneration === rendererGeneration
      )
    );
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
      publication: Object.freeze({
        rendererFacts: rendererFactsCurrent ? 'current' : 'pending',
      }),
      renderObjectCount: rendererFactsCurrent ? imageProbe?.renderObjectCount ?? 0 : 0,
      placeholderCount: rendererFactsCurrent && imageProbe?.role === 'asset-placeholder'
        ? imageProbe.renderObjectCount
        : 0,
      bindingConsumerCount: bindingProbe?.consumerCount ?? 0,
      role: rendererFactsCurrent ? imageProbe?.role ?? 'none' : 'none',
      rendererGeneration,
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

  private bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    try {
      return Promise.resolve(this.renderer.bindSceneAsset(key, request));
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  private safeUnbindSceneAsset(key: string): Promise<boolean> {
    try {
      return Promise.resolve(this.renderer.unbindSceneAsset(key));
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  private safeBindingProbe(key: string): LeafAssetBindingProbe | null {
    try {
      return this.renderer.sceneAssetBindingProbe(key);
    } catch (error) {
      this.lifecycleFailures.push(asError(error));
      return null;
    }
  }

  private safeLeafImageProbe(entityId: string): ReturnType<
    PatchMapSceneImageRendererBridge['sceneImageProbe']
  > {
    try {
      return this.renderer.sceneImageProbe(entityId);
    } catch (error) {
      this.lifecycleFailures.push(asError(error));
      return null;
    }
  }

  private pruneTargetAttempts(target: ImageTarget): void {
    const excess = target.attempts.length - PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT;
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
    throw new AggregateError(failures, 'PatchMap scene image lifecycle failed');
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
    if (this.destroyedValue) throw new Error('PatchMapSceneImageController is destroyed');
  }
}

function normalizeDesiredImages(
  index: PatchMapProjectionIndex,
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

function countActiveDesiredImages(desired: ReadonlyMap<string, DesiredImage>): number {
  let count = 0;
  for (const image of desired.values()) {
    if (image.active) count += 1;
  }
  return count;
}

/**
 * A retained binding is the only existing ownership that can survive the
 * detach pass. Validating it here keeps the commit phase free of collision
 * discovery after target mutation has started.
 */
function assertPreparedBindingCompatibility(
  desired: ReadonlyMap<string, DesiredImage>,
  targets: ReadonlyMap<string, ImageTarget>,
  bindings: ReadonlyMap<string, ImageBinding>,
): void {
  const retainedBindingSignatures = new Map<string, string>();
  for (const binding of bindings.values()) {
    for (const consumerId of binding.consumers.keys()) {
      const target = targets.get(consumerId);
      const next = desired.get(consumerId);
      if (
        target &&
        next &&
        target.signature === next.signature &&
        target.active === next.active
      ) {
        retainedBindingSignatures.set(binding.key, binding.requestSignature);
        break;
      }
    }
  }
  for (const image of desired.values()) {
    if (!image.active) continue;
    const retainedSignature = retainedBindingSignatures.get(image.projection.bindingKey);
    if (retainedSignature !== undefined && retainedSignature !== image.requestSignature) {
      throw new TypeError(`image binding key collision: ${image.projection.bindingKey}`);
    }
  }
}

function cloneProjection(entityId: string, value: PatchMapImageProjection): PatchMapImageProjection {
  if (value.entityId !== entityId) throw new TypeError(`image projection identity mismatch: ${entityId}`);
  const bindingKey = nonempty(value.bindingKey, 'image binding key');
  const cacheIdentity = nonempty(value.cacheIdentity, 'image cache identity');
  const authoredSource = value.sourceKind === 'descriptor'
    ? normalizePatchMapAssetDescriptor(value.authoredSource)
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
  source: PatchMapAssetSource,
  kind: Exclude<PatchMapImageSourceKind, 'descriptor'>,
): string {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError(`${kind} image source must be a non-empty string`);
  }
  return source;
}

function requestFor(projection: PatchMapImageProjection): LeafAssetBindingRequest {
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
  projection: PatchMapImageProjection,
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

function freezeAttemptProbe(attempt: ImageAttempt): PatchMapSceneImageAttemptProbe {
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

function retryResult(
  status: PatchMapSceneImageRetryResult['status'],
  entityId: string,
  bindingKey: string | null,
  generation: number,
): PatchMapSceneImageRetryResult {
  return Object.freeze({
    status,
    entityId,
    bindingKey,
    generation,
  });
}

function freezeReconcileResult(
  value: Omit<PatchMapSceneImageReconcileResult, never>,
): PatchMapSceneImageReconcileResult {
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

function reconcileChanged(result: PatchMapSceneImageReconcileResult): boolean {
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
