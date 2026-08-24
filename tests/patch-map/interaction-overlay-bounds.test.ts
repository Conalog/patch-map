import { describe, expect, it } from 'vitest';
import { Graphics, Matrix } from 'pixi.js';

import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { SlotRange } from '../../src/patch-map/dense/contracts';
import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapPixiRenderer } from '../../src/patch-map/renderers/pixi-renderer';
import {
  composeOverlaySelectionPaths,
  DEFAULT_INTERACTION_OVERLAY_POLICY,
  appendOverlayOutline,
  interactionOverlayTransformNeedsRepaint,
  normalizeInteractionOverlayPolicy,
  resolveOverlayLocalCssLength,
  resolveSelectionLocalStrokeWidth,
  resolveSelectionScreenStrokeWidth,
  resolveOverlayStrokeAlignment,
  sameInteractionOverlayPolicy,
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

  it.each([
    ['outside', 0],
    ['center', 0.5],
    ['inside', 1],
  ] as const)('maps public %s alignment only at the Pixi paint boundary', (alignment, pixi) => {
    expect(resolveOverlayStrokeAlignment(alignment)).toBe(pixi);
  });

  it('places actual Pixi path stroke outside, centered, or inside the semantic quad', () => {
    const bounds = (alignment: 'outside' | 'center' | 'inside') => {
      const graphics = new Graphics();
      appendOverlayOutline(graphics, first);
      graphics.stroke({
        color: 0xef4444,
        width: 3,
        alignment: resolveOverlayStrokeAlignment(alignment),
      });
      return graphics.bounds;
    };
    const outside = bounds('outside');
    const center = bounds('center');
    const inside = bounds('inside');
    expect(outside.x).toBeLessThan(center.x);
    expect(center.x).toBeLessThan(inside.x);
    expect(outside.right).toBeGreaterThan(center.right);
    expect(center.right).toBeGreaterThan(inside.right);
    expect(inside).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('treats a stroke-alignment policy change as one aggregate repaint invalidation', () => {
    const centered = normalizeInteractionOverlayPolicy(DEFAULT_INTERACTION_OVERLAY_POLICY);
    const outside = normalizeInteractionOverlayPolicy({
      ...DEFAULT_INTERACTION_OVERLAY_POLICY,
      strokeAlignment: 'outside',
    });
    expect(sameInteractionOverlayPolicy(centered, centered)).toBe(true);
    expect(sameInteractionOverlayPolicy(centered, outside)).toBe(false);
  });

  it('treats persistent stroke LOD changes as aggregate repaint invalidations', () => {
    const fixed = normalizeInteractionOverlayPolicy(DEFAULT_INTERACTION_OVERLAY_POLICY);
    const viewport = normalizeInteractionOverlayPolicy({
      ...DEFAULT_INTERACTION_OVERLAY_POLICY,
      strokeScale: 'viewport',
      minStrokeCssPx: 1,
    });
    const viewportHalfFloor = normalizeInteractionOverlayPolicy({
      ...viewport,
      minStrokeCssPx: 0.5,
    });
    expect(sameInteractionOverlayPolicy(fixed, viewport)).toBe(false);
    expect(sameInteractionOverlayPolicy(viewport, viewportHalfFloor)).toBe(false);
  });

  it.each([
    ['element-only', 2],
    ['group-only', 1],
    ['all', 3],
  ] as const)('keeps %s path composition independent from stroke placement', (mode, count) => {
    for (const alignment of ['outside', 'center', 'inside'] as const) {
      expect(resolveOverlayStrokeAlignment(alignment)).toBeGreaterThanOrEqual(0);
      expect(composeOverlaySelectionPaths([first, second], group, mode)).toHaveLength(count);
    }
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

  it.each([
    [1, 3],
    [0.5, 1.5],
    [0.1, 1],
    [5, 3],
  ] as const)(
    'scales viewport-linked persistent width at %sx to %s CSS px across DPR',
    (scale, expectedCssPx) => {
      const world = transform(scale);
      const screen = resolveSelectionScreenStrokeWidth(3, 'viewport', 1, world);
      const local = resolveSelectionLocalStrokeWidth(3, 'viewport', 1, world);
      expect(screen).toBeCloseTo(expectedCssPx, 10);
      expect(local * scale).toBeCloseTo(expectedCssPx, 10);
      for (const pixelRatio of [1, 2]) {
        expect(local * scale * pixelRatio / pixelRatio).toBeCloseTo(expectedCssPx, 10);
      }
    },
  );

  it('keeps the compatible fixed persistent width and fixed marquee width', () => {
    for (const scale of [0.1, 0.5, 1, 5]) {
      const world = transform(scale);
      expect(resolveSelectionScreenStrokeWidth(3, 'fixed', 1, world)).toBe(3);
      expect(resolveSelectionLocalStrokeWidth(3, 'fixed', 1, world) * scale).toBeCloseTo(3, 10);
      expect(resolveOverlayLocalCssLength(1, world) * scale).toBeCloseTo(1, 10);
    }
  });

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

  it('indexes owner paint bounds once per immutable projection identity', () => {
    const renderer = Object.create(PatchMapPixiRenderer.prototype) as OverlaySyncHarness;
    const firstProjection = projection('first-background');
    renderer.projectionIndex = firstProjection;
    renderer.overlayPaintBoundsProjection = null;
    renderer.overlayPaintBoundsIndex = new Map();

    const first = renderer.resolveOverlayPaintBoundsIndex();
    const retained = renderer.resolveOverlayPaintBoundsIndex();
    expect(retained).toBe(first);
    expect(first.get('owner')).toEqual(['first-background']);

    renderer.projectionIndex = projection('replacement-background');
    const replacement = renderer.resolveOverlayPaintBoundsIndex();
    expect(replacement).not.toBe(first);
    expect(replacement.get('owner')).toEqual(['replacement-background']);
  });
});

function projection(entityId: string): PatchMapProjectionIndex {
  return Object.freeze({
    byEntityId: Object.freeze({}),
    componentsByEntityId: Object.freeze({
      [entityId]: Object.freeze({
        entityId,
        ownerId: 'owner',
        componentId: 'background',
        componentType: 'background' as const,
        logicalIdentity: entityId,
        renderRole: 'background-geometry' as const,
      }),
    }),
    backgroundsByEntityId: Object.freeze({
      [entityId]: Object.freeze({
        entityId,
        sourceKind: 'rect' as const,
        fill: 0xffffffff,
        borderWidth: 2,
        borderColor: 0x063559ff,
        radius: Object.freeze([0, 0, 0, 0] as const),
        tint: 0xffffffff,
      }),
    }),
  });
}

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
  projectionIndex: PatchMapProjectionIndex;
  overlayPaintBoundsProjection: PatchMapProjectionIndex | null;
  overlayPaintBoundsIndex: ReadonlyMap<string, readonly string[]>;
  resolveOverlayPaintBoundsIndex(): ReadonlyMap<string, readonly string[]>;
  drawInteractionOverlays(store: RenderStoreView): void;
  syncSelectionOverlay(
    store: RenderStoreView,
    fullRebuild: boolean,
    ranges: readonly SlotRange[] | undefined,
  ): void;
}
