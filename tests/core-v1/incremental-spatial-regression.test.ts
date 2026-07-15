import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/core-v1/contracts';
import { createCoreScene } from '../../src/core-v1/scene';

describe('Core v1 incremental spatial and adjacency indexes', () => {
  it('moves a geometry slot between buckets without leaving a stale hit', () => {
    const scene = createCoreScene();
    scene.load({ version: 1, entities: [rect('moving', 0, 0)] });

    expect(idAt(scene, 10, 10)).toBe('moving');
    scene.commit({ operations: [{ type: 'patch', target: 'moving', changes: { x: 500 } }] });
    expect(idAt(scene, 10, 10)).toBeNull();
    expect(idAt(scene, 510, 10)).toBe('moving');
  });

  it('refreshes only adjacent relation bounds when an endpoint moves or animates', () => {
    const scene = createCoreScene();
    scene.load(relationDocument());

    expect(idAt(scene, 55, 5)).toBe('edge');
    scene.commit({ operations: [{ type: 'patch', target: 'to', changes: { y: 100 } }] });
    expect(idAt(scene, 55, 5)).toBeNull();
    expect(idAt(scene, 55, 55)).toBe('edge');

    scene.commit({
      operations: [{ type: 'animate', target: 'to', property: 'y', to: 200, durationMs: 0 }],
    });
    expect(idAt(scene, 55, 55)).toBeNull();
    expect(idAt(scene, 55, 105)).toBe('edge');

    scene.commit({
      operations: [{ type: 'animate', target: 'to', property: 'y', to: 300, durationMs: 100 }],
    });
    scene.advance(50);
    expect(idAt(scene, 55, 130)).toBe('edge');
    expect(idAt(scene, 55, 105)).toBeNull();
  });

  it('reconnects adjacency when an endpoint ID is replaced into another slot', () => {
    const scene = createCoreScene();
    scene.load({
      ...relationDocument(),
      entities: [
        rect('from', 0, 0),
        rect('to', 100, 0),
        rect('spare', 200, 0),
        relation('edge', 'from', 'to'),
      ],
    });
    const stale = scene.ref('from');

    scene.commit({
      operations: [
        { type: 'remove', target: 'from' },
        { type: 'remove', target: 'spare' },
        { type: 'add', entity: rect('from', 0, 100) },
      ],
    });

    expect(scene.get(stale!)).toBeNull();
    expect(scene.ref('from')?.slot).not.toBe(stale?.slot);
    expect(idAt(scene, 55, 55)).toBe('edge');
    expect(idAt(scene, 55, 5)).toBeNull();
  });

  it('restores adjacent relation hit bounds through history', () => {
    const scene = createCoreScene({ historyLimit: 4 });
    scene.load(relationDocument());
    scene.commit({ operations: [{ type: 'patch', target: 'to', changes: { y: 100 } }] });
    expect(idAt(scene, 55, 55)).toBe('edge');

    expect(scene.undo()).toBe(true);
    expect(idAt(scene, 55, 55)).toBeNull();
    expect(idAt(scene, 55, 5)).toBe('edge');
    expect(scene.redo()).toBe(true);
    expect(idAt(scene, 55, 55)).toBe('edge');
  });

  it('uses ID-indexed query candidates while preserving deterministic render order', () => {
    const scene = createCoreScene();
    scene.load({
      version: 1,
      entities: [
        { ...rect('high', 0, 0), zIndex: 10 },
        { ...rect('low', 0, 0), zIndex: -2 },
        { ...rect('middle', 0, 0), zIndex: 4 },
      ],
    });

    const ids = scene
      .query({ ids: ['high', 'missing', 'low', 'high'] })
      .map((ref) => scene.get(ref)?.id);
    expect(ids).toEqual(['low', 'high']);
  });
});

function idAt(scene: ReturnType<typeof createCoreScene>, x: number, y: number): string | null {
  const hit = scene.hitTest({ x, y });
  return hit ? scene.get(hit)?.id ?? null : null;
}

function relationDocument(): SceneDocument {
  return {
    version: 1,
    entities: [rect('from', 0, 0), rect('to', 100, 0), relation('edge', 'from', 'to')],
  };
}

function rect(id: string, x: number, y: number) {
  return {
    kind: 'rect' as const,
    id,
    x,
    y,
    width: 10,
    height: 10,
    fill: 0x336699ff,
    interactive: true,
  };
}

function relation(id: string, from: string, to: string) {
  return {
    kind: 'relation' as const,
    id,
    from,
    to,
    color: 0xff00ffff,
    lineWidth: 6,
    interactive: true,
    zIndex: 10,
  };
}
