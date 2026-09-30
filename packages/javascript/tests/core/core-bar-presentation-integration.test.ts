import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PatchMapRuntime } from '../../src/core';
import type { PatchMapSpatialHitAuthority } from '../../src/core/spatial-hit-authority';
import type { PatchMapBarPresentationAuthority } from '../../src/core/bar-presentation-authority';
import { PatchMapError } from '../../src/engine';
import { PixiEngineSurface } from '../../src/composition/pixi-engine-surface';
import {
  PatchMapPresentationController,
  PatchMapPresentationError,
} from '../../src/presentation';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import { planPatchMapBarHeightBatch } from '../../src/semantic/transaction';
import { createPublicApiEngine } from '../support/public-api-engine';
import {
  bottomLeft,
  createTestCore,
  panelScene,
  percentScene,
  roundGeometry,
  scene,
  transformedBarScene,
  twoBarScene,
} from './support/presentation-test-support';

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
    const engine = createPublicApiEngine({
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

  it('retains only unchanged active destinations outside the targeted animation set', () => {
    const { core } = createTestCore(allocated);
    core.load(twoBarScene(10, 10));
    core.publishFrame(0);
    core.reconcile(twoBarScene(40, 50));

    expect(core.activeAnimations).toBe(2);
    core.reconcile(twoBarScene(40, 60), { animatedBarTargets: [] });

    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'first' }))
      .toMatchObject({ presentationHeight: 10, destinationHeight: 40, active: true });
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'second' }))
      .toMatchObject({ presentationHeight: 60, destinationHeight: 60, active: false });
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

  it('materializes an offscreen terminal bar only when its renderer chunk enters view', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(twoBarScene(10, 20));
    core.publishFrame(0);
    const refs = core.query({ kinds: ['bar'] });
    const first = refs[0];
    const second = refs[1];
    if (first === undefined || second === undefined) throw new Error('missing bars');
    renderer.setVisibleSlots([first.slot]);

    core.reconcile(twoBarScene(40, 60));
    core.publishFrame(100);
    expect(renderer.projectionCalls.at(-1)?.ranges).toEqual([
      { start: first.slot, end: first.slot + 1 },
    ]);

    core.publishFrame(200);
    expect(core.activeAnimations).toBe(0);
    expect(renderer.projectionCalls.at(-1)?.ranges).toEqual([
      { start: first.slot, end: first.slot + 1 },
    ]);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'second' }))
      .toMatchObject({ semanticHeight: 60, presentationHeight: 60, active: false });

    renderer.setVisibleSlots([second.slot]);
    core.flush('pan-in');
    expect(renderer.projectionCalls.at(-1)?.ranges).toEqual([
      { start: second.slot, end: second.slot + 1 },
    ]);
    expect(renderer.projectionCalls.at(-1)?.index.byEntityId[
      core.get(second)?.id ?? ''
    ]?.localBounds[3]).toBe(60);
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
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
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
    const engine = createPublicApiEngine({
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
