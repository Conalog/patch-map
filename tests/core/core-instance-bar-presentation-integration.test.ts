import { afterEach, describe, expect, it } from 'vitest';

import type { PatchMapRuntime } from '../../src/core';
import { PixiEngineSurface } from '../../src/composition/pixi-engine-surface';
import { createPublicApiEngine } from '../support/public-api-engine';
import {
  createTestCore,
  gridScene,
} from './support/presentation-test-support';

describe('PatchMap instance bar presentation integration', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('animates every expanded grid bar from one template batch target', async () => {
    const { core } = createTestCore(allocated);
    const engine = createPublicApiEngine({
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
    const engine = createPublicApiEngine({
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
      bar: {
        targets: [
          { id: 'grid-a.0.0', componentId: 'level' },
          { id: 'grid-a.0.1', componentId: 'level' },
        ],
        height: new Float64Array([54, 27]),
      },
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
      bar: {
        targets: [
          { id: 'grid-a.0.0', componentId: 'level' },
          { id: 'missing.0.0', componentId: 'level' },
        ],
        height: [70, 80],
      },
      animate: false,
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      missingTargets: [{ id: 'missing.0.0', componentId: 'level' }],
      overlayCount: 2,
    });
    expect(core.projection).toBe(beforeRejected);
    expect(() => engine.updateInstanceBarHeights({
      bar: {
        targets: [
          { id: 'grid-a.0.0', componentId: 'level' },
          { id: 'grid-a.0.0', componentId: 'level' },
        ],
        height: [30, 40],
      },
      animate: false,
    })).toThrow(/duplicate instance bar target/);
    expect(() => engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-a.0.0', componentId: 'level' }],
        height: [-1],
      },
      animate: false,
    })).toThrow(/finite and non-negative/);
    expect(() => engine.updateInstanceBarHeights({
      bar: {
        targets: [{ ownerId: 'grid-a.0.0', componentId: 'level' }] as never,
        height: [30],
      },
      animate: false,
    })).toThrow(/target id must be a non-empty string/);
    expect(core.projection).toBe(beforeRejected);

    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-a.0.0', componentId: 'level' }],
        height: [null],
      },
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
      bar: {
        targets: [{ id: 'grid-a.0.1', componentId: 'level' }],
        height: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'unchanged', changed: false, overlayCount: 0 });

    await engine.destroy();
  });

  it('retargets independent grid bars through one central animation controller', async () => {
    const { core } = createTestCore(allocated);
    const engine = createPublicApiEngine({
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
      bar: { targets, height: new Float64Array([50, 30]) },
    })).toMatchObject({ status: 'committed', activeAnimationCount: 2 });
    engine.publishFrame(50);
    const firstVisible = targets.map(({ id, componentId }) =>
      engine.barPresentationProbe({ ownerId: id, componentId })?.presentationHeight);

    expect(engine.updateInstanceBarHeights({
      bar: { targets, height: new Float64Array([25, 60]) },
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
});

