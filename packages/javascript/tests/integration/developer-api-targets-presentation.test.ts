import { describe, expect, it } from 'vitest';

import { createPatchMapApi } from '../../src/public';
import type { PatchMapLogicalTargetSnapshot } from '../../src/query-selection';
import { createHost } from './developer-api-host';

describe('PatchMap developer API targets and presentation', () => {
  it('queries a reusable semantic target set with stable id/componentId addresses', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const usage = map.targets.query({
      within: 'rack-grid',
      componentId: 'usage',
      type: 'bar',
      scope: 'instances',
    });

    expect('compile' in map.targets).toBe(false);
    expect(usage.count).toBe(2);
    expect(usage.matches).toEqual([
      {
        id: 'rack-grid.12.3',
        componentId: 'usage',
        kind: 'component',
        type: 'bar',
        label: null,
        value: {},
      },
      {
        id: 'rack-grid.12.4',
        componentId: 'usage',
        kind: 'component',
        type: 'bar',
        label: null,
        value: {},
      },
    ]);
    expect(map.updateBatch({
      targets: usage,
      bar: { height: new Float32Array([72, 68]) },
    }, {
      animate: true,
    })).toMatchObject({ status: 'committed', appliedCount: 2 });
    expect(harness.lastInstanceRequest()).toEqual({
      bar: {
        targets: [
          { id: 'rack-grid.12.3', componentId: 'usage' },
          { id: 'rack-grid.12.4', componentId: 'usage' },
        ],
        height: new Float32Array([72, 68]),
      },
      animate: true,
    });
    expect(map.selection.set(usage)).toEqual(['rack-grid.12.3', 'rack-grid.12.4']);
  });

  it('lowers one keyed presentation snapshot without materializing the unmatched complement', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const scope = map.targets.query({ type: 'item', scope: 'authored' });
    const targets = ['rack', 'outside-scope'];
    const layer = {
      scope,
      targets,
      matched: { alphaMultiplier: 1 },
      unmatched: { alphaMultiplier: 0.32 },
    } as const;

    expect(map.presentation.set('plant-map:focus', layer)).toEqual({
      changed: true,
      revision: 1,
      scopeCount: 2,
      targetCount: 2,
      matchedCount: 1,
      unmatchedCount: 1,
      ignoredTargetCount: 1,
    });
    expect(harness.lastPresentationRequest()).toMatchObject({
      key: 'plant-map:focus',
      matchedAlphaMultiplier: 1,
      unmatchedAlphaMultiplier: 0.32,
    });
    expect((harness.lastPresentationRequest() as {
      readonly scope: readonly PatchMapLogicalTargetSnapshot[];
      readonly matched: readonly PatchMapLogicalTargetSnapshot[];
    }).scope.map(({ key }) => key)).toEqual(['element:rack', 'element:ambiguous']);
    expect((harness.lastPresentationRequest() as {
      readonly matched: readonly PatchMapLogicalTargetSnapshot[];
    }).matched.map(({ key }) => key)).toEqual(['element:rack']);
    expect(targets).toEqual(['rack', 'outside-scope']);
    expect(Object.isFrozen(layer)).toBe(false);
  });

  it('reuses component target sets and rejects invalid presentation snapshots atomically', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const scope = map.targets.query({ type: 'bar', scope: 'instances' });
    const targets = map.targets.query({
      within: 'rack-grid',
      componentId: 'usage',
      type: 'bar',
      scope: 'instances',
    });

    expect(map.presentation.set('search:results', {
      scope,
      targets,
      unmatched: { alphaMultiplier: 0.2 },
    })).toMatchObject({ targetCount: 2, matchedCount: 2, ignoredTargetCount: 0 });
    expect((harness.lastPresentationRequest() as {
      readonly matched: readonly PatchMapLogicalTargetSnapshot[];
    }).matched.map(({ key }) => key)).toEqual([
      'component:rack-grid.12.3/usage',
      'component:rack-grid.12.4/usage',
    ]);

    const invalidHarness = createHost();
    const invalidMap = createPatchMapApi(invalidHarness.host);
    const invalidScope = invalidMap.targets.query({ type: 'item', scope: 'authored' });
    expect(() => invalidMap.presentation.set('', {
      scope: invalidScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
    })).toThrow('presentation key must be a non-empty string');
    expect(() => invalidMap.presentation.set('invalid', {
      scope: invalidScope,
      targets: [],
      unmatched: { alphaMultiplier: -0.1 },
    })).toThrow('layer.unmatched.alphaMultiplier must be between zero and one');
    expect(() => invalidMap.presentation.set('invalid', {
      scope: invalidScope,
      targets: ['rack', { id: 'ambiguous' }] as never,
      unmatched: { alphaMultiplier: 0.2 },
    })).toThrow('layer.targets cannot mix strings and PatchMapTarget objects');
    expect(() => invalidMap.presentation.set('invalid', {
      scope: invalidScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
      priority: 10,
    } as never)).toThrow('layer contains an unknown field');
    expect(() => invalidMap.presentation.set('invalid', Object.defineProperty({
      scope: invalidScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
    }, 'targets', {
      enumerable: true,
      get: () => ['rack'],
    }) as never)).toThrow('layer.targets must be an enumerable data property');
    expect(invalidHarness.lastPresentationRequest()).toBeNull();
  });

  it('rejects stale and cross-instance presentation target sets and clears only one key', () => {
    const source = createHost();
    const destination = createHost();
    const sourceMap = createPatchMapApi(source.host);
    const destinationMap = createPatchMapApi(destination.host);
    const sourceScope = sourceMap.targets.query({ type: 'item', scope: 'authored' });
    const destinationScope = destinationMap.targets.query({ type: 'item', scope: 'authored' });

    expect(() => destinationMap.presentation.set('foreign', {
      scope: sourceScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
    })).toThrow('target set belongs to another PatchMap instance');
    destination.setReusable(false);
    expect(() => destinationMap.presentation.set('stale', {
      scope: destinationScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
    })).toThrow('target set is stale; run targets.query() again after loading data');
    destination.setReusable(true);
    destinationMap.presentation.set('one', {
      scope: destinationScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.2 },
    });
    destinationMap.presentation.set('two', {
      scope: destinationScope,
      targets: [],
      unmatched: { alphaMultiplier: 0.4 },
    });
    expect(destinationMap.presentation.clear('one')).toBe(true);
    expect(destinationMap.presentation.clear('one')).toBe(false);
    expect(destinationMap.presentation.clear('two')).toBe(true);
  });
});
