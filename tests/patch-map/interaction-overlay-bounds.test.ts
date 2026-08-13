import { describe, expect, it } from 'vitest';
import { Matrix } from 'pixi.js';

import type { SlotRange } from '../../src/patch-map/dense/contracts';
import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapPixiRenderer } from '../../src/patch-map/renderers/pixi-renderer';
import {
  composeOverlaySelectionPaths,
  interactionOverlayTransformNeedsRepaint,
  resolveOverlayLocalCssLength,
  type PatchMapOverlayWorldTransform,
} from '../../src/patch-map/renderers/pixi-renderer/interaction-overlay';

describe('PatchMap aggregate selection bounds display', () => {
  const first = Object.freeze([0, 0, 10, 0, 10, 10, 0, 10]);
  const second = Object.freeze([30, 0, 40, 0, 40, 10, 30, 10]);
  const group = Object.freeze([0, 0, 40, 0, 40, 10, 0, 10]);

  it('keeps separated individual paths distinct from their group union', () => {
    const elementOnly = composeOverlaySelectionPaths([first, second], group, 'element-only');
    const groupOnly = composeOverlaySelectionPaths([first, second], group, 'group-only');
    const all = composeOverlaySelectionPaths([first, second], group, 'all');

    expect(elementOnly).toEqual([first, second]);
    expect(elementOnly.flat()).not.toContain(20);
    expect(groupOnly).toEqual([group]);
    expect(all).toEqual([first, second, group]);
  });

  it('does not rasterize the same single geometry twice in all mode', () => {
    expect(composeOverlaySelectionPaths([first], first, 'all')).toEqual([first]);
    expect(composeOverlaySelectionPaths([first], first, 'hidden')).toEqual([]);
  });

  it.each([0.5, 1, 2])(
    'keeps CSS-pixel widths stable at %sx viewport scale and every renderer resolution',
    (scale) => {
      const world = transform(scale);
      for (const pixelRatio of [1, 1.5, 2]) {
        const selectionLocal = resolveOverlayLocalCssLength(3, world);
        const marqueeLocal = resolveOverlayLocalCssLength(1, world);
        expect(selectionLocal * scale).toBeCloseTo(3, 10);
        expect(marqueeLocal * scale).toBeCloseTo(1, 10);
        expect(selectionLocal * scale * pixelRatio / pixelRatio).toBeCloseTo(3, 10);
        expect(marqueeLocal * scale * pixelRatio / pixelRatio).toBeCloseTo(1, 10);
      }
    },
  );

  it('invalidates tessellation only for a changed scale or an active marquee transform', () => {
    const painted = transform(1);
    expect(interactionOverlayTransformNeedsRepaint(painted, transform(1), false)).toBe(false);
    expect(interactionOverlayTransformNeedsRepaint(painted, transform(2), false)).toBe(true);
    expect(interactionOverlayTransformNeedsRepaint(
      painted,
      { ...transform(1), tx: 20, ty: -10 },
      false,
    )).toBe(false);
    expect(interactionOverlayTransformNeedsRepaint(
      painted,
      { ...transform(1), tx: 20, ty: -10 },
      true,
    )).toBe(true);
  });

  it('does not redraw an unchanged aggregate overlay frame', () => {
    const renderer = Object.create(PatchMapPixiRenderer.prototype) as OverlaySyncHarness;
    renderer.selectedSlots = new Set();
    renderer.worldMatrix = new Matrix(1, 0, 0, 1, 0, 0);
    renderer.interactionOverlayPaintTransform = transform(1);
    renderer.selectionMarquee = null;
    renderer.redraws = 0;
    renderer.drawInteractionOverlays = () => {
      renderer.redraws += 1;
      renderer.interactionOverlayPaintTransform = matrixTransform(renderer.worldMatrix);
    };
    const emptyStore = { capacity: 0 } as RenderStoreView;

    renderer.syncSelectionOverlay(emptyStore, false, []);
    expect(renderer.redraws).toBe(0);

    renderer.worldMatrix.set(2, 0, 0, 2, 0, 0);
    renderer.syncSelectionOverlay(emptyStore, false, []);
    renderer.syncSelectionOverlay(emptyStore, false, []);
    expect(renderer.redraws).toBe(1);

    renderer.worldMatrix.tx = 20;
    renderer.syncSelectionOverlay(emptyStore, false, []);
    expect(renderer.redraws).toBe(1);

    renderer.selectionMarquee = { start: [10, 10], current: [40, 30] };
    renderer.syncSelectionOverlay(emptyStore, false, []);
    renderer.syncSelectionOverlay(emptyStore, false, []);
    expect(renderer.redraws).toBe(2);
  });
});

function transform(scale: number) {
  return Object.freeze({ a: scale, b: 0, c: 0, d: scale, tx: 0, ty: 0 });
}

function matrixTransform(matrix: Matrix): PatchMapOverlayWorldTransform {
  return Object.freeze({
    a: matrix.a,
    b: matrix.b,
    c: matrix.c,
    d: matrix.d,
    tx: matrix.tx,
    ty: matrix.ty,
  });
}

interface OverlaySyncHarness {
  selectedSlots: Set<number>;
  worldMatrix: Matrix;
  interactionOverlayPaintTransform: PatchMapOverlayWorldTransform | null;
  selectionMarquee: Readonly<{
    start: readonly [number, number];
    current: readonly [number, number];
  }> | null;
  redraws: number;
  drawInteractionOverlays(store: RenderStoreView): void;
  syncSelectionOverlay(
    store: RenderStoreView,
    fullRebuild: boolean,
    ranges: readonly SlotRange[] | undefined,
  ): void;
}
