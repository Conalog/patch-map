import {
  PATCH_MAP_DEFAULT_VIEWPORT_POLICIES,
  PATCH_MAP_VIEWPORT_POLICIES,
  PATCH_MAP_VIEWPORT_REVISION,
  type PatchMapViewportPolicy,
} from '../viewport';
import type {
  PatchMapSerializedViewportState,
  PatchMapViewportPersistenceProbe,
  PatchMapViewportPolicyOperation,
  PatchMapViewportPolicyProbe,
  PatchMapViewportState,
  PatchMapWorldTransformInput,
  PatchMapWorldTransformState,
} from './contracts/viewport';
import { finiteTuple } from './input-contracts';
import type { PatchMapSurfaceView } from './surface-contract';

interface PatchMapViewportMotion {
  readonly velocityX: number;
  readonly velocityY: number;
}

interface PatchMapViewportTemporaryPolicies {
  readonly registry: readonly PatchMapViewportPolicy[];
  readonly enabled: readonly PatchMapViewportPolicy[];
}

export interface PatchMapViewportAuthoritySnapshot {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly zoomLimits: readonly [number, number];
  readonly world: PatchMapWorldTransformState;
  readonly viewport: PatchMapViewportState;
  readonly motionActive: boolean;
  readonly enabledPolicies: readonly PatchMapViewportPolicy[];
}

export type PatchMapViewportViewEffect =
  | Readonly<{
      readonly changed: boolean;
      readonly previous: PatchMapViewportState;
      readonly viewport: PatchMapViewportState;
      readonly surfaceAlreadyApplied: false;
      readonly surfaceView: PatchMapSurfaceView;
    }>
  | Readonly<{
      readonly changed: boolean;
      readonly previous: PatchMapViewportState;
      readonly viewport: PatchMapViewportState;
      readonly surfaceAlreadyApplied: true;
      readonly surfaceView: null;
    }>;

export interface PatchMapViewportResizeEffect {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly viewport: PatchMapViewportState;
  readonly surfaceView: PatchMapSurfaceView;
}

export interface PatchMapViewportWorldEffect {
  readonly changed: boolean;
  readonly world: PatchMapWorldTransformState;
  readonly surfaceView: PatchMapSurfaceView;
}

export interface PatchMapViewportPolicyEffect {
  readonly enabledPolicies: readonly PatchMapViewportPolicy[];
  readonly cancelGestures: boolean;
  readonly registry: readonly PatchMapViewportPolicy[];
  readonly enabled: readonly PatchMapViewportPolicy[];
  readonly temporary: PatchMapViewportTemporaryPolicies | null;
  readonly motion: PatchMapViewportMotion | null;
}

export type PatchMapViewportMotionEffect =
  | Readonly<{
      readonly blocked: true;
      readonly displacementCss: null;
      readonly motion: null;
    }>
  | Readonly<{
      readonly blocked: false;
      readonly displacementCss: readonly [number, number];
      readonly motion: PatchMapViewportMotion | null;
    }>;

export interface PatchMapViewportResizeProbe {
  readonly pointerTransformRevision: number;
  readonly resizePolicyApplicationCount: number;
  readonly blackFrameCount: number;
  readonly pendingResizeFrame: boolean;
}

