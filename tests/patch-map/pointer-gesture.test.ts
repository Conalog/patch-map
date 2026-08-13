import { describe, expect, it } from 'vitest';

import {
  PatchMap,
  PatchMapPointerGestureAuthority,
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapPointerInput,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfacePointerInput,
  type PatchMapSurfaceView,
  type PatchMapSelectionOverlayPolicyInput,
} from '../../src/patch-map';
import type {
  PatchMapPointerHoverEvent,
  PatchMapPointerSelectionChange,
} from '../../src/patch-map/developer-api';

describe('PatchMap root pointer and region-selection substrate', () => {
  it('normalizes click, drag, secondary, and touch traces without duplicate completion', () => {
    const authority = authorityForTest();

    const click = dispatchSeries(authority, [
      pointer('down', 1, [20, 30], 0),
      pointer('up', 1, [20, 30], 16, { buttons: 0 }),
    ]);
    expect(click.map(({ type }) => type)).toEqual(['down', 'up', 'click']);
    expect(click.at(-1)?.payload).toEqual({
      target: { id: 'item-a' },
      global: [20, 30],
      screen: [20, 30],
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clickCount: 1,
    });

    const drag = dispatchSeries(authority, [
      pointer('down', 2, [20, 30], 100),
      pointer('move', 2, [30, 35], 116),
      pointer('up', 2, [30, 35], 132, { buttons: 0 }),
    ]);
    expect(drag.map(({ type }) => type)).toEqual([
      'down',
      'drag-start',
      'drag-update',
      'drag-end',
    ]);
    expect(drag.at(-1)?.payload).toMatchObject({
      target: { id: 'item-a' },
      screen: [30, 35],
      pointerId: 2,
      clickCount: 0,
    });

    const secondary = dispatchSeries(authority, [
      pointer('down', 3, [400, 400], 200, { button: 2, buttons: 2 }),
      pointer('up', 3, [400, 400], 216, { button: 2, buttons: 0 }),
    ]);
    expect(secondary.filter(({ type }) => type === 'click')).toHaveLength(1);
    expect(secondary.at(-1)?.payload.target).toBeNull();

    const touch = dispatchSeries(authority, [
      pointer('down', 4, [20, 30], 300, { pointerType: 'touch' }),
      pointer('up', 4, [20, 30], 316, { pointerType: 'touch', buttons: 0 }),
    ]);
    expect(touch.at(-1)?.payload).toMatchObject({
      pointerType: 'touch',
      clickCount: 1,
    });
    expect(authority.probe().staleGestureCount).toBe(0);
  });

  it('counts physical clicks and suppresses movement or view-revision drift in CSS pixels', () => {
    const authority = authorityForTest();
    const clickCounts: number[] = [];
    for (const [index, timeMs] of [0, 120, 220, 300].entries()) {
      dispatchSeries(authority, [
        pointer('down', 1, [20, 30], timeMs),
        pointer('up', 1, [20, 30], timeMs + 16, { buttons: 0 }),
      ]).forEach((event) => {
        if (event.type === 'click') clickCounts[index] = event.payload.clickCount;
      });
    }
    expect(clickCounts).toEqual([1, 2, 3, 4]);

    const movedReset = dispatchSeries(authority, [
      pointer('down', 1, [30, 30], 340),
      pointer('up', 1, [30, 30], 356, { buttons: 0 }),
    ]);
    expect(movedReset.at(-1)?.payload.clickCount).toBe(1);

    const below = dispatchSeries(authority, [
      pointer('down', 2, [20, 30], 500),
      pointer('up', 2, [23, 32], 516, { buttons: 0 }),
    ]);
    expect(below.at(-1)?.type).toBe('click');

    const above = dispatchSeries(authority, [
      pointer('down', 3, [20, 30], 600),
      pointer('up', 3, [25, 30], 616, { buttons: 0 }),
    ]);
    expect(above.map(({ type }) => type)).toEqual(['down', 'drag-end']);

    const viewChanged = dispatchSeries(authority, [
      pointer('down', 4, [20, 30], 700, { viewRevision: 1 }),
      pointer('up', 4, [20, 30], 716, { buttons: 0, viewRevision: 2 }),
    ]);
    expect(viewChanged.map(({ type }) => type)).toEqual(['down', 'up']);
  });

  it('clears hover and every owned gesture resource on interruption and destroy', () => {
    const authority = authorityForTest();
    expect(authority.dispatch(pointer('move', 1, [20, 30], 0, { buttons: 0 })))
      .toMatchObject({ hoverTarget: 'item-a' });
    expect(authority.dispatch(pointer('leave', 1, [801, 601], 16, { buttons: 0 })))
      .toMatchObject({ hoverTarget: null });

    const kinds = ['click', 'box', 'paint', 'pan', 'move', 'resize', 'rotate'] as const;
    for (const kind of kinds) {
      authority.beginOwnedGesture(kind, 7);
      expect(authority.dispatch(pointer('move', 7, [20, 30], 1))).toMatchObject({
        events: [],
        clickSuppressed: true,
        semanticCompletionCount: 0,
      });
      expect(authority.terminateOwnedGesture('pointer-up-outside')).toMatchObject({
        kind,
        state: 'committed',
        commitCount: 1,
        resources: releasedResources(),
      });
    }
    authority.beginOwnedGesture('box', 8);
    expect(authority.cancelOwnedGesture('pointer-cancel')).toMatchObject({
      state: 'reverted',
      commitCount: 0,
      depthDelta: 0,
      staleCompletionCount: 0,
      resources: releasedResources(),
    });

    authority.destroy();
    expect(authority.probe()).toEqual({
      activePointerCount: 0,
      pointerCaptureCount: 0,
      activeGestureCount: 0,
      hoverTarget: null,
      hoverListenerCount: 0,
      staleGestureCount: 0,
      destroyed: true,
    });
    expect(authority.dispatch(pointer('move', 9, [20, 30], 1000, { buttons: 0 })).events)
      .toEqual([]);
  });

  it('deduplicates aggregate primitives for box and paint hits and intersects relations', () => {
    const entities = [
      geometry('item-a', [10, 20, 100, 80]),
      geometry('item-a::bar:bar', [20, 30, 60, 10], 'item-a'),
      geometry('rect-b', [160, 40, 40, 30]),
      geometry('text-c', [40, 140, 80, 20]),
    ] as const;
    const relations = [{
      id: 'links:0',
      relationId: 'links',
      screenEndpoints: [[60, 60], [180, 55]],
    }] as const;

    expect(hitPatchMapBoxRegion(
      entities,
      relations,
      [0, 0],
      [220, 100],
    )).toEqual({
      candidateIds: ['item-a', 'rect-b'],
      relationIds: ['links'],
      duplicateCount: 0,
      nonFiniteCount: 0,
    });

    expect(hitPatchMapPaintRegion(
      entities,
      relations,
      [
        [[20, 30], [170, 50]],
        [[170, 50], [60, 150]],
        [[60, 150], [20, 30]],
      ],
    )).toEqual({
      candidateIds: ['item-a', 'rect-b', 'text-c'],
      relationIds: ['links'],
      duplicateCount: 0,
      nonFiniteCount: 0,
    });
  });

  it('connects one surface root input to Engine events, deferred selection, and region selection', async () => {
    const surface = new PointerTestSurface();
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(surface),
    });
    await engine.initialize({
      instanceId: 'pointer-engine',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    engine.loadDataset(REGION_DATASET);
    const eventTypes: string[] = [];
    engine.on('pointerEvent', ({ type }) => eventTypes.push(type));

    surface.emit(surfacePointer('down', 1, [20, 30], 0));
    surface.emit(surfacePointer('up', 1, [20, 30], 16, { buttons: 0 }));
    expect(eventTypes).toEqual(['down', 'up', 'click']);
    expect(surface.selectionIds).toEqual(['item-a']);

    const box = engine.selectBox([0, 0], [220, 100]);
    expect(box).toMatchObject({
      targets: [{ id: 'item-a' }, { id: 'rect-b' }],
      candidateIds: ['item-a', 'rect-b'],
      relationIds: ['links'],
      duplicateCount: 0,
      strokeCssPx: 1,
    });
    expect(surface.selectionIds).toEqual(['item-a', 'rect-b']);

    const paint = engine.selectPaint([
      [[20, 30], [170, 50]],
      [[170, 50], [60, 150]],
      [[60, 150], [20, 30]],
    ], {
      rejectIds: ['text-c'],
      lockedIds: ['rect-b'],
    });
    expect(paint).toMatchObject({
      targets: [{ id: 'item-a' }],
      filteredIds: ['text-c'],
      lockedIds: ['rect-b'],
      relationIds: ['links'],
      liveChangeCount: 3,
      nonFiniteCount: 0,
    });
    expect(surface.selectionIds).toEqual(['item-a']);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.pointerListener).toBeNull();
    expect(engine.pointerGestureProbe()).toMatchObject({
      activePointerCount: 0,
      hoverListenerCount: 0,
      destroyed: true,
    });
  });

  it('projects stable authored/concrete hover and owns policy-filtered box selection', async () => {
    const surface = new PointerTestSurface();
    surface.hitResolver = ({ x, y }) => {
      if (x >= 20 && x <= 80 && y >= 20 && y <= 80) {
        return 'rack-grid.0.0';
      }
      if (x > 80 && x <= 140 && y >= 20 && y <= 80) {
        return 'rack-grid.0.1';
      }
      if (x >= 200 && x <= 260 && y >= 20 && y <= 80) {
        return 'authored';
      }
      return null;
    };
    surface.geometryEntities = Object.freeze([
      geometry('rack-grid.0.0', [20, 20, 60, 60]),
      { ...geometry('rack-grid.0.0::bar:bar', [20, 20, 60, 60], 'rack-grid.0.0', 'bar'), interactive: false },
      { ...geometry('rack-grid.0.0::icon:status', [35, 35, 30, 30], 'rack-grid.0.0', 'status'), interactive: false },
      geometry('rack-grid.0.1', [80, 20, 60, 60]),
      { ...geometry('rack-grid.0.1::bar:bar', [80, 20, 60, 60], 'rack-grid.0.1', 'bar'), interactive: false },
      { ...geometry('rack-grid.0.1::icon:status', [95, 35, 30, 30], 'rack-grid.0.1', 'status'), interactive: false },
      geometry('authored', [200, 20, 60, 60]),
      { ...geometry('authored::text:label', [200, 20, 60, 20], 'authored', 'label'), interactive: false },
    ]);
    const policyTargets: Array<Readonly<{ id: string; componentId?: string }>> = [];
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      box: { partialIntersection: true },
      isSelectable: (target) => {
        policyTargets.push(target);
        return target.id !== 'rack-grid.0.1';
      },
    });
    await engine.initialize({ instanceId: 'pointer-public-projection', width: 800, height: 600 });
    engine.loadDataset(POINTER_PUBLIC_DATASET);
    const hoverEvents: PatchMapPointerHoverEvent[] = [];
    const selectionEvents: PatchMapPointerSelectionChange[] = [];
    const releaseHover = engine.pointer.onHover((event) => hoverEvents.push(event));
    const releaseSelection = engine.selection.onPointerChange((event) => {
      selectionEvents.push(event);
    });

    surface.emit(surfacePointer('move', 1, [45, 45], 0, { buttons: 0 }));
    surface.emit(surfacePointer('move', 1, [48, 48], 16, { buttons: 0 }));
    surface.emit(surfacePointer('move', 1, [220, 30], 32, { buttons: 0 }));
    surface.emit(surfacePointer('leave', 1, [500, 500], 48, { buttons: 0 }));
    expect(hoverEvents.map(({ type, target, previousTarget }) => ({
      type,
      target,
      previousTarget,
    }))).toEqual([
      {
        type: 'hover',
        target: { id: 'rack-grid.0.0', componentId: 'status' },
        previousTarget: null,
      },
      {
        type: 'move',
        target: { id: 'rack-grid.0.0', componentId: 'status' },
        previousTarget: { id: 'rack-grid.0.0', componentId: 'status' },
      },
      {
        type: 'hover',
        target: { id: 'authored', componentId: 'label' },
        previousTarget: { id: 'rack-grid.0.0', componentId: 'status' },
      },
      {
        type: 'leave',
        target: null,
        previousTarget: { id: 'authored', componentId: 'label' },
      },
    ]);
    expect(hoverEvents[0]).toMatchObject({
      anchor: [45, 45],
      world: [45, 45],
      pointerId: 1,
      pointerType: 'mouse',
    });

    emitClick(surface, 2, [45, 45], 100);
    expect(selectionEvents.at(-1)).toMatchObject({
      source: 'pointer',
      selected: [{ id: 'rack-grid.0.0', componentId: 'status' }],
      added: [{ id: 'rack-grid.0.0', componentId: 'status' }],
      removed: [],
    });
    emitClick(surface, 3, [105, 45], 140);
    expect(engine.selection.ids).toEqual(['rack-grid.0.0::icon:status']);
    expect(selectionEvents).toHaveLength(1);

    surface.emit(surfacePointer('down', 4, [5, 5], 200));
    surface.emit(surfacePointer('move', 4, [145, 90], 216));
    surface.emit(surfacePointer('up', 4, [145, 90], 232, { buttons: 0 }));
    expect(surface.cancelViewportGestureCount).toBe(1);
    expect(engine.selection.ids).toEqual(['rack-grid.0.0']);
    expect(selectionEvents.at(-1)).toMatchObject({
      selected: [{ id: 'rack-grid.0.0' }],
      added: [{ id: 'rack-grid.0.0' }],
      removed: [{ id: 'rack-grid.0.0', componentId: 'status' }],
    });
    expect(policyTargets).toContainEqual({ id: 'rack-grid.0.1' });

    engine.selection.clear();
    engine.configurePointerSelectionPolicy({ allowMultiple: false, box: true });
    surface.emit(surfacePointer('down', 5, [5, 5], 300));
    surface.emit(surfacePointer('move', 5, [145, 90], 316));
    surface.emit(surfacePointer('up', 5, [145, 90], 332, { buttons: 0 }));
    expect(engine.selection.ids).toEqual(['rack-grid.0.0']);

    engine.selection.clear();
    engine.configurePointerSelectionPolicy({ allowMultiple: true, box: true });
    surface.emit(surfacePointer('down', 6, [5, 5], 400));
    surface.emit(surfacePointer('move', 6, [145, 90], 416));
    surface.emit(surfacePointer('up', 6, [145, 90], 432, { buttons: 0 }));
    expect(engine.selection.ids).toEqual(['rack-grid.0.0', 'rack-grid.0.1']);

    const selectionBeforeFailure = engine.selection.ids;
    engine.configurePointerSelectionPolicy({
      box: true,
      isSelectable: () => { throw new Error('host policy failed'); },
    });
    emitClick(surface, 7, [45, 45], 500);
    expect(engine.selection.ids).toEqual(selectionBeforeFailure);

    engine.configurePointerSelectionPolicy({
      box: true,
      isSelectable: ({ id }) => {
        if (id === 'rack-grid.0.1') throw new Error('host box policy failed');
        return true;
      },
    });
    surface.emit(surfacePointer('down', 8, [5, 5], 540));
    surface.emit(surfacePointer('move', 8, [145, 90], 556));
    surface.emit(surfacePointer('up', 8, [145, 90], 572, { buttons: 0 }));
    expect(engine.selection.ids).toEqual(selectionBeforeFailure);

    const hoverCountBeforeRapidMoves = hoverEvents.length;
    for (let index = 0; index < 100; index += 1) {
      surface.emit(surfacePointer('move', 9, [45 + (index % 3), 45], 600 + index, {
        buttons: 0,
      }));
    }
    const rapidMoves = hoverEvents.slice(hoverCountBeforeRapidMoves);
    expect(rapidMoves).toHaveLength(100);
    expect(rapidMoves[0]).toMatchObject({
      type: 'hover',
      target: { id: 'rack-grid.0.0', componentId: 'status' },
    });
    expect(rapidMoves.slice(1).every(({ type }) => type === 'move')).toBe(true);

    const hoverCountBeforeDispose = hoverEvents.length;
    releaseHover();
    releaseSelection();
    for (let index = 0; index < 100; index += 1) {
      surface.emit(surfacePointer('move', 10, [45 + (index % 3), 45], 800 + index, {
        buttons: 0,
      }));
    }
    expect(hoverEvents).toHaveLength(hoverCountBeforeDispose);
    expect(engine.debug.snapshot().resources.subscriptions.active).toBe(0);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.pointerListener).toBeNull();
  });

  it('latches shift-only box activation at pointer-down without taking ordinary pan drags', async () => {
    const surface = new PointerTestSurface();
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      box: { partialIntersection: true, activationModifier: 'shift' },
    });
    await engine.initialize({ instanceId: 'pointer-shift-box', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    const selectionEvents: PatchMapPointerSelectionChange[] = [];
    engine.selection.onPointerChange((event) => selectionEvents.push(event));

    surface.emit(surfacePointer('down', 1, [0, 0], 0));
    surface.emit(surfacePointer('move', 1, [210, 120], 16));
    expect(surface.selectionMarquee).toBeNull();
    surface.emit(surfacePointer('up', 1, [210, 120], 32));
    expect(surface.cancelViewportGestureCount).toBe(0);
    expect(engine.selection.ids).toEqual([]);
    expect(selectionEvents).toEqual([]);

    surface.emit(surfacePointer('down', 2, [0, 0], 48));
    surface.emit(surfacePointer('move', 2, [20, 20], 64));
    surface.emit(surfacePointer('move', 2, [210, 120], 80, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    expect(surface.selectionMarquee).toBeNull();
    surface.emit(surfacePointer('up', 2, [210, 120], 96, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    expect(surface.cancelViewportGestureCount).toBe(0);
    expect(engine.selection.ids).toEqual([]);

    surface.emit(surfacePointer('down', 3, [0, 0], 112, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    surface.emit(surfacePointer('move', 3, [210, 120], 128, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    expect(surface.selectionMarquee).toEqual({ start: [0, 0], current: [210, 120] });
    surface.emit(surfacePointer('up', 3, [210, 120], 144));
    expect(surface.selectionMarquee).toBeNull();
    expect(surface.cancelViewportGestureCount).toBe(1);
    expect(engine.selection.ids).toEqual(['item-a', 'rect-b']);
    expect(selectionEvents).toHaveLength(1);

    engine.selection.clear();
    surface.emit(surfacePointer('down', 4, [150, 30], 160, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    surface.emit(surfacePointer('move', 4, [210, 80], 176, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    expect(surface.selectionMarquee).toEqual({ start: [150, 30], current: [210, 80] });
    surface.emit(surfacePointer('up-outside', 4, [210, 80], 192));
    expect(surface.selectionMarquee).toBeNull();
    expect(engine.selection.ids).toEqual(['rect-b']);
    expect(engine.pointerGestureProbe().activePointerCount).toBe(0);

    expect(() => engine.configurePointerSelectionPolicy({
      box: { activationModifier: 'alt' as 'shift' },
    })).toThrow('selection.box.activationModifier must be none or shift');
    await expect(engine.destroy()).resolves.toBe(true);
  });

  it('normalizes mount selection visuals and clears transient marquee on every cancel path', async () => {
    const surface = new PointerTestSurface();
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      box: {
        activationModifier: 'shift',
        visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
      },
      visual: {
        color: '#ef4444',
        strokeWidth: 3,
        displayMode: 'element-only',
      },
    });
    await engine.initialize({ instanceId: 'pointer-selection-visual', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);

    expect(surface.overlayPolicy).toMatchObject({
      visibleIds: [],
      color: 0xef4444,
      strokeCssPx: 3,
      hidden: false,
      displayMode: 'element-only',
      marqueeColor: 0x1099ff,
      marqueeStrokeCssPx: 1,
      marqueeFillAlpha: 0.08,
    });
    engine.selection.set(['item-a', 'text-c']);
    expect(surface.overlayPolicy?.visibleIds).toEqual(['item-a', 'text-c']);
    engine.selection.set('item-a/label');
    expect(engine.selection.ids).toEqual(['item-a/label']);
    expect(surface.overlayPolicy?.visibleIds).toEqual(['item-a']);
    engine.configurePointerSelectionPolicy({
      box: {
        activationModifier: 'shift',
        visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
      },
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'group-only' },
    });
    expect(surface.overlayPolicy).toMatchObject({
      visibleIds: ['item-a'],
      displayMode: 'group-only',
    });

    surface.emit(surfacePointer('down', 10, [0, 0], 0, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    surface.emit(surfacePointer('move', 10, [80, 90], 16));
    expect(surface.selectionMarquee).toEqual({ start: [0, 0], current: [80, 90] });
    surface.emit(surfacePointer('cancel', 10, [80, 90], 32));
    expect(surface.selectionMarquee).toBeNull();

    surface.emit(surfacePointer('down', 11, [10, 10], 48, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    surface.emit(surfacePointer('move', 11, [100, 100], 64));
    expect(surface.selectionMarquee).not.toBeNull();
    engine.configurePointerSelectionPolicy({
      box: {
        activationModifier: 'shift',
        visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
      },
      visual: { color: 0x16a34a, strokeWidth: 4, displayMode: 'all' },
    });
    expect(surface.selectionMarquee).toBeNull();
    expect(surface.overlayPolicy).toMatchObject({ color: 0x16a34a, strokeCssPx: 4 });

    surface.emit(surfacePointer('down', 12, [10, 10], 80, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    }));
    surface.emit(surfacePointer('move', 12, [100, 100], 96));
    const activeMarquee = surface.selectionMarquee;
    expect(activeMarquee).not.toBeNull();
    const policyBeforeFailure = structuredClone(surface.overlayPolicy);
    expect(() => engine.configurePointerSelectionPolicy({
      box: {
        activationModifier: 'shift',
        visual: { fillAlpha: 1.01 },
      },
      visual: { color: '#ef4444', strokeWidth: 3 },
    })).toThrow('selection.box.visual.fillAlpha must be between 0 and 1');
    expect(surface.selectionMarquee).toEqual(activeMarquee);
    expect(surface.overlayPolicy).toEqual(policyBeforeFailure);

    expect(() => engine.configurePointerSelectionPolicy({
      box: { visual: { color: '#not-a-color' } },
    })).toThrow('selection.box.visual.color is not a supported CSS color');
    expect(() => engine.configurePointerSelectionPolicy({
      box: { visual: { strokeWidth: 0 } },
    })).toThrow('selection.box.visual.strokeWidth must be positive and finite');

    expect(() => engine.configurePointerSelectionPolicy({
      visual: { color: '#not-a-color' },
    })).toThrow('selection.visual.color is not a supported CSS color');
    expect(() => engine.configurePointerSelectionPolicy({
      visual: { strokeWidth: 0 },
    })).toThrow('selection.visual.strokeWidth must be positive and finite');

    engine.configurePointerSelectionPolicy({
      box: { activationModifier: 'shift' },
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
    });
    expect(surface.overlayPolicy).toMatchObject({
      color: 0xef4444,
      strokeCssPx: 3,
      marqueeColor: 0xef4444,
      marqueeStrokeCssPx: 3,
      marqueeFillAlpha: 0.08,
    });
    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.selectionMarquee).toBeNull();
  });
});

const REGION_DATASET = [
  {
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{ type: 'text', id: 'label', text: 'Alpha' }],
    attrs: { x: 10, y: 20 },
  },
  {
    type: 'rect',
    id: 'rect-b',
    size: { width: 40, height: 30 },
    fill: '#ff8800',
    attrs: { x: 160, y: 40 },
  },
  {
    type: 'text',
    id: 'text-c',
    text: 'Bravo',
    size: { width: 80, height: 20 },
    attrs: { x: 40, y: 140 },
  },
  {
    type: 'relations',
    id: 'links',
    links: [{ source: 'item-a', target: 'rect-b' }],
  },
] as const;

const POINTER_PUBLIC_DATASET = [
  {
    type: 'grid',
    id: 'rack-grid',
    attrs: { x: 20, y: 20 },
    cells: [[1, 1]],
    item: {
      size: { width: 60, height: 60 },
      components: [
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#2563eb' },
          size: { width: 60, height: 60 },
        },
        {
          type: 'icon',
          id: 'status',
          source: 'device',
          size: { width: 30, height: 30 },
          attrs: { zIndex: 10 },
        },
      ],
    },
  },
  {
    type: 'item',
    id: 'authored',
    attrs: { x: 200, y: 20 },
    size: { width: 60, height: 60 },
    components: [{ type: 'text', id: 'label', text: 'authored' }],
  },
] as const;

function authorityForTest(): PatchMapPointerGestureAuthority {
  return new PatchMapPointerGestureAuthority({
    hitTest: ({ x, y }) => x >= 0 && x <= 220 && y >= 0 && y <= 180
      ? (x < 120 ? 'item-a' : 'rect-b')
      : null,
  });
}

function pointer(
  type: PatchMapPointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  overrides: Partial<PatchMapPointerInput> = {},
): PatchMapPointerInput {
  return {
    type,
    pointerId,
    screen,
    timeMs,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'up' || type === 'up-outside' || type === 'cancel' ? 0 : 1,
    viewRevision: 0,
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    ...overrides,
  };
}

function dispatchSeries(
  authority: PatchMapPointerGestureAuthority,
  inputs: readonly PatchMapPointerInput[],
) {
  return inputs.flatMap((input) => authority.dispatch(input).events);
}

function geometry(
  id: string,
  screenBounds: readonly [number, number, number, number],
  ownerItemId?: string,
  componentId?: string,
) {
  return {
    id,
    kind: 'rect',
    worldBounds: screenBounds,
    screenBounds,
    visible: true,
    interactive: true,
    ...(ownerItemId === undefined ? {} : { ownerItemId }),
    ...(componentId === undefined ? {} : { componentId }),
  };
}

function emitClick(
  surface: PointerTestSurface,
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  overrides: Partial<PatchMapSurfacePointerInput> = {},
): void {
  surface.emit(surfacePointer('down', pointerId, screen, timeMs, overrides));
  surface.emit(surfacePointer('up', pointerId, screen, timeMs + 16, {
    ...overrides,
    buttons: 0,
  }));
}

function releasedResources() {
  return {
    capture: 0,
    overlay: 0,
    autoPan: 0,
    listeners: 0,
    modifiers: 0,
  };
}

function surfacePointer(
  type: PatchMapSurfacePointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  overrides: Partial<PatchMapSurfacePointerInput> = {},
): PatchMapSurfacePointerInput {
  return {
    type,
    pointerId,
    screen,
    timeMs,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'up' || type === 'up-outside' || type === 'cancel' ? 0 : 1,
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    ...overrides,
  };
}

class PointerTestSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public pointerListener: ((input: PatchMapSurfacePointerInput) => void) | null = null;
  public selectionIds: readonly string[] = Object.freeze([]);
  public cancelViewportGestureCount = 0;
  public overlayPolicy: PatchMapSelectionOverlayPolicyInput | null = null;
  public selectionMarquee: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null = null;
  public hitResolver: (point: PatchMapPoint) => string | null = (point) => {
    if (point.x >= 10 && point.x <= 110 && point.y >= 20 && point.y <= 100) {
      return 'item-a';
    }
    if (point.x >= 160 && point.x <= 200 && point.y >= 40 && point.y <= 70) {
      return 'rect-b';
    }
    return null;
  };
  public geometryEntities: PatchMapSurfaceGeometrySnapshot['entities'] = Object.freeze([
    geometry('item-a', [10, 20, 100, 80]),
    { ...geometry('item-a::text:label', [20, 30, 60, 10], 'item-a'), interactive: false },
    geometry('rect-b', [160, 40, 40, 30]),
    geometry('text-c', [40, 140, 80, 20]),
  ]);

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
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

  public setSelectionMarquee(input: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null): boolean {
    this.selectionMarquee = input === null ? null : structuredClone(input);
    return true;
  }

  public bindPointerInput(
    listener: (input: PatchMapSurfacePointerInput) => void,
  ): () => void {
    this.pointerListener = listener;
    return () => {
      if (this.pointerListener === listener) this.pointerListener = null;
    };
  }

  public emit(input: PatchMapSurfacePointerInput): void {
    this.pointerListener?.(input);
  }

  public hitTestScreen(point: PatchMapPoint): string | null {
    return this.hitResolver(point);
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      revision: 1,
      entities: this.geometryEntities,
      relations: Object.freeze([{
        id: 'links:0',
        relationId: 'links',
        sourceId: 'item-a',
        targetId: 'rect-b',
        worldEndpoints: [[60, 60], [180, 55]] as const,
        screenEndpoints: [[60, 60], [180, 55]] as const,
      }]),
      selectionOverlay: null,
    });
  }

  public queryRegionGeometry() {
    return Object.freeze({
      entities: this.geometryEntities,
      relations: this.geometrySnapshot().relations,
    });
  }

  public cancelViewportGestures(): void {
    this.cancelViewportGestureCount += 1;
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
    this.pointerListener = null;
    this.canvasCount = 0;
    this.destroyed = true;
    this.selectionMarquee = null;
    return Promise.resolve(true);
  }
}
