import { describe, expect, it } from 'vitest';
import { Container, Graphics, Matrix } from 'pixi.js';

import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import {
  createPatchMapProjectionQuadCache,
  type PatchMapProjectionRenderContext,
} from '../../src/patch-map/renderers/types';
import { PatchMapPixiInteractionOverlayAuthority } from '../../src/patch-map/renderers/pixi-renderer/interaction-overlay-authority';
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
    const worldMatrix = new Matrix(1, 0, 0, 1, 0, 0);
    const { authority, store, projectionReadCount } = overlayAuthority(
      worldMatrix,
      emptyProjection(),
    );

    authority.synchronize(store, true, undefined);
    expect(authority.probe().redrawCount).toBe(1);
    expect(projectionReadCount()).toBe(1);
    authority.synchronize(store, false, []);
    expect(authority.probe().redrawCount).toBe(1);
    expect(projectionReadCount()).toBe(1);

    worldMatrix.set(2, 0, 0, 2, 0, 0);
    authority.synchronize(store, false, []);
    authority.synchronize(store, false, []);
    expect(authority.probe().redrawCount).toBe(2);
    expect(projectionReadCount()).toBe(2);

    worldMatrix.tx = 20;
    authority.synchronize(store, false, []);
    expect(authority.probe().redrawCount).toBe(2);
    expect(projectionReadCount()).toBe(2);

    authority.setMarquee({ start: [10, 10], current: [40, 30] }, store);
    authority.synchronize(store, false, []);
    authority.synchronize(store, false, []);
    expect(authority.probe().redrawCount).toBe(3);
    expect(projectionReadCount()).toBe(3);
    authority.destroy();
  });

  it('indexes owner paint bounds once per immutable projection identity', () => {
    const { authority } = overlayAuthority(new Matrix(), emptyProjection());
    const firstProjection = projection('first-background');

    const first = authority.resolvePaintBoundsIndex(firstProjection);
    const retained = authority.resolvePaintBoundsIndex(firstProjection);
    expect(retained).toBe(first);
    expect(first.get('owner')).toEqual(['first-background']);

    const replacement = authority.resolvePaintBoundsIndex(projection('replacement-background'));
    expect(replacement).not.toBe(first);
    expect(replacement.get('owner')).toEqual(['replacement-background']);
    authority.destroy();
  });

  it('owns stable Graphics, slot filtering, dirty updates, probes, and destruction', () => {
    const worldMatrix = new Matrix();
    const store = overlayStore();
    const projectionContext = overlayProjectionContext(emptyProjection());
    const authority = new PatchMapPixiInteractionOverlayAuthority({
      worldMatrix,
      slotByEntityId: new Map([['rect', 0], ['relation', 1]]),
      readProjectionContext: () => projectionContext,
    });
    const selection = authority.selectionGraphics;
    const transformer = authority.transformerGraphics;

    expect([selection.zIndex, transformer.zIndex]).toEqual([1, 2]);
    expect([selection.eventMode, transformer.eventMode]).toEqual(['none', 'none']);
    expect([selection.label, transformer.label]).toEqual([
      'PatchMap / selection overlay (0)',
      'PatchMap / transformer overlay (0)',
    ]);
    const world = new Container();
    const scene = new Container();
    world.addChild(scene);
    authority.attachToTail(world);
    expect(world.children).toEqual([scene, selection, transformer]);
    authority.synchronize(store, true, undefined);
    expect(authority.probe()).toMatchObject({
      selection: true,
      transformer: true,
      selectedEntityCount: 1,
      renderObjectCount: 2,
      outlineCount: 1,
    });
    expect(authority.visiblePrimitiveCount).toBe(2);

    (store.flags as Uint32Array)[0] = RenderFlags.Visible;
    authority.synchronize(store, false, [{ start: 0, end: 1 }]);
    expect(authority.probe()).toMatchObject({
      selection: false,
      selectedEntityCount: 0,
      renderObjectCount: 0,
    });

    (store.flags as Uint32Array)[0] = RenderFlags.Visible | RenderFlags.Selected;
    authority.synchronize(store, false, [{ start: 0, end: 1 }]);
    expect(authority.setPolicy({
      ...DEFAULT_INTERACTION_OVERLAY_POLICY,
      visibleEntityIds: ['rect'],
      transformableEntityIds: [],
      resizableEntityIds: [],
    }, store)).toBe(true);
    expect(authority.probe()).toMatchObject({ selection: true, transformer: false });
    expect(authority.selectionGraphics).toBe(selection);
    expect(authority.transformerGraphics).toBe(transformer);

    expect(authority.setPolicy(DEFAULT_INTERACTION_OVERLAY_POLICY, store)).toBe(true);
    authority.resetSelection();
    (store.flags as Uint32Array)[0] = RenderFlags.Visible;
    authority.synchronize(store, true, undefined);
    expect(authority.probe()).toMatchObject({
      selection: false,
      selectedEntityCount: 0,
      renderObjectCount: 0,
    });
    expect(authority.destroy()).toBe(true);
    expect(authority.destroy()).toBe(false);
    expect(authority.probe()).toMatchObject({
      selection: false,
      transformer: false,
      selectedEntityCount: 0,
      renderObjectCount: 0,
      redrawCount: 0,
    });
    expect(selection.destroyed).toBe(true);
    expect(transformer.destroyed).toBe(true);
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

function emptyProjection(): PatchMapProjectionIndex {
  return Object.freeze({ byEntityId: Object.freeze({}) });
}

function overlayAuthority(worldMatrix: Matrix, index: PatchMapProjectionIndex) {
  const projectionContext = overlayProjectionContext(index);
  let projectionReads = 0;
  return {
    authority: new PatchMapPixiInteractionOverlayAuthority({
      worldMatrix,
      slotByEntityId: new Map<string, number>(),
      readProjectionContext: () => {
        projectionReads += 1;
        return projectionContext;
      },
    }),
    store: { capacity: 0 } as RenderStoreView,
    projectionReadCount: () => projectionReads,
  };
}

function overlayProjectionContext(
  index: PatchMapProjectionIndex,
): PatchMapProjectionRenderContext {
  return Object.freeze({
    index,
    revision: 0,
    world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    staleEntityIds: new Set<string>(),
    quadCache: createPatchMapProjectionQuadCache(),
  });
}

function overlayStore(): RenderStoreView {
  return {
    capacity: 2,
    liveCount: 2,
    revision: 1,
    alive: new Uint8Array([1, 1]),
    kind: new Uint8Array([RenderKind.Rect, RenderKind.Relation]),
    flags: new Uint32Array([
      RenderFlags.Visible | RenderFlags.Selected,
      RenderFlags.Visible | RenderFlags.Selected,
    ]),
    ids: ['rect', 'relation'],
    x: new Float32Array([10, 0]),
    y: new Float32Array([20, 0]),
    width: new Float32Array([40, 0]),
    height: new Float32Array([30, 0]),
    rotation: new Float32Array(2),
    opacity: new Float32Array([1, 1]),
    stroke: new Uint32Array(2),
    strokeWidth: new Float32Array(2),
  } as unknown as RenderStoreView;
}
