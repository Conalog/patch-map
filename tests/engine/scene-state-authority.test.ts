import { describe, expect, it } from 'vitest';

import { PatchMapSceneStateAuthority } from '../../src/engine/scene-state-authority';
import {
  indexComponentSemantics,
  indexTextSemantics,
} from '../../src/engine/semantic-index';
import { materializePatchMapDataset } from '../../src/semantic/dataset';

const FIRST_SCENE = [{
  type: 'item',
  id: 'item-a',
  size: { width: 100, height: 80 },
  components: [
    {
      type: 'bar',
      id: 'bar-a',
      source: { type: 'rect', fill: '#008866' },
      size: { width: 60, height: 20 },
    },
    { type: 'text', id: 'label-a', text: 'Alpha' },
  ],
}] as const;

const SECOND_SCENE = [{
  type: 'rect',
  id: 'rect-b',
  size: { width: 40, height: 30 },
  fill: '#ff8800',
}] as const;

describe('PatchMapSceneStateAuthority', () => {
  it('prepares a replacement without publishing it and commits one frozen snapshot', () => {
    const authority = createAuthority();
    const materialized = materializePatchMapDataset(FIRST_SCENE);
    const plan = authority.prepareReplacement({
      materialized,
      componentSemantics: indexComponentSemantics(materialized.dataset),
      textSemantics: indexTextSemantics(materialized.dataset),
      datasetRef: 'scene:first',
    });

    expect(authority.snapshot()).toMatchObject({
      materialized: null,
      selectionIds: [],
      datasetRef: null,
      targetLifecycleGeneration: 0,
    });

    const committed = authority.commit(plan);

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(committed)).toBe(true);
    expect(committed).toMatchObject({
      materialized,
      selectionIds: [],
      datasetRef: 'scene:first',
      targetLifecycleGeneration: 1,
    });
    expect(authority.findTarget({ kind: 'element', id: 'item-a' })).toMatchObject({
      id: 'item-a',
      type: 'item',
    });
    expect(authority.findTarget({
      kind: 'component',
      ownerId: 'item-a',
      id: 'bar-a',
    })).toMatchObject({ id: 'bar-a', type: 'bar' });
    expect(authority.findElement('item-a')).toMatchObject({ id: 'item-a' });
  });

  it('keeps the live scene unchanged until an immutable mutation plan commits', () => {
    const authority = createAuthority();
    const first = materializePatchMapDataset(FIRST_SCENE);
    authority.commit(authority.prepareReplacement({
      materialized: first,
      componentSemantics: indexComponentSemantics(first.dataset),
      textSemantics: indexTextSemantics(first.dataset),
      datasetRef: 'scene:first',
    }));
    const previousIndex = authority.logicalSceneIndex();
    const second = materializePatchMapDataset(SECOND_SCENE);
    const plan = authority.prepareMutation({
      materialized: second,
      componentSemantics: indexComponentSemantics(second.dataset),
      textSemantics: indexTextSemantics(second.dataset),
      selectionIds: ['rect-b'],
    });

    expect(authority.materialized).toBe(first);
    expect(authority.selectionIds).toEqual([]);
    expect(previousIndex.target('item-a')).not.toBeNull();

    authority.commit(plan);

    expect(authority.materialized).toBe(second);
    expect(authority.selectionIds).toEqual(['rect-b']);
    expect(Object.isFrozen(authority.selectionIds)).toBe(true);
    expect(authority.datasetRef).toBe('scene:first');
    expect(authority.targetLifecycleGeneration).toBe(1);
    expect(authority.logicalSceneIndex()).not.toBe(previousIndex);
    expect(authority.logicalSceneIndex().target('rect-b')).not.toBeNull();
  });

  it('owns selection replacement, host-generation invalidation, and teardown', () => {
    const authority = createAuthority();
    const materialized = materializePatchMapDataset(FIRST_SCENE);
    authority.commit(authority.prepareReplacement({
      materialized,
      componentSemantics: indexComponentSemantics(materialized.dataset),
      textSemantics: indexTextSemantics(materialized.dataset),
      datasetRef: null,
    }));

    const selected = authority.replaceSelection(['item-a', 'item-a/bar-a']);
    expect(selected).toEqual(['item-a', 'item-a/bar-a']);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(authority.rebindHostSelection([])).toEqual([]);
    expect(authority.targetLifecycleGeneration).toBe(2);

    authority.destroy();

    expect(authority.snapshot()).toMatchObject({
      materialized: null,
      selectionIds: [],
      datasetRef: null,
      targetLifecycleGeneration: 2,
    });
    expect(authority.findElement('item-a')).toBeNull();
  });
});

function createAuthority(): PatchMapSceneStateAuthority {
  return new PatchMapSceneStateAuthority(materializePatchMapDataset([]));
}
