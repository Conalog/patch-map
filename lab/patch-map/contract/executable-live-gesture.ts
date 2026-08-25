import type { PatchMapEngineSurfaceFactory } from '../../../src/patch-map/engine';

import {
  PatchMapContractExecutionNotImplementedError,
  type PatchMapContractGesturePlan,
  type PatchMapContractLabMilestone,
  type PatchMapContractPublishedTuple,
} from './bridge';
import {
  resolvePatchMapExecutableDataset,
  type PatchMapExecutableCasePlan,
} from './executable-cases';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from './runtime-values';
import {
  TargetedWebGLPatchMapEngine,
  assertPatchMapExecutableSurfaceReleased,
} from './targeted-webgl-engine';

interface LiveViewportGestureEvent {
  readonly source: string;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly viewRevision: number;
}

interface LiveGestureSessionCleanup {
  phase: 'initializing' | 'live' | 'cleanup-pending';
  unbind: (() => void) | null;
  engineCleanupPending: boolean;
  hostCleanupPending: boolean;
}

interface LiveViewportGestureSession extends LiveGestureSessionCleanup {
  readonly kind: 'viewport';
  readonly actionIndex: number;
  readonly engine: TargetedWebGLPatchMapEngine;
  readonly events: LiveViewportGestureEvent[];
}

interface LivePointerGestureSession extends LiveGestureSessionCleanup {
  readonly kind: 'pointer';
  readonly actionIndex: number;
  readonly engine: TargetedWebGLPatchMapEngine;
  readonly events: Readonly<Record<string, unknown>>[];
}

type LiveGestureSession = LiveViewportGestureSession | LivePointerGestureSession;

export class PatchMapExecutableLiveGestureController {
  private session: LiveGestureSession | null = null;

  public constructor(
    private readonly casePlan: PatchMapExecutableCasePlan,
    private readonly surfaceHost: HTMLElement | undefined,
    private readonly surfaceFactory: PatchMapEngineSurfaceFactory | undefined,
  ) {}

  public async arm(
    actionIndex: number,
    publishedTuple: PatchMapContractPublishedTuple,
  ): Promise<Readonly<PatchMapContractGesturePlan>> {
    if (this.casePlan.id === 'VIE-001') {
      return this.armViewportGesture(actionIndex, publishedTuple);
    }
    if (
      this.casePlan.id === 'EVT-003'
      || this.casePlan.id === 'EVT-008'
      || this.casePlan.id === 'ACC-002'
    ) {
      return this.armPointerGesture(actionIndex, publishedTuple);
    }
    throw new PatchMapContractExecutionNotImplementedError(
      this.casePlan.id,
      'gesture execution for the current non-gesture executable slice',
    );
  }

  public async awaitMilestone(
    actionIndex: number,
    milestone: PatchMapContractLabMilestone,
  ): Promise<boolean> {
    const session = this.session;
    if (session === null) return false;

    if (session.kind === 'viewport') {
      invariant(session.actionIndex === actionIndex, 'VIE-001 live gesture action identity');
    } else {
      invariant(
        session.actionIndex === actionIndex,
        `${this.casePlan.id} live pointer action identity`,
      );
    }
    if (session.phase !== 'live') {
      invariant(
        session.phase === 'cleanup-pending',
        `${this.casePlan.id} live gesture initialization is still pending`,
      );
      invariant(
        milestone === 'released',
        `${this.casePlan.id} live gesture cleanup is pending`,
      );
      await this.release();
      return true;
    }

    if (session.kind === 'viewport') {
      if (milestone === 'settled') {
        session.engine.settleViewport();
        session.engine.publishFrame(0);
      }
    }
    if (milestone === 'released') await this.release();
    return true;
  }

  public observation(): Readonly<Record<string, unknown>> | null {
    const session = this.session;
    if (session === null || session.phase !== 'live') return null;
    return session.kind === 'viewport'
      ? this.viewportGestureObservation(session)
      : this.pointerGestureObservation(session);
  }

  public async release(): Promise<void> {
    const session = this.session;
    if (session === null) return;
    session.phase = 'cleanup-pending';

    const errors: unknown[] = [];
    if (session.unbind !== null) {
      try {
        session.unbind();
        session.unbind = null;
      } catch (error) {
        errors.push(error);
      }
    }
    if (session.engineCleanupPending) {
      try {
        await session.engine.destroy();
        session.engineCleanupPending = false;
      } catch (error) {
        errors.push(error);
      }
    }
    if (session.hostCleanupPending) {
      try {
        if (this.surfaceHost?.dataset) {
          delete this.surfaceHost.dataset.patchMapRootInputProbe;
        }
        assertPatchMapExecutableSurfaceReleased(this.surfaceHost);
        session.hostCleanupPending = false;
      } catch (error) {
        errors.push(error);
      }
    }
    if (
      session.unbind === null
      && !session.engineCleanupPending
      && !session.hostCleanupPending
    ) {
      invariant(this.session === session, `${this.casePlan.id} live gesture cleanup identity`);
      this.session = null;
    }
    if (errors.length > 0) {
      const message = session.kind === 'viewport'
        ? 'PatchMap VIE-001 live gesture cleanup failed'
        : `PatchMap ${this.casePlan.id} live pointer cleanup failed`;
      throw new AggregateError(errors, message);
    }
  }

