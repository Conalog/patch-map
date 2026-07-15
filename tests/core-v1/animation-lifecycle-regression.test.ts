import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/core-v1/contracts';
import { CoreDestroyedError } from '../../src/core-v1/errors';
import { NoopRenderer } from '../../src/core-v1/renderer/noop-renderer';
import { createCoreScene } from '../../src/core-v1/scene';

const DOCUMENT: SceneDocument = {
  version: 1,
  entities: [
    {
      kind: 'rect',
      id: 'a',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      rotation: 0,
      opacity: 0.8,
      fill: 0x336699ff,
    },
    {
      kind: 'rect',
      id: 'b',
      x: 30,
      y: 0,
      width: 20,
      height: 10,
      fill: 0x22aa66ff,
    },
  ],
};

describe('Core v1 animation and history boundaries', () => {
  it('does not create history for animation-only commits, including duration zero', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);

    scene.commit({
      operations: [{ type: 'animate', target: 'a', property: 'x', to: 40, durationMs: 100 }],
    });
    expect(scene.canUndo()).toBe(false);
    expect(scene.activeAnimations).toBe(1);

    scene.commit({
      operations: [{ type: 'animate', target: 'b', property: 'x', to: 80, durationMs: 0 }],
    });
    expect(scene.get('b')?.bounds.x).toBe(80);
    expect(scene.canUndo()).toBe(false);
  });

  it('records state operations but excludes duration-zero animation state from undo and redo', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);

    scene.commit({
      operations: [
        { type: 'patch', target: 'a', changes: { y: 25 } },
        { type: 'animate', target: 'a', property: 'x', to: 90, durationMs: 0 },
      ],
    });

    expect(scene.get('a')?.bounds).toMatchObject({ x: 90, y: 25 });
    expect(scene.canUndo()).toBe(true);
    expect(scene.undo()).toBe(true);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 90, y: 0 });
    expect(scene.redo()).toBe(true);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 90, y: 25 });
  });

  it('preserves a later non-history immediate animation across an existing redo entry', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);
    scene.commit({ operations: [{ type: 'patch', target: 'a', changes: { y: 25 } }] });
    expect(scene.undo()).toBe(true);

    scene.commit({
      operations: [{ type: 'animate', target: 'a', property: 'x', to: 90, durationMs: 0 }],
    });

    expect(scene.canRedo()).toBe(true);
    expect(scene.redo()).toBe(true);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 90, y: 25 });
  });

  it('keeps a non-history animation alive while undoing and redoing mixed state', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);
    scene.commit({
      operations: [
        { type: 'patch', target: 'a', changes: { y: 25 } },
        { type: 'animate', target: 'a', property: 'x', to: 100, durationMs: 100 },
      ],
    });

    scene.advance(50);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 50, y: 25 });
    expect(scene.undo()).toBe(true);
    expect(scene.activeAnimations).toBe(1);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 50, y: 0 });

    scene.advance(100);
    expect(scene.activeAnimations).toBe(0);
    expect(scene.get('a')?.bounds.x).toBe(100);
    expect(scene.redo()).toBe(true);
    expect(scene.get('a')?.bounds).toMatchObject({ x: 100, y: 25 });
  });

  it('does not clear an animation on an unrelated entity during undo', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);
    scene.commit({
      operations: [{ type: 'animate', target: 'a', property: 'x', to: 100, durationMs: 100 }],
    });
    scene.commit({
      operations: [{ type: 'patch', target: 'b', changes: { y: 20 } }],
    });

    scene.advance(50);
    expect(scene.undo()).toBe(true);
    expect(scene.activeAnimations).toBe(1);
    expect(scene.get('a')?.bounds.x).toBe(50);
    expect(scene.get('b')?.bounds.y).toBe(0);
    scene.advance(100);
    expect(scene.get('a')?.bounds.x).toBe(100);
  });

  it('cancels animations immediately when their entity is removed or replaced', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    scene.commit({
      operations: [
        { type: 'animate', target: 'a', property: 'x', to: 100, durationMs: 100 },
        { type: 'animate', target: 'b', property: 'x', to: 130, durationMs: 100 },
      ],
    });
    expect(scene.activeAnimations).toBe(2);

    scene.commit({ operations: [{ type: 'remove', target: 'a' }] });
    expect(scene.activeAnimations).toBe(1);

    const previous = scene.ref('b');
    scene.commit({
      operations: [
        { type: 'remove', target: 'b' },
        {
          type: 'add',
          entity: { kind: 'rect', id: 'b', x: 5, y: 5, width: 5, height: 5, fill: 0xffffffff },
        },
      ],
    });
    expect(scene.activeAnimations).toBe(0);
    expect(scene.get(previous!)).toBeNull();
    expect(scene.get('b')?.bounds.x).toBe(5);
  });

  it('reports no repeated Float32 changes at the same timestamp and converges deterministically', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    scene.commit({
      operations: [
        { type: 'animate', target: 'a', property: 'rotation', to: 10.1, durationMs: 100 },
        { type: 'animate', target: 'a', property: 'opacity', to: 0.1, durationMs: 100 },
      ],
    });

    expect(scene.advance(33.333).changed).toBe(2);
    const revision = scene.revision;
    expect(scene.advance(33.333)).toMatchObject({ changed: 0, revision });

    expect(scene.advance(100)).toMatchObject({ changed: 2, activeAnimations: 0 });
    expect(scene.get('a')).toMatchObject({
      rotation: Math.fround(10.1),
      opacity: Math.fround(0.1),
    });
    const finalRevision = scene.revision;
    expect(scene.advance(100)).toMatchObject({ changed: 0, revision: finalRevision, activeAnimations: 0 });
  });
});

describe('Core v1 exceptional destruction', () => {
  it('cleans core-owned state before propagating a custom renderer destroy error', () => {
    const scene = createCoreScene({ renderer: new ThrowingRenderer(), historyLimit: 4 });
    scene.load(DOCUMENT);
    scene.commit({
      operations: [
        { type: 'selection', targets: ['a'] },
        { type: 'patch', target: 'a', changes: { x: 2 } },
        { type: 'animate', target: 'b', property: 'x', to: 80, durationMs: 100 },
      ],
    });

    expect(() => scene.destroy()).toThrow('renderer destroy failed');
    const internals = scene as unknown as {
      readonly animations: { readonly count: number };
      readonly store: { isDestroyed(): boolean };
      readonly events: readonly unknown[];
      readonly undoStack: readonly unknown[];
      readonly redoStack: readonly unknown[];
      readonly selectedIds: ReadonlySet<string>;
      readonly renderer: unknown;
    };
    expect(internals.animations.count).toBe(0);
    expect(internals.store.isDestroyed()).toBe(true);
    expect(internals.events).toHaveLength(0);
    expect(internals.undoStack).toHaveLength(0);
    expect(internals.redoStack).toHaveLength(0);
    expect(internals.selectedIds.size).toBe(0);
    expect(internals.renderer).toBeNull();

    expect(scene.destroy()).toBe(false);
    expect(() => scene.revision).toThrow(CoreDestroyedError);
    expect(() => scene.entityCount).toThrow(CoreDestroyedError);
    expect(() => scene.activeAnimations).toThrow(CoreDestroyedError);
    expect(() => scene.canUndo()).toThrow(CoreDestroyedError);
    expect(() => scene.canRedo()).toThrow(CoreDestroyedError);
    expect(() => scene.drainEvents()).toThrow(CoreDestroyedError);
  });
});

class ThrowingRenderer extends NoopRenderer {
  public override destroy(): boolean {
    super.destroy();
    throw new Error('renderer destroy failed');
  }
}
