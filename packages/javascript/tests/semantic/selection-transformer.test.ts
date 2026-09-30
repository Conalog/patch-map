import { describe, expect, it } from 'vitest';

import { PatchMap } from '../../src/engine';
import { PatchMapLogicalSceneIndex } from '../../src/query-selection';
import { PatchMapTransformerGestureAuthority } from '../../src/selection-transformer/gesture-authority';
import {
  createPatchMapSelectionVisualProbe,
  createPatchMapTransformerHandleProbe,
  evaluatePatchMapTransformableSubset,
  hitPatchMapTransformerHandle,
  resolvePatchMapRelationEndpoints,
} from '../../src/selection-transformer';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import type {
  PatchMapSelectionFrameProbe,
  PatchMapTransformerTargetGeometry,
} from '../../src/selection-transformer/contracts';
import type { PatchMapSelectionOverlayPolicyInput } from '../../src/core/contracts';
import type { PatchMapEnginePointerInput } from '../../src/engine/contracts/rendering';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceDebug,
} from '../../src/engine/contracts';
import type {
  PatchMapPoint,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceView,
} from '../../src/engine/surface-contract';

describe('PatchMap aggregate selection and transformer substrate', () => {
  it('classifies the current logical transformable subset without renderer objects', () => {
    const index = sceneIndex();
    const subset = evaluatePatchMapTransformableSubset(
      index,
      ['item-a', 'rect-b', 'text-c', 'links'],
      ['text-c'],
    );

    expect(subset.rotatableTargets.map(({ selectionId }) => selectionId))
      .toEqual(['item-a', 'rect-b']);
    expect(subset.resizableTargets.map(({ selectionId }) => selectionId))
      .toEqual(['rect-b']);
    expect(subset.activeResizeHandles).toBe(true);
    expect(subset.subsetIndicator).toEqual({
      selected: 4,
      transformable: 2,
      resizable: 1,
    });
    expect(subset.eligibilityById).toEqual({
      'item-a': 'move-rotate',
      'rect-b': 'move-resize-rotate',
      'text-c': 'locked',
      links: 'ineligible',
    });

    const matrix = evaluatePatchMapTransformableSubset(
      index,
      ['group-a', 'grid-a', 'item-a', 'rect-b', 'image-a', 'text-c', 'links'],
      ['text-c'],
    );
    expect(matrix.eligibilityById).toEqual({
      'group-a': 'ineligible',
      'grid-a': 'move-rotate',
      'item-a': 'move-rotate',
      'rect-b': 'move-resize-rotate',
      'image-a': 'move-resize-rotate',
      'text-c': 'locked',
      links: 'ineligible',
    });
  });

  it('projects oriented single and union selection frames with explicit display modes', () => {
    const index = sceneIndex();
    const empty = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: [],
    });
    expect(empty).toMatchObject({ overlayCount: 0, frame: null });

    const single = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['rect-b'],
      handleCssPx: 8,
      strokeCssPx: 1,
      viewportScale: 1,
    });
    expect(single.frame).toMatchObject({
      kind: 'oriented',
      orientationDegrees: 30,
    });
    expect(single.overlayTargets.map(({ selectionId }) => selectionId))
      .toEqual(['rect-b']);
    expect(single).toMatchObject({ overlayCount: 1, groupFrame: null });
    expect(single.individualFrames).toHaveLength(1);

    const multi = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['item-a', 'rect-b'],
    });
    expect(multi.frame?.kind).toBe('axis-aligned-union');
    expect(multi).toMatchObject({ overlayCount: 3 });
    expect(multi.individualFrames).toHaveLength(2);
    expect(multi.groupFrame?.kind).toBe('axis-aligned-union');
    expect(multi.handleCssPx).toBe(8);
    expect(multi.strokeCssPx).toBe(1);

    const groupOnly = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['group-a', 'rect-b'],
      mode: 'group-only',
    });
    expect(groupOnly.overlayTargets.map(({ selectionId }) => selectionId))
      .toEqual(['group-a', 'rect-b']);
    expect(groupOnly).toMatchObject({ overlayCount: 1, individualFrames: [] });
    expect(groupOnly.groupFrame?.kind).toBe('axis-aligned-union');

    const elementOnly = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['group-a', 'rect-b'],
      mode: 'element-only',
    });
    expect(elementOnly.overlayTargets.map(({ selectionId }) => selectionId))
      .toEqual(['group-a', 'rect-b']);
    expect(elementOnly).toMatchObject({ overlayCount: 2, groupFrame: null });
    expect(elementOnly.individualFrames).toHaveLength(2);

    const mixed = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['group-a', 'rect-b', 'text-c'],
      rejectIds: ['text-c'],
    });
    expect(mixed.overlayTargets.map(({ selectionId }) => selectionId))
      .toEqual(['group-a', 'rect-b']);
    expect(mixed.explicitlyIndicatesTransformableSubset).toBe(true);

    const hidden = createPatchMapSelectionVisualProbe(index, GEOMETRIES, {
      selectionIds: ['rect-b'],
      mode: 'hidden',
    });
    expect(hidden).toMatchObject({ overlayCount: 0, frame: null });
  });

  it('builds stable CSS-space handles and resolves corner before edge and rotate', () => {
    const frame: PatchMapSelectionFrameProbe = Object.freeze({
      kind: 'oriented',
      orientationDegrees: 0,
      screenBounds: Object.freeze([160, 40, 40, 30] as const),
      screenCorners: Object.freeze([
        Object.freeze([160, 40] as const),
        Object.freeze([200, 40] as const),
        Object.freeze([200, 70] as const),
        Object.freeze([160, 70] as const),
      ] as const),
    });
    const handles = createPatchMapTransformerHandleProbe(frame, {
      cornerCssPx: 8,
      edgeStripCssPx: 6,
      rotateZoneCssPx: 12,
    });

    expect(handles.visibleCorners).toEqual(['nw', 'ne', 'sw', 'se']);
    expect(handles.overlapPriority).toEqual(['corner', 'edge', 'rotate', 'frame']);
    expect(handles.cursorDirectionByHandle).toMatchObject({
      nw: 'nwse-resize',
      n: 'ns-resize',
      e: 'ew-resize',
    });
    expect(hitPatchMapTransformerHandle(handles, [160, 40])).toBe('nw');
    expect(hitPatchMapTransformerHandle(handles, [180, 40])).toBe('n');
    expect(hitPatchMapTransformerHandle(handles, [180, 55])).toBe('frame');
    expect(hitPatchMapTransformerHandle(handles, [400, 400])).toBeNull();
  });

  it('resolves relation endpoints from the current scene without retaining stale targets', () => {
    const firstIndex = sceneIndex();
    const first = resolvePatchMapRelationEndpoints(
      materializedDataset(),
      firstIndex,
      ['links', 'links', 'missing-relation'],
    );
    expect(first.targets.map(({ selectionId }) => selectionId))
      .toEqual(['item-a', 'rect-b']);
    expect(first.missingRelationIds).toEqual(['missing-relation']);
    expect(first.missingEndpointIds).toEqual([]);
    expect(first.duplicateTargetCount).toBe(0);
    expect(first.suppressedDuplicateEndpointCount).toBeGreaterThan(0);
    expect(first.retainedEndpointSnapshotCount).toBe(0);

    const oldRect = first.targets.find(({ selectionId }) => selectionId === 'rect-b');
    const replacedDataset = materializedDataset().map((element) =>
      element.id === 'group-a'
        ? Object.freeze({
            ...element,
            children: element.type === 'group'
              ? Object.freeze(element.children.map((child) =>
                  child.id === 'rect-b'
                    ? Object.freeze({ ...child, label: 'replacement' })
                    : child))
              : Object.freeze([]),
          })
        : element);
    const nextIndex = new PatchMapLogicalSceneIndex(replacedDataset);
    const next = resolvePatchMapRelationEndpoints(replacedDataset, nextIndex, ['links']);
    const currentRect = next.targets.find(({ selectionId }) => selectionId === 'rect-b');
    expect(currentRect).not.toBe(oldRect);
    expect(currentRect).toBe(nextIndex.target('rect-b'));
    expect(next.retainedEndpointSnapshotCount).toBe(0);
  });

  it('gives one root transformer gesture exclusive input ownership and releases it', () => {
    const authority = new PatchMapTransformerGestureAuthority();
    authority.begin(1, 'se');

    for (const family of ['selection', 'pan', 'hover', 'context-menu'] as const) {
      expect(authority.route(1, family)).toEqual({
        owner: 'transformer',
        deliveryCount: 0,
      });
    }
    expect(authority.route(1, 'transform')).toEqual({
      owner: 'transformer',
      deliveryCount: 1,
    });
    expect(authority.complete(1)).toBe(true);
    expect(authority.route(2, 'selection')).toEqual({
      owner: 'canvas',
      deliveryCount: 1,
    });
    expect(authority.probe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
      selectionDeliveryCount: 0,
      panDeliveryCount: 0,
      hoverDeliveryCount: 0,
      contextMenuDeliveryCount: 0,
      transformDeliveryCount: 1,
      staleCompletionCount: 0,
      destroyed: false,
    });

    authority.destroy();
    expect(authority.probe()).toMatchObject({
      activeGestureCount: 0,
      destroyed: true,
    });
  });

  it('connects current scene geometry, endpoint selection, and cross-talk ownership through Engine', async () => {
    const surface = new TransformerSurface();
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(surface),
    });
    await engine.initialize({
      instanceId: 'selection-transformer-engine',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    engine.loadDataset(DATASET);

    engine.select(['rect-b']);
    expect(engine.setSelectionVisualPolicy({
      handleCssPx: 8,
      strokeCssPx: 1,
    })).toMatchObject({
      overlayCount: 1,
      frame: {
        kind: 'oriented',
        orientationDegrees: 30,
      },
    });
    expect(surface.overlayPolicy).toEqual({
      visibleIds: ['rect-b'],
      transformableIds: ['rect-b'],
      resizableIds: ['rect-b'],
      hidden: false,
      handleCssPx: 8,
      strokeCssPx: 1,
      strokeScale: 'fixed',
      minStrokeCssPx: 1,
      strokeAlignment: 'center',
      color: 0x2f80ed,
      displayMode: 'all',
      marqueeColor: 0x2f80ed,
      marqueeStrokeCssPx: 1,
      marqueeFillAlpha: 0.08,
    });
    expect(engine.transformerHandleProbe()).toMatchObject({
      visibleCorners: ['nw', 'ne', 'sw', 'se'],
      overlapPriority: ['corner', 'edge', 'rotate', 'frame'],
    });

    const endpoints = engine.selectRelationEndpoints(['links', 'links']);
    expect(endpoints.targets.map(({ selectionId }) => selectionId))
      .toEqual(['item-a', 'rect-b']);
    expect(endpoints.change.current).toEqual(['item-a', 'rect-b']);
    expect(endpoints.retainedEndpointSnapshotCount).toBe(0);

    const pointerEvents: string[] = [];
    engine.on('pointerEvent', ({ type }) => pointerEvents.push(type));
    engine.beginTransformerHandleGesture(1, 'se');
    for (const family of ['selection', 'pan', 'hover', 'context-menu'] as const) {
      expect(engine.routeTransformerInput(1, family)).toEqual({
        owner: 'transformer',
        deliveryCount: 0,
      });
    }
    engine.dispatchPointerInput(enginePointer('down', 1, [200, 70], 0));
    engine.dispatchPointerInput(enginePointer('move', 1, [810, 610], 16));
    engine.dispatchPointerInput(enginePointer('up', 1, [810, 610], 32));
    expect(pointerEvents).toEqual([]);
    expect(engine.completeTransformerHandleGesture(1)).toMatchObject({
      completed: true,
      pointer: {
        kind: 'resize',
        state: 'committed',
        commitCount: 1,
      },
      probe: {
        activeGestureCount: 0,
        pointerCaptureCount: 0,
        selectionDeliveryCount: 0,
        panDeliveryCount: 0,
        hoverDeliveryCount: 0,
        contextMenuDeliveryCount: 0,
        transformDeliveryCount: 3,
      },
    });

    engine.dispatchPointerInput(enginePointer('down', 2, [20, 30], 100));
    engine.dispatchPointerInput(enginePointer('up', 2, [20, 30], 116));
    expect(pointerEvents).toEqual(['down', 'up', 'click']);
    expect(surface.selectionIds).toEqual(['item-a']);
    engine.dispatchPointerInput(enginePointer('down', 3, [170, 50], 132, true));
    engine.dispatchPointerInput(enginePointer('up', 3, [170, 50], 148, true));
    expect(surface.selectionIds).toEqual(['item-a', 'rect-b']);
    engine.dispatchPointerInput(enginePointer('down', 4, [170, 50], 164, true));
    engine.dispatchPointerInput(enginePointer('up', 4, [170, 50], 180, true));
    expect(surface.selectionIds).toEqual(['item-a']);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(engine.transformerGestureProbe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
      destroyed: true,
    });
  });
});

