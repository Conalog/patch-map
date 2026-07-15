import { describe, expect, it } from 'vitest';

import type { CoreView, SceneDocument } from '../../src/core-v1/contracts';
import type { CoreRenderer, RenderStoreView } from '../../src/core-v1/renderer/types';
import { createCoreScene } from '../../src/core-v1/scene';

class SelectionRecordingRenderer implements CoreRenderer {
  public width = 100;
  public height = 100;
  public pixelRatio = 1;
  public destroyed = false;
  public selectedIds: readonly string[] = [];

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
    const selected: string[] = [];
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (store.alive[slot] === 1 && ((store.flags[slot] ?? 0) & 4) !== 0) {
        selected.push(store.ids[slot] ?? '');
      }
    }
    this.selectedIds = Object.freeze(selected);
    return { rendered: true, commandCount: store.liveCount };
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
}

describe('Core v1 spatial and selection regressions', () => {
  it('chooses the global topmost hit across a local bucket and spatial overflow', () => {
    const scene = createCoreScene();
    scene.load(overflowDocument(0, 0));

    expect(scene.get(scene.hitTest({ x: 64, y: 64 })!)?.id).toBe('long-relation');

    scene.commit({
      operations: [{ type: 'patch', target: 'local-rect', changes: { zIndex: 20 } }],
    });

    expect(scene.get(scene.hitTest({ x: 64, y: 64 })!)?.id).toBe('local-rect');
  });

  it('preserves selection identity and renderer flags across same-ID replacement', () => {
    const renderer = new SelectionRecordingRenderer();
    const scene = createCoreScene({ renderer, historyLimit: 4 });
    scene.load({
      version: 1,
      entities: [rect('selected', 0xff0000ff)],
    });
    scene.commit({
      operations: [{ type: 'selection', targets: ['selected'], mode: 'replace' }],
    });
    const previousRef = scene.ref('selected');

    scene.commit({
      operations: [
        { type: 'remove', target: 'selected' },
        { type: 'add', entity: rect('selected', 0x00ff00ff) },
      ],
    });

    const nextRef = scene.ref('selected');
    expect(nextRef).not.toEqual(previousRef);
    expect(scene.get(previousRef!)).toBeNull();
    expect(scene.selection().refs).toEqual([nextRef]);
    scene.flush();
    expect(renderer.selectedIds).toEqual(['selected']);

    expect(scene.undo()).toBe(true);
    expect(scene.selection().refs).toHaveLength(1);
    expect(scene.get(scene.selection().refs[0]!)?.id).toBe('selected');
    expect(scene.redo()).toBe(true);
    expect(scene.selection().refs).toHaveLength(1);
    expect(scene.get(scene.selection().refs[0]!)?.id).toBe('selected');
  });

  it('lets an explicit selection operation override replacement preservation', () => {
    const renderer = new SelectionRecordingRenderer();
    const scene = createCoreScene({ renderer });
    scene.load({ version: 1, entities: [rect('selected', 0xff0000ff)] });
    scene.commit({
      operations: [{ type: 'selection', targets: ['selected'], mode: 'replace' }],
    });

    scene.commit({
      operations: [
        { type: 'remove', target: 'selected' },
        { type: 'add', entity: rect('selected', 0x00ff00ff) },
        { type: 'selection', targets: ['selected'], mode: 'remove' },
      ],
    });

    expect(scene.selection().refs).toEqual([]);
    scene.flush();
    expect(renderer.selectedIds).toEqual([]);
  });
});

function overflowDocument(relationZ: number, rectZ: number): SceneDocument {
  return {
    version: 1,
    entities: [
      {
        kind: 'rect',
        id: 'from',
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        fill: 0,
        interactive: false,
      },
      {
        kind: 'rect',
        id: 'to',
        x: 4092,
        y: 4092,
        width: 8,
        height: 8,
        fill: 0,
        interactive: false,
      },
      {
        ...rect('local-rect', 0x123456ff),
        x: 48,
        y: 48,
        width: 32,
        height: 32,
        zIndex: rectZ,
      },
      {
        kind: 'relation',
        id: 'long-relation',
        from: 'from',
        to: 'to',
        color: 0xff00ffff,
        lineWidth: 8,
        interactive: true,
        zIndex: relationZ,
      },
    ],
  };
}

function rect(id: string, fill: number) {
  return {
    kind: 'rect' as const,
    id,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    fill,
    interactive: true,
  };
}