  private async armViewportGesture(
    actionIndex: number,
    publishedTuple: PatchMapContractPublishedTuple,
  ): Promise<Readonly<PatchMapContractGesturePlan>> {
    invariant(actionIndex === 0, 'VIE-001 live gesture action index');
    invariant(this.surfaceHost !== undefined, 'VIE-001 live gesture surface host');

    if (this.session === null) {
      assertPatchMapExecutableSurfaceReleased(this.surfaceHost);
      const engine = new TargetedWebGLPatchMapEngine(this.surfaceHost, this.surfaceFactory);
      const session: LiveViewportGestureSession = {
        kind: 'viewport',
        phase: 'initializing',
        actionIndex,
        engine,
        events: [],
        unbind: null,
        engineCleanupPending: true,
        hostCleanupPending: true,
      };
      this.session = session;
      try {
        await engine.initialize({
          instanceId: `contract-${this.casePlan.id.toLowerCase()}-trusted-gesture`,
          width: 800,
          height: 600,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
          zoomLimits: [0.25, 4],
        });
        const profile = requireRecord(
          this.casePlan.fixtureProfiles['viewport-transform-matrix'],
          'VIE-001 viewport fixture profile',
        );
        const datasetRef = requiredString(
          profile.datasetRef,
          'VIE-001 viewport fixture datasetRef',
        );
        const dataset = structuredClone(resolvePatchMapExecutableDataset(datasetRef));
        engine.loadDataset(dataset, { datasetRef });
        engine.setViewport({ centerWorld: [400, 300], scale: 1 });
        engine.publishFrame(0);
        session.unbind = engine.on('viewChanged', (event) => {
          session.events.push(Object.freeze({
            source: event.source,
            centerWorld: Object.freeze([
              event.viewport.centerWorld[0],
              event.viewport.centerWorld[1],
            ] as const),
            scale: event.viewport.scale,
            viewRevision: event.revisions.viewRevision,
          }));
        });
        if (this.surfaceHost.dataset) {
          this.surfaceHost.dataset.patchMapRootInputProbe = 'true';
        }
        session.phase = 'live';
      } catch (error) {
        return this.failInitialization(session, error);
      }
    } else {
      invariant(this.session.kind === 'viewport', 'VIE-001 live gesture session kind');
      invariant(this.session.phase === 'live', 'VIE-001 live gesture cleanup pending');
    }

    return deepFreeze({
      revision: 'patch-map-contract-gesture-plan/1',
      actionIndex,
      driverId: 'trusted-pointer-wheel',
      ownerQualifiedTarget:
        `[data-testid="${this.casePlan.rootTestId}"] [data-contract-surface] `
        + 'canvas[data-patch-map-product="patch-map"]',
      cssLocalAnchors: [
        { x: 400, y: 300 },
        { x: 440, y: 280 },
      ],
      button: 0,
      modifiers: [],
      publishedTuple,
    });
  }

