import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { PatchMapSpatialHitAuthority } from '../../src/patch-map/core/spatial-hit-authority';
import type { PatchMapBarPresentationAuthority } from '../../src/patch-map/core/bar-presentation-authority';
import {
  PatchMap,
  PatchMapError,
  PixiEngineSurface,
} from '../../src/patch-map/engine';
import {
  PatchMapPresentationController,
  PatchMapPresentationError,
} from '../../src/patch-map/presentation';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
} from '../../src/patch-map/presentation-policy';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type { PatchMapRendererEntityPresentationOverride } from '../../src/patch-map/renderers/presentation-store';
import type {
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
  RootPointerInput,
} from '../../src/patch-map/renderers/types';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { applyPatchMapAffine } from '../../src/patch-map/semantic/geometry';
import { planPatchMapBarHeightBatch } from '../../src/patch-map/semantic/transaction';

describe('PatchMap bar presentation integration', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
    vi.restoreAllMocks();
  });

  it('commits semantic height immediately and publishes deterministic bottom-anchored frames', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    const entityId = 'item-a::bar:level';
    const initialBottom = bottomLeft(core.visibleProjection!, entityId);

    const changed = core.reconcile(scene(40));
    expect(changed.status).toBe('committed');
    expect(core.get(entityId)?.bounds.height).toBe(40);
    expect(core.projection?.byEntityId[entityId]?.localBounds[3]).toBe(40);
    expect(core.visibleProjection?.byEntityId[entityId]?.localBounds[3]).toBe(10);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 10,
        active: true,
        startHeight: 10,
        destinationHeight: 40,
        startTimeMs: 0,
        ghostPublicationCount: 0,
        controller: { activeCount: 1, totalSettlementCount: 0 },
      });
    expect(bottomLeft(core.visibleProjection!, entityId)).toEqual(initialBottom);

    const presentationIndex = core.visibleProjection;
    core.publishFrame(100);
    expect(core.visibleProjection).toBe(presentationIndex);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, active: true });
    expect(bottomLeft(core.visibleProjection!, entityId)).toEqual(initialBottom);
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ ranges: [{ start: 1, end: 2 }] });

    core.publishFrame(200);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 40,
        active: false,
        controller: { activeCount: 0, totalSettlementCount: 1 },
      });
  });

  it('reconciles bars without materializing public presentation observations', () => {
    const publicProbe = vi.spyOn(PatchMapPresentationController.prototype, 'probe');
    const publicRetarget = vi.spyOn(PatchMapPresentationController.prototype, 'retarget');
    const publicCancel = vi.spyOn(PatchMapPresentationController.prototype, 'cancel');
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    publicProbe.mockClear();
    publicRetarget.mockClear();
    publicCancel.mockClear();

    expect(core.reconcile(scene(40)).status).toBe('committed');
    const presentation = (
      core as unknown as {
        barPresentation: PatchMapBarPresentationAuthority;
      }
    ).barPresentation;
    const activeBeforeNoOp = presentation.snapshot();
    expect(core.reconcile(scene(40)).status).toBe('committed');
    expect(presentation.snapshot()).toEqual(activeBeforeNoOp);
    expect(core.reconcile(scene(25, false)).status).toBe('committed');

    expect(publicProbe).not.toHaveBeenCalled();
    expect(publicRetarget).not.toHaveBeenCalled();
    expect(publicCancel).not.toHaveBeenCalled();
  });

  it('renders a same-clock viewport frame without rebuilding unchanged presentation geometry', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    const projectionCallCount = renderer.projectionCalls.length;
    const before = core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' });

    core.publishFrame(0);

    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' })).toEqual(before);
    expect(renderer.projectionCalls).toHaveLength(projectionCallCount);
    expect(core.activeAnimations).toBe(1);
  });

  it('advances transaction animations through the public frame publication clock', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    const entityId = 'item-a::bar:level';
    const initialHeight = core.get(entityId)?.bounds.height;

    core.animateBarHeights({
      fraction: 1,
      durationMs: 100,
      seed: 0xa11ba7,
      minPercent: 100,
      maxPercent: 100,
    });
    expect(core.activeAnimations).toBeGreaterThan(0);

    core.publishFrame(50);
    expect(core.get(entityId)?.bounds.height).not.toBe(initialHeight);
    expect(core.activeAnimations).toBeGreaterThan(0);

    core.publishFrame(100);
    expect(core.activeAnimations).toBe(0);
  });

  it('reuses the animated-bar hit envelope across presentation frames', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    core.publishFrame(50);
    const internals = core as unknown as {
      spatialHit: PatchMapSpatialHitAuthority;
    };
    const firstCenter = core.visibleProjection?.byEntityId['item-a::bar:level']?.visibleCenter;
    if (firstCenter === undefined) throw new Error('missing first bar center');
    const firstHit = core.hitTestScreen({ x: firstCenter[0], y: firstCenter[1] });
    const envelope = internals.spatialHit.debugSnapshot().animatedBarIndex;

    expect(core.get(firstHit!)?.id).toBe('item-a');
    expect(envelope).not.toBeNull();
    expect(internals.spatialHit.debugSnapshot().exactIndex).toBeNull();

    core.publishFrame(100);
    const secondCenter = core.visibleProjection?.byEntityId['item-a::bar:level']?.visibleCenter;
    if (secondCenter === undefined) throw new Error('missing second bar center');
    expect(core.get(core.hitTestScreen({
      x: secondCenter[0],
      y: secondCenter[1],
    })!)?.id).toBe('item-a');
    expect(internals.spatialHit.debugSnapshot().animatedBarIndex).toBe(envelope);

    core.publishFrame(200);
    expect(internals.spatialHit.debugSnapshot().animatedBarIndex).toBeNull();
  });

  it('reuses the animated-bar hit envelope across direct mid-animation retargets', async () => {
    const { core } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'presentation-retarget-hit-envelope',
      width: 800,
      height: 600,
    });
    engine.loadDataset(scene(10));
    engine.publishFrame(0);
    engine.updateBarHeights({
      targets: [{ ownerId: 'item-a', componentId: 'level' }],
      heights: new Float64Array([40]),
      recordHistory: false,
    });
    engine.publishFrame(50);
    const internals = core as unknown as {
      spatialHit: PatchMapSpatialHitAuthority;
    };
    const firstCenter =
      core.visibleProjection?.byEntityId['item-a::bar:level']?.visibleCenter;
    if (firstCenter === undefined) throw new Error('missing first bar center');
    expect(core.hitTestScreen({ x: firstCenter[0], y: firstCenter[1] }))
      .not.toBeNull();
    const envelope = internals.spatialHit.debugSnapshot().animatedBarIndex;
    expect(envelope).not.toBeNull();

    engine.updateBarHeights({
      targets: [{ ownerId: 'item-a', componentId: 'level' }],
      heights: new Float64Array([70]),
      recordHistory: false,
    });
    expect(internals.spatialHit.debugSnapshot().animatedBarIndex).toBe(envelope);
    engine.publishFrame(100);
    const secondCenter =
      core.visibleProjection?.byEntityId['item-a::bar:level']?.visibleCenter;
    if (secondCenter === undefined) throw new Error('missing second bar center');
    expect(core.hitTestScreen({ x: secondCenter[0], y: secondCenter[1] }))
      .not.toBeNull();
    expect(internals.spatialHit.debugSnapshot().animatedBarIndex).toBe(envelope);

    await engine.destroy();
  });

  it('animates every expanded grid bar from one template batch target', async () => {
    const { core } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-template-bar-animation',
      width: 800,
      height: 600,
    });
    engine.loadDataset(gridScene(10));
    engine.publishFrame(0);
    const barIds = Object.keys(core.projection?.barsByEntityId ?? {});
    expect(barIds).toHaveLength(3);

    expect(engine.updateBarHeights({
      targets: [{ ownerId: 'grid-a', componentId: 'level' }],
      heights: new Float64Array([54]),
      recordHistory: false,
    })).toMatchObject({ status: 'committed', changed: true });
    expect(core.activeAnimations).toBe(3);
    for (const entityId of barIds) {
      expect(core.projection?.byEntityId[entityId]?.localBounds[3]).toBe(54);
      expect(core.visibleProjection?.byEntityId[entityId]?.localBounds[3]).toBe(10);
    }

    engine.publishFrame(100);
    for (const entityId of barIds) {
      const height = core.visibleProjection?.byEntityId[entityId]?.localBounds[3];
      expect(height).toBeGreaterThan(10);
      expect(height).toBeLessThan(54);
    }
    engine.publishFrame(200);
    expect(core.activeAnimations).toBe(0);
    for (const entityId of barIds) {
      expect(core.visibleProjection?.byEntityId[entityId]?.localBounds[3]).toBe(54);
    }

    await engine.destroy();
  });

  it('updates expanded grid bars independently without mutating authored data or history', async () => {
    const { core } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-bar-overlay',
      width: 800,
      height: 600,
    });
    const input = gridScene(10);
    const inputBefore = JSON.stringify(input);
    engine.loadDataset(input);
    engine.publishFrame(0);
    const authored = engine.exportDataset();
    const history = engine.historyState();
    const revisions = engine.snapshot().revisions;

    expect(engine.updateInstanceBarHeights({
      targets: [
        { id: 'grid-a.0.0', componentId: 'level' },
        { id: 'grid-a.0.1', componentId: 'level' },
      ],
      heights: new Float64Array([54, 27]),
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedTargets: [
        { id: 'grid-a.0.0', componentId: 'level' },
        { id: 'grid-a.0.1', componentId: 'level' },
      ],
      missingTargets: [],
      activeAnimationCount: 0,
      overlayCount: 2,
      previousRevisions: revisions,
      revisions: {
        sceneRevision: revisions.sceneRevision,
        interactionRevision: revisions.interactionRevision + 1,
      },
    });
    expect(core.projection?.byEntityId['grid-a.0.0::bar:level']?.localBounds[3]).toBe(54);
    expect(core.projection?.byEntityId['grid-a.0.1::bar:level']?.localBounds[3]).toBe(27);
    expect(core.projection?.byEntityId['grid-a.1.0::bar:level']?.localBounds[3]).toBe(10);
    expect(engine.exportDataset()).toBe(authored);
    expect(engine.historyState()).toEqual(history);
    expect(JSON.stringify(input)).toBe(inputBefore);

    const beforeRejected = core.projection;
    expect(engine.updateInstanceBarHeights({
      targets: [
        { id: 'grid-a.0.0', componentId: 'level' },
        { id: 'missing.0.0', componentId: 'level' },
      ],
      heights: [70, 80],
      animate: false,
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      missingTargets: [{ id: 'missing.0.0', componentId: 'level' }],
      overlayCount: 2,
    });
    expect(core.projection).toBe(beforeRejected);
    expect(() => engine.updateInstanceBarHeights({
      targets: [
        { id: 'grid-a.0.0', componentId: 'level' },
        { id: 'grid-a.0.0', componentId: 'level' },
      ],
      heights: [30, 40],
      animate: false,
    })).toThrow(/duplicate instance bar target/);
    expect(() => engine.updateInstanceBarHeights({
      targets: [{ id: 'grid-a.0.0', componentId: 'level' }],
      heights: [-1],
      animate: false,
    })).toThrow(/finite and non-negative/);
    expect(() => engine.updateInstanceBarHeights({
      targets: [{ ownerId: 'grid-a.0.0', componentId: 'level' }] as never,
      heights: [30],
      animate: false,
    })).toThrow(/target id must be a non-empty string/);
    expect(core.projection).toBe(beforeRejected);

    expect(engine.updateInstanceBarHeights({
      targets: [{ id: 'grid-a.0.0', componentId: 'level' }],
      heights: [null],
      animate: false,
    })).toMatchObject({ status: 'committed', overlayCount: 1 });
    expect(core.projection?.byEntityId['grid-a.0.0::bar:level']?.localBounds[3]).toBe(10);

    expect(engine.updateBarHeights({
      targets: [{ ownerId: 'grid-a', componentId: 'level' }],
      heights: [20],
      recordHistory: false,
    })).toMatchObject({ status: 'committed' });
    expect(core.projection?.byEntityId['grid-a.0.0::bar:level']?.localBounds[3]).toBe(20);
    expect(core.projection?.byEntityId['grid-a.0.1::bar:level']?.localBounds[3]).toBe(27);
    expect(core.projection?.byEntityId['grid-a.1.0::bar:level']?.localBounds[3]).toBe(20);

    engine.loadDataset(gridScene(15));
    engine.publishFrame(250);
    expect(core.projection?.byEntityId['grid-a.0.1::bar:level']?.localBounds[3]).toBe(15);
    expect(engine.updateInstanceBarHeights({
      targets: [{ id: 'grid-a.0.1', componentId: 'level' }],
      heights: [null],
      animate: false,
    })).toMatchObject({ status: 'unchanged', changed: false, overlayCount: 0 });

    await engine.destroy();
  });

  it('retargets independent grid bars through one central animation controller', async () => {
    const { core } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-bar-animation',
      width: 800,
      height: 600,
    });
    engine.loadDataset(gridScene(10));
    engine.publishFrame(0);
    const targets = [
      { id: 'grid-a.0.0', componentId: 'level' },
      { id: 'grid-a.0.1', componentId: 'level' },
    ];

    expect(engine.updateInstanceBarHeights({
      targets,
      heights: new Float64Array([50, 30]),
    })).toMatchObject({ status: 'committed', activeAnimationCount: 2 });
    engine.publishFrame(50);
    const firstVisible = targets.map(({ id, componentId }) =>
      engine.barPresentationProbe({ ownerId: id, componentId })?.presentationHeight);

    expect(engine.updateInstanceBarHeights({
      targets,
      heights: new Float64Array([25, 60]),
    })).toMatchObject({ status: 'committed', activeAnimationCount: 2 });
    expect(targets.map(({ id, componentId }) =>
      engine.barPresentationProbe({ ownerId: id, componentId })?.presentationHeight))
      .toEqual(firstVisible);
    expect(core.activeAnimations).toBe(2);

    engine.publishFrame(250);
    expect(targets.map(({ id, componentId }) =>
      engine.barPresentationProbe({ ownerId: id, componentId })?.presentationHeight))
      .toEqual([25, 60]);
    expect(core.activeAnimations).toBe(0);

    await engine.destroy();
  });

  it('publishes bar tint and hidden icon presentation atomically without semantic changes', async () => {
    const { core, renderer } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-presentation-overlay',
      width: 800,
      height: 600,
    });
    const input = gridPresentationScene();
    engine.loadDataset(input);
    engine.publishFrame(0);
    const exported = engine.exportDataset();
    const history = engine.historyState();
    const semanticHash = engine.snapshot().semanticHash;

    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        height: [48],
        tint: ['#2563eb'],
        source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
        show: [true],
      },
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [true],
        source: ['ess'],
        tint: ['#ef4444'],
      },
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      missingTargets: [],
      overlayCount: 2,
    });
    await core.settleSceneImages();
    expect(core.sceneImageProbe()).toMatchObject({ activeTargetCount: 1 });

    const overrides = renderer.presentationOverrides.at(-1)!;
    expect(overrides.get('grid-presentation.0.0::bar:level')).toMatchObject({
      fill: 0x2563ebff,
      trackFill: 0xffffffff,
      radius: 8,
      visible: true,
    });
    expect(overrides.get('grid-presentation.0.0::icon:status')).toEqual({
      visible: true,
      source: 'ess',
      tint: 0xef4444ff,
    });
    expect(core.projection?.imagesByEntityId?.['grid-presentation.0.0::icon:status'])
      .toMatchObject({ authoredSource: 'ess', bindingKey: 'alias:ess' });
    expect(engine.exportDataset()).toBe(exported);
    expect(engine.historyState()).toEqual(history);
    expect(engine.snapshot().semanticHash).toBe(semanticHash);

    const barOverrideBeforeRepeatedColumns = overrides.get(
      'grid-presentation.0.0::bar:level',
    );
    const iconOverrideBeforeRepeatedColumns = overrides.get(
      'grid-presentation.0.0::icon:status',
    );
    const imageBeforeRepeatedColumns = core.projection?.imagesByEntityId?.[
      'grid-presentation.0.0::icon:status'
    ];
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        height: [50],
        tint: ['#2563eb'],
        source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
        show: [true],
      },
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [true],
        source: ['ess'],
        tint: ['#ef4444'],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toBe(barOverrideBeforeRepeatedColumns);
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::icon:status',
    )).toBe(iconOverrideBeforeRepeatedColumns);
    expect(core.projection?.imagesByEntityId?.[
      'grid-presentation.0.0::icon:status'
    ]).toBe(imageBeforeRepeatedColumns);

    const overridesBeforeHeightOnly = renderer.presentationOverrides.at(-1);
    expect(engine.updateInstanceBarHeights({
      targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
      heights: new Float64Array([52]),
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedTargets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
      overlayCount: 2,
    });
    expect(core.projection?.byEntityId['grid-presentation.0.0::bar:level']?.localBounds[3])
      .toBe(52);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeHeightOnly);
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x2563ebff });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::icon:status',
    )).toEqual({ visible: true, source: 'ess', tint: 0xef4444ff });
    expect(engine.exportDataset()).toBe(exported);
    expect(engine.historyState()).toEqual(history);
    expect(engine.snapshot().semanticHash).toBe(semanticHash);

    expect(engine.transact({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'grid-presentation', id: 'level' },
        changes: [{ path: ['tint'], value: '#22c55e' }],
      }],
    })).toMatchObject({ status: 'committed', changed: true });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x2563ebff });
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x22c55eff });

    const projectionBeforeRejection = core.projection;
    const overridesBeforeRejection = renderer.presentationOverrides.at(-1);
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: ['#22c55e'],
      },
      icon: {
        targets: [{ id: 'missing.0.0', componentId: 'status' }],
        show: [true],
      },
      animate: false,
    })).toMatchObject({ status: 'rejected', changed: false });
    expect(core.projection).toBe(projectionBeforeRejection);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeRejection);

    const throwingTint = Object.defineProperty({ length: 1 }, '0', {
      get() { throw new Error('tint column accessor failed'); },
    });
    expect(() => engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: throwingTint,
      },
      animate: false,
    })).toThrow('tint column accessor failed');
    expect(core.projection).toBe(projectionBeforeRejection);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeRejection);

    engine.loadDataset(gridPresentationScene());
    expect(renderer.presentationOverrides.at(-1)?.size).toBe(0);
    expect(engine.updateInstanceBarHeights({
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [null],
        source: [null],
        tint: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'unchanged', changed: false, overlayCount: 0 });

    await engine.destroy();
  });

  it('invalidates surface geometry only when a presentation frame advances', () => {
    const { core } = createTestCore(allocated);
    const surface = new PixiEngineSurface(core);
    surface.load(scene(10));
    surface.publishFrame(0);
    surface.reconcile(scene(40));
    const before = surface.geometrySnapshot();

    surface.publishFrame(0);
    expect(surface.geometrySnapshot()).toBe(before);

    surface.publishFrame(100);
    expect(surface.geometrySnapshot()).not.toBe(before);
  });

  it('does not rebuild dense entity snapshots for steady presentation frames after a view-only commit', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    const internals = core as unknown as {
      readonly scene: {
        get: (target: unknown) => unknown;
        advance: (timeMs: number) => unknown;
      };
    };
    const getSpy = vi.spyOn(internals.scene, 'get');
    const advanceSpy = vi.spyOn(internals.scene, 'advance');

    core.setView({ x: 12, y: 8, scale: 1.25, rotation: 0 });
    getSpy.mockClear();
    core.publishFrame(100);

    expect(getSpy).not.toHaveBeenCalled();
    expect(advanceSpy).not.toHaveBeenCalled();
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, active: true });
  });

  it('leaves pointer-gesture frame ownership to the host when auto-render is disabled', () => {
    const { core, renderer } = createTestCore(allocated);

    renderer.dispatchRootPointer('down', 20, 30, 7, 1);
    expect(core.debugSnapshot()).toMatchObject({
      activeGestureCount: 1,
      scheduler: { continuous: false, pending: false, frameCount: 0 },
    });

    renderer.dispatchRootPointer('move', 32, 38, 7, 1);
    expect(core.view).toMatchObject({ x: 12, y: 8 });
    expect(core.debugSnapshot()).toMatchObject({
      activeGestureCount: 1,
      renderer: { view: { x: 0, y: 0 } },
      scheduler: { continuous: false, pending: false, frameCount: 0 },
    });

    renderer.dispatchRootPointer('up', 32, 38, 7, 1);
    expect(core.debugSnapshot()).toMatchObject({
      activeGestureCount: 0,
      scheduler: { continuous: false, pending: false, frameCount: 0 },
    });
  });

  it('applies explicit viewport zoom limits to programmatic zoom and fit', () => {
    const { core } = createTestCore(allocated);
    core.load([{
      type: 'item',
      id: 'large-world',
      size: { width: 100_000, height: 80_000 },
    }]);
    core.setViewportZoomLimits([0.002, 8]);

    core.fit(0);
    expect(core.view.scale).toBe(0.0075);

    core.zoomAt({ x: 400, y: 300 }, 0.01);
    expect(core.view.scale).toBe(0.002);
  });

  it('matches the canonical parser for transformed direct bar-height projections', () => {
    for (const placement of [
      'top',
      'bottom',
      'center',
      'left-bottom',
      'right',
    ] as const) {
      const initial = materializePatchMapDataset(transformedBarScene(12, placement));
      const plan = planPatchMapBarHeightBatch(initial, {
        targets: [{ ownerId: 'item-a', componentId: 'level' }],
        heights: new Float64Array([43]),
      });
      expect(plan.status).toBe('planned');
      if (plan.status !== 'planned') throw new Error('Expected direct bar plan');
      const update = plan.directBarHeightUpdates?.[0];
      expect(update).toEqual({ ownerId: 'item-a', componentId: 'level', height: 43 });

      const { core: direct } = createTestCore(allocated);
      const { core: canonical } = createTestCore(allocated);
      direct.load(initial.dataset);
      canonical.load(initial.dataset);

      expect(direct.reconcile(plan.candidate.dataset, {
        animateBarChanges: false,
        directBarHeightUpdates: update === undefined ? [] : [update],
      }).status).toBe('committed');
      expect(canonical.reconcile(plan.candidate.dataset, {
        animateBarChanges: false,
      }).status).toBe('committed');

      expect(roundGeometry(direct.projection)).toEqual(roundGeometry(canonical.projection));
      expect(roundGeometry(direct.snapshot())).toEqual(roundGeometry(canonical.snapshot()));
    }
  });

  it('rejects backward publication without poisoning a later atomic reconcile', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    core.publishFrame(100);
    core.reconcile(scene(20));

    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 20,
        presentationHeight: 36.25,
        startHeight: 36.25,
        destinationHeight: 20,
        controller: { totalSupersessionCount: 1, totalSettlementCount: 0 },
      });
    core.publishFrame(200);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 22.03125, active: true });
    const beforeSnapshot = core.snapshot();
    const beforeProjection = core.projection;
    const beforeVisibleProjection = core.visibleProjection;
    const beforeProbe = core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' });
    const beforeProjectionPublicationCount = renderer.projectionCalls.length;
    expect(() => core.publishFrame(199)).toThrow(PatchMapPresentationError);
    expect(core.snapshot()).toEqual(beforeSnapshot);
    expect(core.projection).toBe(beforeProjection);
    expect(core.visibleProjection).toBe(beforeVisibleProjection);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toEqual(beforeProbe);
    expect(renderer.projectionCalls).toHaveLength(beforeProjectionPublicationCount);

    const reconciled = core.reconcile(scene(30));
    expect(reconciled).toMatchObject({
      status: 'committed',
      facts: {
        revisionBefore: beforeSnapshot.revision,
        revisionAfter: beforeSnapshot.revision + 1,
      },
    });
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 30,
        presentationHeight: 22.03125,
        startHeight: 22.03125,
        destinationHeight: 30,
        startTimeMs: 200,
        active: true,
      });
    core.publishFrame(300);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 29.00390625, active: true });
    core.publishFrame(400);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 30,
        presentationHeight: 30,
        active: false,
        controller: { totalSettlementCount: 1, activeCount: 0 },
        ghostPublicationCount: 0,
      });
  });

  it('snaps bar presentation when reconciliation is an ancestor layout transaction', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);

    expect(core.reconcile(scene(40), { animateBarChanges: false }).status).toBe('committed');
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 40,
        active: false,
        controller: { activeCount: 0 },
      });
  });

  it('animates only explicitly targeted bars in a mixed semantic transaction', () => {
    const { core } = createTestCore(allocated);
    core.load(twoBarScene(10, 10));
    core.publishFrame(0);

    const result = core.reconcile(twoBarScene(40, 50), {
      animatedBarTargets: [{ ownerId: 'item-a', componentId: 'first' }],
    });

    expect(result.status).toBe('committed');
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'first' }))
      .toMatchObject({ semanticHeight: 40, presentationHeight: 10, active: true });
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'second' }))
      .toMatchObject({ semanticHeight: 50, presentationHeight: 50, active: false });
  });

  it('lands immediately when animation is disabled and releases controller ownership on load', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    expect(core.activeAnimations).toBe(1);

    core.reconcile(scene(25, false));
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ semanticHeight: 25, presentationHeight: 25, active: false });
    expect(core.activeAnimations).toBe(0);

    core.reconcile(scene(50, true));
    expect(core.activeAnimations).toBe(1);
    core.load(scene(12));
    expect(core.activeAnimations).toBe(0);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ semanticHeight: 12, presentationHeight: 12, active: false });
  });

  it('resolves one logical panel fill to its aggregate background entity only', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(panelScene());
    const fillOverrides = [{ id: 'item-a', packedColor: 0x00aa66ff }];

    const probe = core.setPresentationPolicy({
      fillOverrides,
    });
    fillOverrides[0]!.packedColor = 0xff0000ff;

    expect(renderer.presentationPolicies.at(-1)?.fillOverrides).toEqual([
      { id: 'item-a::background:bg', packedColor: 0x00aa66ff },
    ]);
    expect(renderer.presentationPolicies.at(-1)?.fillOverrides).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'item-a::bar:level' }),
      ]),
    );
    expect(probe.fillOverrides).toEqual([
      { id: 'item-a', packedColor: 0x00aa66ff },
    ]);
    expect(probe.entities.find(({ id }) => id === 'item-a')?.packedFills)
      .toContain(0x00aa66ff);
  });

  it('publishes direct dense animation staleness until JSON reconciliation replaces it', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.flush('initial');
    const barRef = core.query({ kinds: ['bar'] })[0];
    if (!barRef) throw new Error('missing bar entity');
    const barId = core.get(barRef)?.id;
    if (!barId) throw new Error('missing bar identity');

    const scheduled = core.animateBarHeights({
      fraction: 1,
      seed: 0x51a1e,
      durationMs: 200,
      minScale: 0.5,
      maxScale: 0.5,
    });
    expect(scheduled.operationCount).toBe(1);
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ staleIds: [barId] });

    core.advance(100);
    expect(core.get(barRef)?.bounds.height).toBeCloseTo(7.5, 8);

    expect(core.reconcile(scene(20), { animateBarChanges: false }).status).toBe('committed');
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ staleIds: [] });
  });

  it('animates every bar to an independent deterministic zero-to-one-hundred percent height', () => {
    const { core } = createTestCore(allocated);
    core.load(twoBarScene(12, 34));
    const scheduled = core.animateBarHeights({
      fraction: 1,
      durationMs: 200,
      seed: 0xa11ba8,
      minPercent: 0,
      maxPercent: 100,
    });

    expect(scheduled.operationCount).toBe(2);
    core.advance(200);

    const heights = core.query({ kinds: ['bar'] })
      .map((ref) => core.get(ref)?.bounds.height)
      .filter((height): height is number => height !== undefined);
    expect(heights).toHaveLength(2);
    expect(heights[0]).not.toBe(heights[1]);
    expect(heights.every((height) => height >= 0 && height <= 80)).toBe(true);
  });

  it('rejects ambiguous or out-of-range percentage animation options atomically', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    const before = core.snapshot();

    expect(() => core.animateBarHeights({
      minPercent: 0,
      maxPercent: 101,
    })).toThrow('between zero and one hundred');
    expect(() => core.animateBarHeights({
      minPercent: 0,
      maxPercent: 100,
      minScale: 0.5,
    })).toThrow('cannot be combined');
    expect(core.snapshot()).toEqual(before);
  });

  it('publishes through Engine and maps backward clock conflicts without advancing revisions', async () => {
    const { core } = createTestCore(allocated);
    const surface = new PixiEngineSurface(core);
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'presentation-engine', width: 800, height: 600 });
    engine.loadDataset(scene(10));
    engine.publishFrame(0);

    expect(engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'level' },
      { size: { width: 60, height: 40 } },
    )).toMatchObject({ status: 'committed', publication: 'pending' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 10,
        active: true,
        revisions: { sceneRevision: 2 },
        publishedTuple: { scene: 1 },
        frameRevision: 1,
      });
    engine.publishFrame(100);
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, frameRevision: 2 });
    const before = engine.snapshot();

    let failure: unknown;
    try {
      engine.publishFrame(99);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PatchMapError);
    expect((failure as PatchMapError).diagnostic).toMatchObject({
      code: 'CONFLICT',
      category: 'CONFLICT',
      operation: 'publishFrame',
      recoverable: true,
      retryable: true,
    });
    expect(engine.snapshot()).toEqual(before);
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, ghostPublicationCount: 0 });
    await engine.destroy();
  });

  it('keeps Engine ancestor layout patches atomic while direct bar patches animate', async () => {
    const { core } = createTestCore(allocated);
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({ instanceId: 'presentation-layout-engine', width: 800, height: 600 });
    engine.loadDataset(percentScene(80));
    engine.publishFrame(0);

    expect(engine.patch(
      { kind: 'element', id: 'item-a' },
      { size: { width: 100, height: 100 } },
    )).toMatchObject({ status: 'committed' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 25,
        presentationHeight: 25,
        active: false,
      });

    expect(engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'level' },
      { size: { width: 60, height: 40 } },
    )).toMatchObject({ status: 'committed' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 25,
        active: true,
      });
    await engine.destroy();
  });
});

class RendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public readonly projectionCalls: Array<Readonly<{
    index: PatchMapProjectionIndex;
    ranges: readonly SlotRange[] | null;
    staleIds: readonly string[] | null;
  }>> = [];
  public readonly presentationPolicies: Array<PatchMapResolvedPresentationPolicy | null> = [];
  public readonly presentationOverrides: Array<ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  >> = [];
  public destroyed = false;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private rootInteractions: RootInteractionHandlers | null = null;

  public markChanges(): void {}
  public markOverlayChanges(): void {}

  public setProjection(
    index: PatchMapProjectionIndex,
    ranges?: readonly SlotRange[],
    staleIds?: ReadonlySet<string>,
  ): boolean {
    this.projectionCalls.push(Object.freeze({
      index,
      ranges: ranges === undefined ? null : Object.freeze([...ranges]),
      staleIds: staleIds === undefined ? null : Object.freeze([...staleIds].sort()),
    }));
    return true;
  }

  public setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean {
    this.presentationPolicies.push(policy);
    return true;
  }

  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): boolean {
    this.presentationOverrides.push(overrides);
    return true;
  }

  public presentationEntityProbe(
    entityId: string,
  ): PatchMapRendererPresentationEntityProbe {
    const packedFill = this.presentationPolicies.at(-1)?.fillOverrides
      .find(({ id }) => id === entityId)?.packedColor ?? 0;
    return Object.freeze({
      entityId,
      emphasis: 1,
      visible: true,
      renderObjectCount: 1,
      packedFill,
    });
  }

  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(_store: RenderStoreView): RendererFlushResult {
    return Object.freeze({ rendered: true, commandCount: 1 });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public bindSceneAsset(key: string): Promise<Readonly<{
    key: string;
    generation: number;
    status: 'attached';
    cacheIdentity: string;
    normalizedResourceIdentity: string;
    reusedResolvedResource: boolean;
    naturalSize: readonly [number, number];
  }>> {
    return Promise.resolve(Object.freeze({
      key,
      generation: 1,
      status: 'attached' as const,
      cacheIdentity: key,
      normalizedResourceIdentity: key,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([24, 24] as const),
    }));
  }
  public unbindSceneAsset(): Promise<boolean> { return Promise.resolve(true); }
  public sceneAssetBindingProbe(): null { return null; }
  public sceneImageProbe(): null { return null; }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(handlers: RootInteractionHandlers): () => void {
    this.rootInteractions = handlers;
    return () => {
      if (this.rootInteractions === handlers) this.rootInteractions = null;
    };
  }
  public dispatchRootPointer(
    type: RootPointerInput['type'],
    screenX: number,
    screenY: number,
    pointerId: number,
    button: number,
  ): void {
    if (this.rootInteractions === null) throw new Error('root interactions are not bound');
    this.rootInteractions.pointer(Object.freeze({
      type,
      screenX,
      screenY,
      pointerId,
      pointerType: 'mouse',
      button,
      buttons: type === 'down' || type === 'move' ? 1 : 0,
      timeMs: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    }));
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: 0,
      storeEpoch: 0,
      entityCount: 0,
      aggregateRenderObjects: 0,
      visiblePrimitives: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      view: this.view,
      lastInvalidation: 'test',
      destroyed: this.destroyed,
    });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function createTestCore(allocated: PatchMapRuntime[]): Readonly<{
  core: PatchMapRuntime;
  renderer: RendererTestDouble;
}> {
  const renderer = new RendererTestDouble();
  const TestPatchMap = PatchMapRuntime as unknown as new (
    renderer: PatchMapPixiRenderer,
    options: PatchMapRuntimeOptions,
  ) => PatchMapRuntime;
  const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, { autoRender: false });
  allocated.push(core);
  return { core, renderer };
}