export class PatchMapViewportAuthority {
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private centerWorld: readonly [number, number] = Object.freeze([0, 0]);
  private scale = 1;
  private zoomLimits: readonly [number, number] = Object.freeze([0.01, 100]);
  private world: PatchMapWorldTransformState = Object.freeze({
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  private policyRegistry: readonly PatchMapViewportPolicy[] =
    PATCH_MAP_DEFAULT_VIEWPORT_POLICIES;
  private policyEnabled: readonly PatchMapViewportPolicy[] =
    PATCH_MAP_DEFAULT_VIEWPORT_POLICIES;
  private temporaryPolicies: PatchMapViewportTemporaryPolicies | null = null;
  private motion: PatchMapViewportMotion | null = null;
  private lastSettledKey: string | null = null;
  private lastSerializedKey: string | null = null;
  private lastSerialized: PatchMapSerializedViewportState | null = null;
  private settledPublicationCount = 0;
  private persistenceWriteCount = 0;
  private suppressedEquivalentSaveCount = 0;
  private pointerTransformRevision = 0;
  private resizePolicyApplicationCount = 0;
  private blackFrameCount = 0;
  private resizePendingFrame = false;
  private destroyed = false;
  private snapshotValue: PatchMapViewportAuthoritySnapshot | null = null;

  public initialize(input: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    readonly zoomLimits: readonly [number, number];
    readonly viewRevision: number;
  }>): PatchMapViewportAuthoritySnapshot {
    this.width = input.width;
    this.height = input.height;
    this.pixelRatio = input.pixelRatio;
    this.centerWorld = Object.freeze([input.width / 2, input.height / 2]);
    this.scale = 1;
    this.zoomLimits = normalizeZoomLimits(input.zoomLimits);
    this.world = Object.freeze({
      rotationDegrees: 0,
      flipX: false,
      flipY: false,
    });
    this.policyRegistry = PATCH_MAP_DEFAULT_VIEWPORT_POLICIES;
    this.policyEnabled = PATCH_MAP_DEFAULT_VIEWPORT_POLICIES;
    this.temporaryPolicies = null;
    this.motion = null;
    this.lastSettledKey = null;
    this.lastSerializedKey = null;
    this.lastSerialized = null;
    this.settledPublicationCount = 0;
    this.persistenceWriteCount = 0;
    this.suppressedEquivalentSaveCount = 0;
    this.pointerTransformRevision = input.viewRevision;
    this.resizePolicyApplicationCount = 0;
    this.blackFrameCount = 0;
    this.resizePendingFrame = false;
    this.destroyed = false;
    this.snapshotValue = null;
    return this.snapshot();
  }

  public snapshot(): PatchMapViewportAuthoritySnapshot {
    if (this.snapshotValue !== null) return this.snapshotValue;
    this.snapshotValue = Object.freeze({
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      centerWorld: this.centerWorld,
      scale: this.scale,
      zoomLimits: this.zoomLimits,
      world: this.world,
      viewport: this.viewportState(),
      motionActive: this.motion !== null,
      enabledPolicies: this.orderedEnabledPolicies(),
    });
    return this.snapshotValue;
  }

  public get motionActive(): boolean {
    return this.motion !== null;
  }

  public get resizeFramePending(): boolean {
    return this.resizePendingFrame;
  }

  public planView(
    centerWorldValue: readonly [number, number],
    scale: number,
  ): PatchMapViewportViewEffect {
    return this.planViewEffect(centerWorldValue, scale, false);
  }

  /**
   * Accept a view already applied by the root interaction surface without
   * rebuilding the equivalent Pixi transform on the pointer hot path.
   */
  public planSurfaceAppliedView(
    centerWorldValue: readonly [number, number],
    scale: number,
  ): PatchMapViewportViewEffect {
    return this.planViewEffect(centerWorldValue, scale, true);
  }

  private planViewEffect(
    centerWorldValue: readonly [number, number],
    scale: number,
    surfaceAlreadyApplied: boolean,
  ): PatchMapViewportViewEffect {
    const centerWorld = finiteTuple(centerWorldValue, 'centerWorld');
    if (
      !Number.isFinite(scale) ||
      scale < this.zoomLimits[0] ||
      scale > this.zoomLimits[1]
    ) {
      throw new RangeError('scale must be within the configured zoom limits');
    }
    const previous = this.snapshot().viewport;
    const changed =
      centerWorld[0] !== this.centerWorld[0] ||
      centerWorld[1] !== this.centerWorld[1] ||
      scale !== this.scale;
    const viewport = changed
      ? Object.freeze({
          centerWorld,
          scale,
          screenBounds: previous.screenBounds,
        })
      : previous;
    return surfaceAlreadyApplied
      ? Object.freeze({
          changed,
          previous,
          viewport,
          surfaceAlreadyApplied: true,
          surfaceView: null,
        })
      : Object.freeze({
          changed,
          previous,
          viewport,
          surfaceAlreadyApplied: false,
          surfaceView: this.surfaceView(this.world, centerWorld, scale),
        });
  }

  public commitView(
    effect: PatchMapViewportViewEffect,
    viewRevision: number,
  ): void {
    if (!effect.changed) return;
    this.centerWorld = effect.viewport.centerWorld;
    this.scale = effect.viewport.scale;
    this.pointerTransformRevision = viewRevision;
    this.snapshotValue = null;
  }

  public planResize(
    width: number,
    height: number,
    pixelRatio: number,
  ): PatchMapViewportResizeEffect {
    return Object.freeze({
      width,
      height,
      pixelRatio,
      viewport: viewportState(this.centerWorld, this.scale, width, height),
      surfaceView: this.surfaceView(
        this.world,
        this.centerWorld,
        this.scale,
        width,
        height,
      ),
    });
  }

  public commitResize(
    effect: PatchMapViewportResizeEffect,
    viewRevision: number,
  ): void {
    this.width = effect.width;
    this.height = effect.height;
    this.pixelRatio = effect.pixelRatio;
    this.pointerTransformRevision = viewRevision;
    this.resizePolicyApplicationCount += 1;
    this.resizePendingFrame = true;
    this.snapshotValue = null;
  }

  public planWorldTransform(
    input: PatchMapWorldTransformInput,
  ): PatchMapViewportWorldEffect {
    if (!Number.isFinite(input.rotationDegrees)) {
      throw new RangeError('rotationDegrees must be finite');
    }
    if (typeof input.flipX !== 'boolean' || typeof input.flipY !== 'boolean') {
      throw new TypeError('flipX and flipY must be booleans');
    }
    const rotationDegrees = Object.is(input.rotationDegrees, -0)
      ? 0
      : input.rotationDegrees;
    const world = Object.freeze({
      rotationDegrees,
      flipX: input.flipX,
      flipY: input.flipY,
    });
    const changed =
      world.rotationDegrees !== this.world.rotationDegrees ||
      world.flipX !== this.world.flipX ||
      world.flipY !== this.world.flipY;
    return Object.freeze({
      changed,
      world: changed ? world : this.world,
      surfaceView: this.surfaceView(world),
    });
  }

  public commitWorldTransform(
    effect: PatchMapViewportWorldEffect,
    viewRevision: number,
  ): void {
    if (!effect.changed) return;
    this.world = effect.world;
    this.pointerTransformRevision = viewRevision;
    this.snapshotValue = null;
  }

  public hasPolicy(policy: PatchMapViewportPolicy): boolean {
    return this.policyEnabled.includes(policy);
  }

  public planPolicy(
    operation: PatchMapViewportPolicyOperation,
  ): PatchMapViewportPolicyEffect {
    const registry = new Set(this.policyRegistry);
    const enabled = new Set(this.policyEnabled);
    let temporary = this.temporaryPolicies;
    let motion = this.motion;
    let cancelGestures = false;
    switch (operation.op) {
      case 'add':
        registry.add(normalizeViewportPolicy(operation.policy));
        enabled.add(operation.policy);
        break;
      case 'start': {
        const policy = normalizeViewportPolicy(operation.policy);
        if (!registry.has(policy)) registry.add(policy);
        enabled.add(policy);
        break;
      }
      case 'stop':
        enabled.delete(normalizeViewportPolicy(operation.policy));
        break;
      case 'remove': {
        const policy = normalizeViewportPolicy(operation.policy);
        registry.delete(policy);
        enabled.delete(policy);
        break;
      }
      case 'temporary': {
        const policy = normalizeViewportPolicy(operation.policy);
        if (temporary !== null) {
          throw new Error('a temporary viewport policy is already active');
        }
        temporary = Object.freeze({
          registry: orderedViewportPolicies(registry),
          enabled: orderedViewportPolicies(enabled),
        });
        registry.add(policy);
        enabled.add(policy);
        break;
      }
      case 'restore-temporary':
        if (temporary !== null) {
          replacePolicySet(registry, temporary.registry);
          replacePolicySet(enabled, temporary.enabled);
          temporary = null;
        }
        break;
      case 'cancel-all':
        motion = null;
        cancelGestures = true;
        break;
      case 'redraw':
        break;
    }
    return Object.freeze({
      enabledPolicies: orderedViewportPolicies(enabled),
      cancelGestures,
      registry: orderedViewportPolicies(registry),
      enabled: orderedViewportPolicies(enabled),
      temporary,
      motion,
    });
  }

  public commitPolicy(effect: PatchMapViewportPolicyEffect): void {
    this.policyRegistry = effect.registry;
    this.policyEnabled = effect.enabled;
    this.temporaryPolicies = effect.temporary;
    this.motion = effect.motion;
    this.snapshotValue = null;
  }

  public policyProbe(destroyed = this.destroyed): PatchMapViewportPolicyProbe {
    const registry = destroyed
      ? Object.freeze([] as PatchMapViewportPolicy[])
      : this.policyRegistry;
    const enabled = destroyed
      ? Object.freeze([] as PatchMapViewportPolicy[])
      : this.policyEnabled;
    const callbacks = Object.fromEntries(
      PATCH_MAP_VIEWPORT_POLICIES.map((policy) => [
        policy,
        registry.includes(policy) ? 1 : 0,
      ]),
    ) as Record<PatchMapViewportPolicy, 0 | 1>;
    return Object.freeze({
      schemaRevision: PATCH_MAP_VIEWPORT_REVISION,
      policies: registry,
      enabledPolicies: enabled,
      temporary: !destroyed && this.temporaryPolicies !== null,
      callbacksByPolicy: Object.freeze(callbacks),
      resources: Object.freeze({
        tickers: 0,
        listeners: 0,
        captures: 0,
        motions: destroyed || this.motion === null ? 0 : 1,
        cursors: 0,
      }),
      destroyed,
    });
  }

  public startMotion(velocity: readonly [number, number]): boolean {
    if (!this.policyEnabled.includes('deceleration')) return false;
    this.motion = Object.freeze({
      velocityX: velocity[0],
      velocityY: velocity[1],
    });
    this.snapshotValue = null;
    return true;
  }

  public planMotionAdvance(deltaMs: number): PatchMapViewportMotionEffect {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('viewport motion deltaMs must be finite and non-negative');
    }
    const motion = this.motion;
    if (motion === null || !this.policyEnabled.includes('deceleration')) {
      return Object.freeze({
        blocked: true,
        displacementCss: null,
        motion: null,
      });
    }
    const decay = Math.exp(-deltaMs / 120);
    const displacementScale = 120 * (1 - decay);
    const velocityX = motion.velocityX * decay;
    const velocityY = motion.velocityY * decay;
    return Object.freeze({
      blocked: false,
      displacementCss: Object.freeze([
        motion.velocityX * displacementScale,
        motion.velocityY * displacementScale,
      ] as [number, number]),
      motion: Math.hypot(velocityX, velocityY) < 0.001
        ? null
        : Object.freeze({ velocityX, velocityY }),
    });
  }

