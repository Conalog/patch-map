import { describe, expect, it, vi } from 'vitest';

import type { CoreView } from '../../src/dense/contracts';
import type {
  CoreRenderer,
  RendererFlushResult,
  RenderStoreView,
} from '../../src/dense/renderer-types';
import { PatchMapRendererLease } from '../../src/core/renderer-lease';

describe('PatchMap renderer lease', () => {
  it('forwards renderer reads and writes in caller order while active', () => {
    const fixture = rendererFixture();
    const lease = new PatchMapRendererLease(fixture.renderer);
    const view = Object.freeze({ x: 4, y: 5, scale: 2, rotation: 15 });
    const store = Object.freeze({}) as RenderStoreView;

    expect(lease.width).toBe(640);
    expect(lease.height).toBe(480);
    expect(lease.pixelRatio).toBe(2);
    expect(lease.destroyed).toBe(false);
    expect(lease.resize(800, 600, 1.5)).toBe(true);
    expect(lease.setView(view)).toBe(false);
    expect(lease.flush(store)).toBe(fixture.flushResult);

    expect(fixture.calls).toEqual([
      ['resize', 800, 600, 1.5],
      ['setView', view],
      ['flush', store],
    ]);
  });

  it('revokes itself idempotently without destroying the shared renderer', () => {
    const fixture = rendererFixture();
    const lease = new PatchMapRendererLease(fixture.renderer);

    expect(lease.destroy()).toBe(true);
    expect(lease.destroy()).toBe(false);
    expect(lease.destroyed).toBe(true);
    expect(lease.width).toBe(0);
    expect(lease.height).toBe(0);
    expect(lease.pixelRatio).toBe(1);
    expect(fixture.destroy).not.toHaveBeenCalled();

    expect(() => lease.resize(1, 1, 1)).toThrow(
      'PatchMapRuntime renderer lease is destroyed',
    );
    expect(() => lease.setView({ x: 0, y: 0, scale: 1 })).toThrow(
      'PatchMapRuntime renderer lease is destroyed',
    );
    expect(() => lease.flush(Object.freeze({}) as RenderStoreView)).toThrow(
      'PatchMapRuntime renderer lease is destroyed',
    );
    expect(fixture.calls).toEqual([]);
  });
});

function rendererFixture(): Readonly<{
  renderer: CoreRenderer;
  flushResult: RendererFlushResult;
  calls: unknown[][];
  destroy: ReturnType<typeof vi.fn>;
}> {
  const calls: unknown[][] = [];
  const flushResult = Object.freeze({ rendered: true, commandCount: 7 });
  const destroy = vi.fn(() => true);
  const renderer = {
    width: 640,
    height: 480,
    pixelRatio: 2,
    destroyed: false,
    resize: (width: number, height: number, pixelRatio?: number) => {
      calls.push(['resize', width, height, pixelRatio]);
      return true;
    },
    setView: (view: CoreView) => {
      calls.push(['setView', view]);
      return false;
    },
    flush: (store: RenderStoreView) => {
      calls.push(['flush', store]);
      return flushResult;
    },
    destroy,
  } as CoreRenderer;
  return { renderer, flushResult, calls, destroy };
}
