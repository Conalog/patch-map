import { describe, expect, it } from 'vitest';

import { CoreDestroyedError } from '../../src/core-v1/errors';
import type { CoreRenderer, RenderStoreView } from '../../src/core-v1/renderer/types';
import { createCoreScene } from '../../src/core-v1/scene';
import type { CoreView, SceneDocument } from '../../src/core-v1/contracts';

class RecordingRenderer implements CoreRenderer {
  public width = 800;
  public height = 600;
  public pixelRatio = 1;
  public destroyed = false;
  public flushes = 0;
  public lastRevision = -1;

  public resize(width: number, height: number, pixelRatio = 1): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(_view: CoreView): boolean {
    return false;
  }

  public flush(store: RenderStoreView): { rendered: boolean; commandCount: number } {
    this.flushes += 1;
    const rendered = store.revision !== this.lastRevision;
    this.lastRevision = store.revision;
    return { rendered, commandCount: rendered ? store.liveCount : 0 };
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
}

const DOCUMENT: SceneDocument = {
  version: 1,
  entities: [
    {
      kind: 'rect',
      id: 'a',
      x: 10,
      y: 10,
      width: 100,
      height: 60,
      fill: 0x336699ff,
    },
    {
      kind: 'bar',
      id: 'b',
      x: 140,
      y: 10,
      width: 100,
      height: 20,
      value: 0.25,
      fill: 0x22aa66ff,
      trackFill: 0xdde3e8ff,
    },
    {
      kind: 'relation',
      id: 'edge',
      from: 'a',
      to: 'b',
      color: 0x222222ff,
      lineWidth: 2,
      zIndex: -1,
    },
  ],
};

describe('CoreScene', () => {
  it('loads caller input atomically and publishes only at flush', () => {
    const renderer = new RecordingRenderer();
    const scene = createCoreScene({ renderer });
    const before = JSON.stringify(DOCUMENT);

    const loaded = scene.load(DOCUMENT);

    expect(JSON.stringify(DOCUMENT)).toBe(before);
    expect(loaded.entityCount).toBe(3);
    expect(scene.get('a')?.bounds.x).toBe(10);
    expect(renderer.flushes).toBe(0);

    const committed = scene.commit({
      operations: [{ type: 'patch', target: 'a', changes: { x: 24 } }],
    });
    expect(scene.get('a')?.bounds.x).toBe(24);
    expect(committed.changed).toBe(1);
    expect(renderer.flushes).toBe(0);

    const frame = scene.flush();
    expect(frame.rendered).toBe(true);
    expect(frame.commandCount).toBe(3);
    expect(renderer.flushes).toBe(1);
    expect(scene.flush().rendered).toBe(false);
  });

  it('rejects a later invalid operation without leaking earlier changes', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    const revision = scene.revision;

    expect(() =>
      scene.commit({
        operations: [
          { type: 'patch', target: 'a', changes: { x: 999 } },
          { type: 'patch', target: 'missing', changes: { x: 4 } },
        ],
      }),
    ).toThrow('Unknown or stale entity target: missing');

    expect(scene.revision).toBe(revision);
    expect(scene.get('a')?.bounds.x).toBe(10);
    expect(scene.drainEvents().map((event) => event.type)).toEqual(['load']);
  });

  it('supports ordered add/patch/relation operations and protects endpoints', () => {
    const scene = createCoreScene();
    scene.load({ version: 1, entities: [] });

    scene.commit({
      operations: [
        {
          type: 'add',
          entity: { kind: 'rect', id: 'left', x: 0, y: 0, width: 20, height: 20, fill: 1 },
        },
        { type: 'patch', target: 'left', changes: { x: 5 } },
        {
          type: 'add',
          entity: { kind: 'rect', id: 'right', x: 50, y: 0, width: 20, height: 20, fill: 2 },
        },
        {
          type: 'add',
          entity: { kind: 'relation', id: 'link', from: 'left', to: 'right', color: 3 },
        },
      ],
    });

    expect(scene.get('left')?.bounds.x).toBe(5);
    expect(scene.get('link')?.data).toMatchObject({ from: 'left', to: 'right' });
    expect(() => scene.commit({ operations: [{ type: 'remove', target: 'right' }] })).toThrow(
      'relation.link.to: unknown ID right',
    );
    expect(scene.get('right')).not.toBeNull();
  });

  it('invalidates generation refs on reload and slot reuse', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    const first = scene.ref('a');
    expect(first).not.toBeNull();

    scene.load(DOCUMENT);

    expect(scene.get(first!)).toBeNull();
    expect(scene.ref('a')?.generation).not.toBe(first?.generation);

    const removed = scene.ref('a');
    scene.commit({ operations: [{ type: 'remove', target: 'edge' }, { type: 'remove', target: 'a' }] });
    scene.commit({
      operations: [
        {
          type: 'add',
          entity: { kind: 'rect', id: 'replacement', x: 0, y: 0, width: 1, height: 1, fill: 0 },
        },
      ],
    });
    expect(scene.get(removed!)).toBeNull();
  });

  it('advances animations only from supplied monotonic time', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    scene.commit({
      operations: [
        { type: 'animate', target: 'b', property: 'value', to: 1, durationMs: 100 },
      ],
    });

    expect(scene.get('b')?.data.value).toBe(0.25);
    expect(scene.advance(50).changed).toBe(1);
    expect(scene.get('b')?.data.value).toBeCloseTo(0.625);
    expect(scene.advance(100).activeAnimations).toBe(0);
    expect(scene.get('b')?.data.value).toBe(1);
    expect(() => scene.advance(99)).toThrow('expected a finite monotonic time');
  });

  it('uses explicit hit testing, selection, and grouped history', () => {
    const scene = createCoreScene({ historyLimit: 8 });
    scene.load(DOCUMENT);
    const hit = scene.hitTest({ x: 20, y: 20 });
    expect(scene.get(hit!)?.id).toBe('a');

    const pointer = scene.dispatchPointer({
      type: 'down',
      pointerId: 1,
      x: 20,
      y: 20,
      timeMs: 10,
    });
    expect(scene.get(pointer.selection.refs[0]!)?.id).toBe('a');

    scene.commit({ id: 'drag', operations: [{ type: 'patch', target: 'a', changes: { x: 30 } }] });
    scene.commit({ id: 'drag', operations: [{ type: 'patch', target: 'a', changes: { x: 40 } }] });
    expect(scene.get('a')?.bounds.x).toBe(40);
    expect(scene.undo()).toBe(true);
    expect(scene.get('a')?.bounds.x).toBe(10);
    expect(scene.redo()).toBe(true);
    expect(scene.get('a')?.bounds.x).toBe(40);
  });

  it('releases lifecycle state idempotently', () => {
    const renderer = new RecordingRenderer();
    const scene = createCoreScene({ renderer });
    scene.load(DOCUMENT);

    expect(scene.destroy()).toBe(true);
    expect(scene.destroy()).toBe(false);
    expect(renderer.destroyed).toBe(true);
    expect(() => scene.get('a')).toThrow(CoreDestroyedError);
  });
});