  public commitMotion(effect: PatchMapViewportMotionEffect): void {
    this.motion = effect.motion;
    this.snapshotValue = null;
  }

  public cancelMotion(): boolean {
    const changed = this.motion !== null;
    this.motion = null;
    if (changed) this.snapshotValue = null;
    return changed;
  }

  public settle(): Readonly<{
    readonly changed: boolean;
    readonly viewport: PatchMapViewportState;
    readonly publicationCount: number;
    readonly persistence: PatchMapViewportPersistenceProbe;
  }> {
    const key = viewportStateKey(this.centerWorld, this.scale);
    const changed = key !== this.lastSettledKey;
    if (changed) {
      this.lastSettledKey = key;
      this.settledPublicationCount += 1;
    }
    return Object.freeze({
      changed,
      viewport: this.viewportState(),
      publicationCount: this.settledPublicationCount,
      persistence: this.persistenceProbe(),
    });
  }

  public serialize(): PatchMapSerializedViewportState {
    const serialized = serializedViewport(this.centerWorld, this.scale);
    const key = viewportStateKey(serialized.centerWorld, serialized.scale);
    if (key === this.lastSerializedKey) {
      this.suppressedEquivalentSaveCount += 1;
      return this.lastSerialized ?? serialized;
    }
    this.lastSerializedKey = key;
    this.lastSerialized = serialized;
    this.persistenceWriteCount += 1;
    return serialized;
  }

