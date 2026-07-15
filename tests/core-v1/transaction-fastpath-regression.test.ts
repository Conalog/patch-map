import { describe, expect, it } from 'vitest';

import { createCoreScene } from '../../src/core-v1/scene';

describe('Core v1 canonical transaction fast path', () => {
  it('copies caller-owned tag patches and preserves ordered repeated patches', () => {
    const scene = createCoreScene();
    scene.load({
      version: 1,
      entities: [{ kind: 'rect', id: 'rect', x: 0, y: 0, width: 10, height: 10, fill: 0xffffffff }],
    });
    const tags = ['first'];

    scene.commit({
      operations: [
        { type: 'patch', target: 'rect', changes: { x: 20, tags } },
        { type: 'patch', target: 'rect', changes: { x: 30, visible: false } },
      ],
    });
    tags.push('caller-mutation');

    expect(scene.get('rect')).toMatchObject({
      bounds: { x: 30 },
      tags: ['first'],
      visible: false,
    });
  });

  it('keeps cross-field bar validation atomic without re-normalizing the full entity', () => {
    const scene = createCoreScene();
    scene.load({
      version: 1,
      entities: [
        { kind: 'bar', id: 'bar', x: 0, y: 0, width: 100, height: 10, value: 5, min: 0, max: 10, fill: 0x00ff00ff },
      ],
    });
    const before = scene.snapshot();
    const revision = scene.revision;

    expect(() =>
      scene.commit({
        operations: [
          { type: 'patch', target: 'bar', changes: { value: 7 } },
          { type: 'patch', target: 'bar', changes: { min: 12 } },
        ],
      }),
    ).toThrow('expected max to be greater than min');

    expect(scene.snapshot()).toEqual(before);
    expect(scene.revision).toBe(revision);
  });
});
