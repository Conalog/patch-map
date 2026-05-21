import { afterEach, describe, expect, it, vi } from 'vitest';

const flushParticleChildrenUpdate = vi.fn();
const aggregateLayer = { flushParticleChildrenUpdate };

vi.mock('./renderers/itemComponentRenderer', () => ({
  syncAggregateBarForItem: vi.fn(),
  tryApplyItemComponentChanges: vi.fn((_item, _components, options) => {
    options.aggregateBarLayers?.add(aggregateLayer);
    return true;
  }),
}));

import { tryApplyItemComponentChanges } from './renderers/itemComponentRenderer';
import { flushQueuedItemComponentUpdates, update } from './update';

describe('display update aggregate flush scheduling', () => {
  afterEach(() => {
    flushQueuedItemComponentUpdates();
    flushParticleChildrenUpdate.mockClear();
    tryApplyItemComponentChanges.mockClear();
  });

  it('coalesces trusted silent single item aggregate flushes until an explicit flush', () => {
    const item = { type: 'item' };
    const opts = {
      elements: item,
      changes: { components: [{ type: 'bar', size: { height: 12 } }] },
      validateSchema: false,
      emit: false,
    };

    update(null, opts);
    update(null, opts);

    expect(tryApplyItemComponentChanges).toHaveBeenCalledTimes(2);
    expect(flushParticleChildrenUpdate).not.toHaveBeenCalled();

    flushQueuedItemComponentUpdates();

    expect(flushParticleChildrenUpdate).toHaveBeenCalledOnce();
  });
});