  public persistenceProbe(): PatchMapViewportPersistenceProbe {
    return Object.freeze({
      settledPublicationCount: this.settledPublicationCount,
      persistenceWriteCount: this.persistenceWriteCount,
      equivalentSaveCount: 0,
      suppressedEquivalentSaveCount: this.suppressedEquivalentSaveCount,
      settled:
        this.lastSettledKey === viewportStateKey(this.centerWorld, this.scale),
      serialized: this.lastSerialized,
    });
  }

  public normalizeSerialized(
    input: unknown,
  ): PatchMapSerializedViewportState | null {
    return normalizeSerializedViewport(input, this.zoomLimits);
  }

  public resizeProbe(): PatchMapViewportResizeProbe {
    return Object.freeze({
      pointerTransformRevision: this.pointerTransformRevision,
      resizePolicyApplicationCount: this.resizePolicyApplicationCount,
      blackFrameCount: this.blackFrameCount,
      pendingResizeFrame: this.resizePendingFrame,
    });
  }

  public completeResizeFrame(
    hasScene: boolean,
    visiblePrimitiveCount: number | undefined,
  ): void {
    if (!this.resizePendingFrame) return;
    if (hasScene && visiblePrimitiveCount === 0) {
      this.blackFrameCount += 1;
    }
    this.resizePendingFrame = false;
  }