  private async armPointerGesture(
    actionIndex: number,
    publishedTuple: PatchMapContractPublishedTuple,
  ): Promise<Readonly<PatchMapContractGesturePlan>> {
    invariant(actionIndex === 0, `${this.casePlan.id} live pointer action index`);
    invariant(
      this.surfaceHost !== undefined,
      `${this.casePlan.id} live pointer surface host`,
    );

    if (this.session === null) {
      assertPatchMapExecutableSurfaceReleased(this.surfaceHost);
      const engine = new TargetedWebGLPatchMapEngine(this.surfaceHost, this.surfaceFactory);
      const session: LivePointerGestureSession = {
        kind: 'pointer',
        phase: 'initializing',
        actionIndex,
        engine,
        events: [],
        unbind: null,
        engineCleanupPending: true,
        hostCleanupPending: true,
      };
      this.session = session;
      try {
        await engine.initialize({
          instanceId: `contract-${this.casePlan.id.toLowerCase()}-trusted-pointer`,
          width: 800,
          height: 600,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
          zoomLimits: [0.25, 4],
        });
        const profileId = this.casePlan.id === 'ACC-002'
          ? 'logical-accessibility-tree'
          : 'input-device-and-gesture-matrix';
        const profile = requireRecord(
          this.casePlan.fixtureProfiles[profileId],
          `${this.casePlan.id} pointer fixture profile`,
        );
        const datasetRef = requiredString(
          profile.datasetRef,
          `${this.casePlan.id} pointer fixture datasetRef`,
        );
        const dataset = structuredClone(resolvePatchMapExecutableDataset(datasetRef));
        engine.loadDataset(dataset, { datasetRef });
        engine.setViewport({ centerWorld: [400, 300], scale: 1 });
        engine.publishFrame(0);
        if (this.casePlan.id === 'ACC-002') {
          engine.accessibilityTree('scene');
          engine.publishFrame(1);
        }
        session.unbind = engine.on('pointerEvent', (event) => {
          session.events.push(
            structuredClone(event) as unknown as Readonly<Record<string, unknown>>,
          );
        });
        if (this.surfaceHost.dataset) {
          this.surfaceHost.dataset.patchMapRootInputProbe = 'true';
        }
        session.phase = 'live';
      } catch (error) {
        return this.failInitialization(session, error);
      }
    } else {
      invariant(this.session.kind === 'pointer', `${this.casePlan.id} live pointer session kind`);
      invariant(
        this.session.phase === 'live',
        `${this.casePlan.id} live pointer cleanup pending`,
      );
    }

    const anchors = this.casePlan.id === 'EVT-003'
      ? [{ x: 20, y: 30 }, { x: 400, y: 400 }]
      : [{ x: 170, y: 50 }, { x: 400, y: 400 }];
    return deepFreeze({
      revision: 'patch-map-contract-gesture-plan/1',
      actionIndex,
      driverId: this.casePlan.id === 'EVT-003'
        ? 'trusted-pointer-hover-leave'
        : this.casePlan.id === 'EVT-008'
          ? 'trusted-secondary-contextmenu'
          : 'trusted-accessibility-click',
      ownerQualifiedTarget:
        `[data-testid="${this.casePlan.rootTestId}"] [data-contract-surface] `
        + 'canvas[data-patch-map-product="patch-map"]',
      cssLocalAnchors: anchors,
      button: this.casePlan.id === 'EVT-008' ? 2 : 0,
      modifiers: [],
      publishedTuple,
    });
  }

  private async failInitialization(
    session: LiveGestureSession,
    initializationError: unknown,
  ): Promise<never> {
    session.phase = 'cleanup-pending';
    try {
      await this.release();
    } catch (cleanupError) {
      const cleanupErrors: readonly unknown[] = cleanupError instanceof AggregateError
        ? cleanupError.errors as readonly unknown[]
        : [cleanupError];
      const message = session.kind === 'viewport'
        ? 'PatchMap VIE-001 live gesture initialization cleanup failed'
        : `PatchMap ${this.casePlan.id} live pointer initialization cleanup failed`;
      throw new AggregateError([initializationError, ...cleanupErrors], message);
    }
    throw initializationError;
  }

  private viewportGestureObservation(
    session: LiveViewportGestureSession,
  ): Readonly<Record<string, unknown>> {
    const { engine } = session;
    const geometry = engine.geometryProbe();
    invariant(geometry !== null, 'VIE-001 live gesture geometry');
    const target = geometry.entities.find((entity) => entity.id === 'rect-b');
    invariant(target !== undefined, 'VIE-001 live gesture target geometry');
    const point = {
      x: target.screenBounds[0] + target.screenBounds[2] / 2,
      y: target.screenBounds[1] + target.screenBounds[3] / 2,
    };
    const snapshot = engine.snapshot();
    const anchorWorld = engine.screenToWorld({ x: 400, y: 300 });
    return deepFreeze({
      $schema: 'patch-map-contract-gesture-observation/1',
      case: {
        id: this.casePlan.id,
        actionIndex: session.actionIndex,
      },
      events: structuredClone(session.events),
      viewport: structuredClone(engine.viewportProbe()),
      persistence: structuredClone(engine.viewportPersistenceProbe()),
      revisions: structuredClone(snapshot.revisions),
      ownership: structuredClone(engine.interactionOwnershipProbe()),
      anchorWorld: { x: anchorWorld.x, y: anchorWorld.y },
      transformedHit: {
        point,
        target: engine.hitTest(point),
      },
      resources: {
        canvasCount: snapshot.resources.canvasCount,
        subscriptions: snapshot.resources.subscriptions.active,
        pendingWork: snapshot.pendingWork,
      },
    });
  }

  private pointerGestureObservation(
    session: LivePointerGestureSession,
  ): Readonly<Record<string, unknown>> {
    const snapshot = session.engine.snapshot();
    return deepFreeze({
      $schema: 'patch-map-contract-pointer-input-observation/1',
      case: {
        id: this.casePlan.id,
        actionIndex: session.actionIndex,
      },
      events: structuredClone(session.events),
      pointerGesture: structuredClone(session.engine.pointerGestureProbe()),
      ownership: structuredClone(session.engine.interactionOwnershipProbe()),
      accessibility: structuredClone(session.engine.accessibilityProbe()),
      snapshot: structuredClone(session.engine.snapshot()),
      resources: {
        canvasCount: snapshot.resources.canvasCount,
        subscriptions: snapshot.resources.subscriptions.active,
        pendingWork: snapshot.pendingWork,
      },
    });
  }
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function requiredString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap executable Lab bridge: ${message}`);
}