function sceneIndex(): PatchMapLogicalSceneIndex {
  return new PatchMapLogicalSceneIndex(materializedDataset());
}

function materializedDataset() {
  return materializePatchMapDataset(DATASET).dataset;
}

const GEOMETRIES: readonly PatchMapTransformerTargetGeometry[] = Object.freeze([
  Object.freeze({
    id: 'item-a',
    localBounds: Object.freeze([0, 0, 100, 80] as const),
    screenBounds: Object.freeze([10, 20, 100, 80] as const),
    screenBasis: Object.freeze([1, 0, 0, 1] as const),
    screenAngle: 0,
    visible: true,
  }),
  Object.freeze({
    id: 'rect-b',
    localBounds: Object.freeze([0, 0, 40, 30] as const),
    screenBounds: Object.freeze([155.18, 32.01, 49.64, 45.98] as const),
    screenBasis: Object.freeze([
      Math.cos(Math.PI / 6),
      Math.sin(Math.PI / 6),
      -Math.sin(Math.PI / 6),
      Math.cos(Math.PI / 6),
    ] as const),
    screenAngle: 30,
    visible: true,
  }),
  Object.freeze({
    id: 'grid-a.0.0',
    localBounds: Object.freeze([0, 0, 48, 48] as const),
    screenBounds: Object.freeze([300, 40, 48, 48] as const),
    screenBasis: Object.freeze([1, 0, 0, 1] as const),
    screenAngle: 0,
    visible: true,
  }),
  Object.freeze({
    id: 'image-a',
    localBounds: Object.freeze([0, 0, 80, 40] as const),
    screenBounds: Object.freeze([-20, 200, 80, 40] as const),
    screenBasis: Object.freeze([1, 0, 0, 1] as const),
    screenAngle: 0,
    visible: true,
  }),
  Object.freeze({
    id: 'text-c',
    localBounds: Object.freeze([0, 0, 80, 20] as const),
    screenBounds: Object.freeze([40, 140, 80, 20] as const),
    screenBasis: Object.freeze([1, 0, 0, 1] as const),
    screenAngle: 0,
    visible: true,
  }),
]);