  public currentSurfaceView(): PatchMapSurfaceView {
    return this.surfaceView(this.world);
  }

  public orderedEnabledPolicies(): readonly PatchMapViewportPolicy[] {
    return this.policyEnabled;
  }

  public destroy(): void {
    this.policyRegistry = Object.freeze([]);
    this.policyEnabled = Object.freeze([]);
    this.temporaryPolicies = null;
    this.motion = null;
    this.resizePendingFrame = false;
    this.destroyed = true;
    this.snapshotValue = null;
  }

  private viewportState(): PatchMapViewportState {
    return viewportState(
      this.centerWorld,
      this.scale,
      this.width,
      this.height,
    );
  }

  private surfaceView(
    world: PatchMapWorldTransformInput,
    centerWorld: readonly [number, number] = this.centerWorld,
    scale: number = this.scale,
    width: number = this.width,
    height: number = this.height,
  ): PatchMapSurfaceView {
    const radians = world.rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const scaledX = centerWorld[0] * scale;
    const scaledY = centerWorld[1] * scale;
    const transformedCenterX =
      (scaledX * cosine - scaledY * sine) * (world.flipX ? -1 : 1);
    const transformedCenterY =
      (scaledX * sine + scaledY * cosine) * (world.flipY ? -1 : 1);
    return Object.freeze({
      x: width / 2 - transformedCenterX,
      y: height / 2 - transformedCenterY,
      scale,
      rotation: world.rotationDegrees,
      ...(world.flipX ? { flipX: true } : {}),
      ...(world.flipY ? { flipY: true } : {}),
    });
  }
}

function viewportState(
  centerWorld: readonly [number, number],
  scale: number,
  width: number,
  height: number,
): PatchMapViewportState {
  return Object.freeze({
    centerWorld,
    scale,
    screenBounds: Object.freeze([
      0,
      0,
      width,
      height,
    ] as [number, number, number, number]),
  });
}

function serializedViewport(
  centerWorld: readonly [number, number],
  scale: number,
): PatchMapSerializedViewportState {
  return Object.freeze({
    schemaRevision: PATCH_MAP_VIEWPORT_REVISION,
    centerWorld: Object.freeze([centerWorld[0], centerWorld[1]] as const),
    scale,
  });
}

function normalizeSerializedViewport(
  value: unknown,
  limits: readonly [number, number],
): PatchMapSerializedViewportState | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const center = record.centerWorld;
  const scale = record.scale;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    !Number.isFinite(center[0]) ||
    !Number.isFinite(center[1]) ||
    !Number.isFinite(scale) ||
    (scale as number) < limits[0] ||
    (scale as number) > limits[1]
  ) {
    return null;
  }
  return serializedViewport(
    [center[0] as number, center[1] as number],
    scale as number,
  );
}

function viewportStateKey(
  centerWorld: readonly [number, number],
  scale: number,
): string {
  return `${canonicalViewportScalar(centerWorld[0])},${canonicalViewportScalar(centerWorld[1])},${canonicalViewportScalar(scale)}`;
}

function canonicalViewportScalar(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeViewportPolicy(value: unknown): PatchMapViewportPolicy {
  if (
    typeof value !== 'string' ||
    !PATCH_MAP_VIEWPORT_POLICIES.includes(value as PatchMapViewportPolicy)
  ) {
    throw new TypeError('unsupported viewport policy');
  }
  return value as PatchMapViewportPolicy;
}

function orderedViewportPolicies(
  values: ReadonlySet<PatchMapViewportPolicy>,
): readonly PatchMapViewportPolicy[] {
  return Object.freeze(
    PATCH_MAP_VIEWPORT_POLICIES.filter((policy) => values.has(policy)),
  );
}

function replacePolicySet(
  target: Set<PatchMapViewportPolicy>,
  values: readonly PatchMapViewportPolicy[],
): void {
  target.clear();
  for (const value of values) target.add(value);
}

function normalizeZoomLimits(
  value: readonly [number, number],
): readonly [number, number] {
  const [min, max] = value;
  if (
    !(min > 0) ||
    !(max >= min) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    throw new RangeError('zoomLimits must contain positive finite min/max values');
  }
  return Object.freeze([min, max]);
}