function scene(height: number, animation = true): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height },
      placement: 'bottom',
      animation,
      animationDuration: 200,
    }],
  }];
}

function gridScene(height: number): readonly unknown[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1], [1, 0]],
    gap: 4,
    item: {
      size: { width: 100, height: 80 },
      components: [{
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      }],
    },
  }];
}

function gridPresentationScene(): readonly unknown[] {
  return materializePatchMapDataset([{
    type: 'grid',
    id: 'grid-presentation',
    cells: [[1]],
    item: {
      size: { width: 100, height: 80 },
      components: [
        {
          type: 'bar',
          id: 'level',
          source: { type: 'rect', fill: '#ffffff' },
          size: { width: 60, height: 20 },
          placement: 'bottom',
          tint: '#7c3aed',
        },
        {
          type: 'icon',
          id: 'status',
          source: 'offline',
          size: { width: 24, height: 24 },
          placement: 'center',
          tint: '#ffffff',
          show: false,
        },
      ],
    },
  }]).dataset;
}

function transformedBarScene(
  height: number,
  placement: 'top' | 'bottom' | 'center' | 'left-bottom' | 'right',
): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    attrs: { x: 60, y: 30, angle: 37, scaleX: -1, scaleY: 1.25 },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height },
      placement,
      animation: true,
      animationDuration: 200,
    }],
  }];
}

function panelScene(): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'background',
        id: 'bg',
        source: { type: 'rect', fill: '#336699' },
      },
      {
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height: 20 },
      },
    ],
  }];
}

function percentScene(itemHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: itemHeight },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height: '25%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 200,
    }],
  }];
}

function twoBarScene(firstHeight: number, secondHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'bar',
        id: 'first',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height: firstHeight },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      },
      {
        type: 'bar',
        id: 'second',
        source: { type: 'rect', fill: '#663399' },
        size: { width: 60, height: secondHeight },
        placement: 'top',
        animation: true,
        animationDuration: 200,
      },
    ],
  }];
}

function bottomLeft(index: PatchMapProjectionIndex, entityId: string): readonly [number, number] {
  const projection = index.byEntityId[entityId];
  if (projection === undefined) throw new Error(`missing ${entityId}`);
  return applyPatchMapAffine(projection.affine, [0, projection.localBounds[3]]);
}

function roundGeometry(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 1e12) / 1e12 : value;
  }
  if (Array.isArray(value)) return value.map(roundGeometry);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, roundGeometry(entry)]),
    );
  }
  return value;
}
