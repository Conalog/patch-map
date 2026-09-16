import { afterEach, describe, expect, it } from 'vitest';

import type { PatchMapRuntime } from '../../src/core';
import { PixiEngineSurface } from '../../src/composition/pixi-engine-surface';
import { createPublicApiEngine } from '../support/public-api-engine';
import {
  createTestCore,
  gridScene,
  gridSceneExpanded,
  nonIdentityMultipliers,
  scene,
  twoBarScene,
} from './support/presentation-test-support';

describe('PatchMap presentation layer integration', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('composes keyed presentation layers by product and clears them on dataset replacement', async () => {
    const { core, renderer } = createTestCore(allocated);
    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({ instanceId: 'keyed-presentation-engine', width: 800, height: 600 });
    engine.loadDataset(twoBarScene(10, 20));
    const scope = engine.targets.query({ type: 'bar', scope: 'authored' });

    expect(engine.presentation.set('focus', {
      scope,
      targets: [{ id: 'item-a', componentId: 'first' }],
      unmatched: { alphaMultiplier: 0.4 },
    })).toMatchObject({ changed: true, revision: 1, scopeCount: 2, matchedCount: 1 });
    expect(renderer.presentationLayerUpdates.at(-1)).toMatchObject({
      revision: 1,
      layerCount: 1,
      full: false,
    });
    expect(nonIdentityMultipliers(renderer.presentationLayerUpdates.at(-1)!))
      .toEqual([0.4000000059604645]);
    const focusUpdateCount = renderer.presentationLayerUpdates.length;
    expect(engine.presentation.set('focus', {
      scope,
      targets: [
        { id: 'item-a', componentId: 'first' },
        { id: 'outside-scope' },
      ],
      unmatched: { alphaMultiplier: 0.4 },
    })).toMatchObject({
      changed: false,
      revision: 1,
      targetCount: 2,
      matchedCount: 1,
      ignoredTargetCount: 1,
    });
    expect(renderer.presentationLayerUpdates).toHaveLength(focusUpdateCount);

    const overlay = {
      scope,
      targets: [{ id: 'item-a', componentId: 'second' }],
      matched: { alphaMultiplier: 0.2 },
      unmatched: { alphaMultiplier: 0.5 },
    } as const;
    expect(engine.presentation.set('alarm', overlay)).toMatchObject({
      changed: true,
      revision: 2,
    });
    expect(renderer.presentationLayerUpdates.at(-1)).toMatchObject({
      layerCount: 2,
    });
    expect(nonIdentityMultipliers(renderer.presentationLayerUpdates.at(-1)!))
      .toEqual([0.5, 0.07999999821186066]);
    const updateCount = renderer.presentationLayerUpdates.length;
    expect(engine.presentation.set('alarm', overlay)).toMatchObject({
      changed: false,
      revision: 2,
    });
    expect(renderer.presentationLayerUpdates).toHaveLength(updateCount);

    expect(engine.presentation.clear('focus')).toBe(true);
    expect(renderer.presentationLayerUpdates.at(-1)).toMatchObject({
      revision: 3,
      layerCount: 1,
    });
    expect(nonIdentityMultipliers(renderer.presentationLayerUpdates.at(-1)!))
      .toEqual([0.5, 0.20000000298023224]);
    expect(engine.presentation.clear('missing')).toBe(false);
    expect(engine.snapshot().presentation).toEqual({ revision: 3, layerCount: 1 });

    expect(() => engine.loadDataset([{ type: 'item', id: '' }])).toThrow();
    expect(engine.snapshot().presentation).toEqual({ revision: 3, layerCount: 1 });

    engine.loadDataset(twoBarScene(30, 40));
    expect(engine.snapshot().presentation).toEqual({ revision: 4, layerCount: 0 });
    expect(renderer.presentationLayerUpdates.at(-1)).toMatchObject({
      revision: 4,
      layerCount: 0,
      full: true,
    });
    expect(renderer.presentationLayerUpdates.at(-1)?.alphaMultipliers).toHaveLength(0);

    const sameCapacityScope = engine.targets.query({ type: 'bar', scope: 'authored' });
    expect(engine.presentation.set('focus', {
      scope: sameCapacityScope,
      targets: [{ id: 'item-a', componentId: 'first' }],
      unmatched: { alphaMultiplier: 0.4 },
    })).toMatchObject({ changed: true, revision: 5, scopeCount: 2 });

    engine.loadDataset(scene(10));
    expect(engine.snapshot().presentation).toEqual({ revision: 6, layerCount: 0 });
    const differentCapacityScope = engine.targets.query({ type: 'bar', scope: 'authored' });
    expect(engine.presentation.set('focus', {
      scope: differentCapacityScope,
      targets: [{ id: 'item-a', componentId: 'level' }],
      unmatched: { alphaMultiplier: 0.4 },
    })).toMatchObject({ changed: true, revision: 7, scopeCount: 1 });
    await engine.destroy();
  });

  it('reprojects the logical scope snapshot without admitting later grid instances', async () => {
    const { core, renderer } = createTestCore(allocated);
    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({ instanceId: 'presentation-scope-snapshot', width: 800, height: 600 });
    engine.loadDataset(gridScene(10));
    const scope = engine.targets.query({ type: 'grid-cell', scope: 'instances' });
    expect(scope.matches.map(({ id }) => id)).toEqual([
      'grid-a.0.0',
      'grid-a.0.1',
      'grid-a.1.0',
    ]);
    engine.presentation.set('focus', {
      scope,
      targets: ['grid-a.0.0'],
      unmatched: { alphaMultiplier: 0.4 },
    });
    expect(nonIdentityMultipliers(renderer.presentationLayerUpdates.at(-1)!)).toHaveLength(4);
    const logicalRevision = engine.snapshot().presentation.revision;

    expect(core.reconcile(gridSceneExpanded(10)).status).toBe('committed');
    expect(engine.snapshot().presentation).toEqual({
      revision: logicalRevision,
      layerCount: 1,
    });
    const reprojected = renderer.presentationLayerUpdates.at(-1)!;
    expect(reprojected.full).toBe(true);
    expect(nonIdentityMultipliers(reprojected)).toHaveLength(4);
    await engine.destroy();
  });
});