const DATASET = Object.freeze([
  {
    type: 'group',
    id: 'group-a',
    children: [
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        padding: 4,
        components: [],
        attrs: { x: 10, y: 20 },
      },
      {
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 160, y: 40 },
      },
    ],
    attrs: { x: 0, y: 0 },
  },
  {
    type: 'grid',
    id: 'grid-a',
    cells: [[1]],
    inactiveCellStrategy: 'hide',
    gap: { x: 8, y: 10 },
    item: { size: 48, padding: 4, components: [] },
    attrs: { x: 300, y: 40 },
  },
  {
    type: 'relations',
    id: 'links',
    links: [
      { source: 'item-a', target: 'item-a' },
      { source: 'item-a', target: 'rect-b' },
      { source: 'item-a', target: 'rect-b' },
      { source: 'rect-b', target: 'item-a' },
    ],
    style: { color: '#222222', width: 2 },
  },
  {
    type: 'image',
    id: 'image-a',
    source: 'fixture://image-a.png',
    size: { width: 80, height: 40 },
    attrs: { x: -20, y: 200 },
  },
  {
    type: 'text',
    id: 'text-c',
    text: 'Bravo',
    style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
    size: { width: 80, height: 20 },
    attrs: { x: 40, y: 140 },
  },
]);

class TransformerSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public selectionIds: readonly string[] = Object.freeze([]);
  public overlayPolicy: PatchMapSelectionOverlayPolicyInput | null = null;

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(_input: unknown) {
    return Object.freeze({
      status: 'committed' as const,
      operationCount: 0,
      denseChanged: false,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {}

  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }

  public setView(_view: PatchMapSurfaceView): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public setSelectionOverlayPolicy(input: PatchMapSelectionOverlayPolicyInput): boolean {
    this.overlayPolicy = structuredClone(input);
    return true;
  }

  public hitTestScreen(point: PatchMapPoint): string | null {
    if (point.x >= 10 && point.x <= 110 && point.y >= 20 && point.y <= 100) {
      return 'item-a';
    }
    if (point.x >= 155 && point.x <= 205 && point.y >= 32 && point.y <= 78) {
      return 'rect-b';
    }
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      revision: 1,
      sceneRevision: 1,
      entities: GEOMETRIES.map((geometry) => Object.freeze({
        ...geometry,
        kind: 'rect',
        worldBounds: geometry.screenBounds,
        interactive: true,
      })),
      relations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([800, 600] as const),
      backingSize: Object.freeze([800, 600] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    this.canvasCount = 0;
    this.destroyed = true;
    return Promise.resolve(true);
  }
}

function enginePointer(
  type: PatchMapEnginePointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  shift = false,
): PatchMapEnginePointerInput {
  return Object.freeze({
    type,
    pointerId,
    screen,
    timeMs,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'up' ? 0 : 1,
    modifiers: Object.freeze({
      shift,
      ctrl: false,
      alt: false,
      meta: false,
    }),
  });
}
