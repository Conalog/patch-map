import { describe, expect, it, vi } from 'vitest';

import {
  PatchMapPointerGestureAuthority,
  type PatchMapPointerInput,
} from '../../src/pointer-gesture';
import {
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
} from '../../src/pointer-gesture/geometry';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceDebug,
  PatchMapSurfacePointerInput,
} from '../../src/engine/contracts';
import type {
  PatchMapPoint,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceView,
} from '../../src/engine/surface-contract';
import type { PatchMapSelectionOverlayPolicyInput } from '../../src/core/contracts';
import type {
  PatchMapPointerHoverEvent,
  PatchMapPointerSelectionResolverInput,
  PatchMapPointerSelectionChange,
  PatchMapPointerTooltipEvent,
} from '../../src/public';
import { createPublicApiEngine } from '../support/public-api-engine';

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

  it('keeps 0-4 CSS px per-axis jitter clickable and latches drag after 5px', () => {
    const authority = authorityForTest();
    const trace = (
      pointerId: number,
      points: readonly (readonly [number, number])[],
      cadenceMs: number,
    ) => dispatchSeries(authority, [
      pointer('down', pointerId, [20, 30], pointerId * 100),
      ...points.map((screen, index) => pointer(
        'move',
        pointerId,
        screen,
        pointerId * 100 + cadenceMs * (index + 1),
      )),
      pointer('up', pointerId, points.at(-1) ?? [20, 30], pointerId * 100 + 90, {
        buttons: 0,
      }),
    ]).map(({ type }) => type);

    expect(trace(10, [], 1)).toEqual(['down', 'up', 'click']);
    expect(trace(11, [[21, 30]], 1)).toEqual(['down', 'up', 'click']);
    expect(trace(12, [[24, 30]], 1)).toEqual(['down', 'up', 'click']);
    expect(trace(13, [[20, 34]], 20)).toEqual(['down', 'up', 'click']);
    expect(trace(14, [[24, 34]], 50)).toEqual(['down', 'up', 'click']);
    expect(trace(15, [[25, 30]], 1)).toEqual([
      'down', 'drag-start', 'drag-update', 'drag-end',
    ]);
    expect(trace(16, [[20, 35]], 50)).toEqual([
      'down', 'drag-start', 'drag-update', 'drag-end',
    ]);
    expect(trace(17, [[21, 30], [20, 30]], 5)).toEqual(['down', 'up', 'click']);
    expect(trace(18, [[25, 30], [20, 30]], 30)).toEqual([
      'down',
      'drag-start',
      'drag-update',
      'drag-update',
      'drag-end',
    ]);
  });

  it('compares click completion by stable owner without erasing raw component hits', () => {
    const authority = new PatchMapPointerGestureAuthority({
      hitTest: ({ x }) => x < 22 ? 'cell-a::bar:usage' : 'cell-a::icon:status',
      clickTargetIdentity: (targetId) => targetId?.split('::')[0] ?? null,
    });
    const events = dispatchSeries(authority, [
      pointer('down', 1, [20, 30], 0),
      pointer('move', 1, [23, 30], 16),
      pointer('up', 1, [23, 30], 32, { buttons: 0 }),
    ]);
    expect(events.map(({ type }) => type)).toEqual(['down', 'up', 'click']);
    expect(events.at(-1)?.payload.target).toEqual({ id: 'cell-a::bar:usage' });
  });

  it('keeps hover through press only when configured and publishes leave on cancel', () => {
    const compatible = authorityForTest();
    compatible.dispatch(pointer('move', 1, [20, 30], 0, { buttons: 0 }));
    expect(compatible.dispatch(pointer('down', 1, [20, 30], 16)).events
      .map(({ type }) => type)).toEqual(['hover-change', 'down']);
    expect(compatible.probe().hoverTarget).toBeNull();

    const persistent = new PatchMapPointerGestureAuthority({
      hitTest: ({ x, y }) => x >= 0 && x <= 220 && y >= 0 && y <= 180
        ? (x < 120 ? 'item-a' : 'rect-b')
        : null,
      hoverDuringPress: true,
    });
    persistent.dispatch(pointer('move', 2, [20, 30], 0, { buttons: 0 }));
    expect(persistent.dispatch(pointer('down', 2, [20, 30], 16))).toMatchObject({
      hoverTarget: 'item-a',
      events: [{ type: 'down' }],
    });
    expect(persistent.dispatch(pointer('up', 2, [20, 30], 32, { buttons: 0 })))
      .toMatchObject({
        hoverTarget: 'item-a',
        events: [{ type: 'up' }, { type: 'click' }],
      });

    persistent.dispatch(pointer('down', 3, [20, 30], 48));
    expect(persistent.dispatch(pointer('cancel', 3, [20, 30], 64, { buttons: 0 })))
      .toMatchObject({
        hoverTarget: null,
        clickSuppressed: true,
        events: [{ type: 'cancel' }, { type: 'hover-change' }],
      });
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
    const engine = createPublicApiEngine({
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
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      clearOnBlankClick: 'never',
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
      selected: [{ id: 'rack-grid.0.0' }],
      added: [{ id: 'rack-grid.0.0' }],
      removed: [],
    });
    emitClick(surface, 3, [105, 45], 140);
    expect(engine.selection.ids).toEqual(['rack-grid.0.0']);
    expect(selectionEvents).toHaveLength(1);

    surface.emit(surfacePointer('down', 4, [5, 5], 200));
    surface.emit(surfacePointer('move', 4, [145, 90], 216));
    surface.emit(surfacePointer('up', 4, [145, 90], 232, { buttons: 0 }));
    expect(surface.cancelViewportGestureCount).toBe(1);
    expect(engine.selection.ids).toEqual(['rack-grid.0.0']);
    expect(selectionEvents).toHaveLength(1);
    expect(selectionEvents.at(-1)).toMatchObject({
      selected: [{ id: 'rack-grid.0.0' }],
      added: [{ id: 'rack-grid.0.0' }],
      removed: [],
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

  it('projects mount-owned hover persistence without changing the compatible default', async () => {
    for (const hoverDuringPress of [false, true]) {
      const surface = new PointerTestSurface();
      const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
      if (hoverDuringPress) engine.configurePointerPolicy({ hoverDuringPress: true });
      await engine.initialize({
        instanceId: `pointer-hover-during-press-${hoverDuringPress}`,
        width: 800,
        height: 600,
      });
      engine.loadDataset(REGION_DATASET);
      const hoverEvents: PatchMapPointerHoverEvent[] = [];
      engine.pointer.onHover((event) => hoverEvents.push(event));

      surface.emit(surfacePointer('move', 1, [90, 80], 0, { buttons: 0 }));
      surface.emit(surfacePointer('down', 1, [90, 80], 16));
      expect(hoverEvents.map(({ type }) => type)).toEqual(
        hoverDuringPress ? ['hover'] : ['hover', 'leave'],
      );
      surface.emit(surfacePointer('up', 1, [90, 80], 32, { buttons: 0 }));
      expect(engine.selection.ids).toEqual(['item-a']);

      if (hoverDuringPress) {
        surface.emit(surfacePointer('down', 2, [90, 80], 48));
        surface.emit(surfacePointer('cancel', 2, [90, 80], 64, { buttons: 0 }));
        expect(hoverEvents.map(({ type }) => type)).toEqual(['hover', 'leave']);
      }
      await expect(engine.destroy()).resolves.toBe(true);
      expect(surface.pointerListener).toBeNull();
    }

    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PointerTestSurface()),
    });
    expect(() => engine.configurePointerPolicy({
      hoverDuringPress: 'yes' as unknown as boolean,
    })).toThrow('pointer.hoverDuringPress must be boolean');
  });

  it('pins package-owned tooltip projection on context menu until the next primary click', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerPolicy({
      hoverDuringPress: true,
      tooltip: { pinOnContextMenu: true, preventDefault: true },
    });
    await engine.initialize({ instanceId: 'pointer-tooltip-pin', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    const tooltipEvents: PatchMapPointerTooltipEvent[] = [];
    const release = engine.pointer.onTooltip((event) => tooltipEvents.push(event));

    surface.emit(surfacePointer('move', 1, [90, 80], 0, { buttons: 0 }));
    expect(tooltipEvents.at(-1)).toMatchObject({
      type: 'show',
      target: { id: 'item-a' },
      pinned: false,
    });
    expect(engine.dispatchPointerContextMenu({
      screen: [90, 80],
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    })).toBe(true);
    expect(tooltipEvents.at(-1)).toMatchObject({
      type: 'pin',
      target: { id: 'item-a' },
      anchor: [90, 80],
      world: [90, 80],
      pinned: true,
    });

    surface.emit(surfacePointer('leave', 1, [900, 700], 16, { buttons: 0 }));
    expect(tooltipEvents.at(-1)?.type).toBe('pin');
    emitClick(surface, 2, [180, 55], 32);
    expect(tooltipEvents.at(-1)).toMatchObject({
      type: 'show',
      target: { id: 'rect-b' },
      previousTarget: { id: 'item-a' },
      pinned: false,
    });
    surface.emit(surfacePointer('leave', 1, [900, 700], 64, { buttons: 0 }));
    expect(tooltipEvents.at(-1)).toMatchObject({ type: 'hide', target: null });

    release();
    const beforeDestroy = tooltipEvents.length;
    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.pointerListener).toBeNull();
    expect(tooltipEvents).toHaveLength(beforeDestroy);

    const compatible = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PointerTestSurface()),
    });
    compatible.configurePointerPolicy({ tooltip: { pinOnContextMenu: false } });
    await compatible.initialize({ instanceId: 'pointer-tooltip-compatible', width: 800, height: 600 });
    compatible.loadDataset(REGION_DATASET);
    expect(compatible.dispatchPointerContextMenu({
      screen: [90, 80],
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    })).toBe(true);
    await compatible.destroy();
  });

  it('resolves Ctrl or Cmd point selection inside the package-owned selection commit', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    const resolver = vi.fn(({
      target,
      currentIds,
    }: PatchMapPointerSelectionResolverInput): readonly string[] =>
      Object.freeze([...currentIds, target.id]));
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      resolveModifierSelection: resolver,
    });
    await engine.initialize({ instanceId: 'pointer-modifier-resolver', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    engine.selection.set('item-a');
    const changes: PatchMapPointerSelectionChange[] = [];
    const diagnostics: Array<Readonly<{ readonly code: string; readonly operation: string }>> = [];
    engine.selection.onPointerChange((change) => changes.push(change));
    engine.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

    emitClick(surface, 1, [180, 55], 0, {
      modifiers: { shift: false, ctrl: true, alt: false, meta: false },
    });
    expect(resolver).toHaveBeenCalledOnce();
    const resolverInput = resolver.mock.calls[0]?.[0];
    expect(resolverInput).toMatchObject({
      target: { id: 'rect-b' },
      currentIds: ['item-a'],
      modifiers: { ctrl: true, meta: false },
      clickCount: 1,
    });
    if (resolverInput === undefined) throw new Error('expected modifier resolver input');
    expect(Object.isFrozen(resolverInput.currentIds)).toBe(true);
    expect(engine.selection.ids).toEqual(['item-a', 'rect-b']);
    expect(changes).toHaveLength(1);

    emitClick(surface, 2, [45, 45], 600, {
      modifiers: { shift: false, ctrl: false, alt: false, meta: true },
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(engine.selection.ids).toEqual(['item-a', 'rect-b']);
    expect(changes).toHaveLength(1);

    emitClick(surface, 3, [180, 55], 1_200, {
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(engine.selection.ids).toEqual(['item-a']);

    engine.configurePointerSelectionPolicy({
      resolveModifierSelection: () => ['missing'],
    });
    emitClick(surface, 4, [180, 55], 1_800, {
      modifiers: { shift: false, ctrl: true, alt: false, meta: false },
    });
    expect(engine.selection.ids).toEqual(['item-a']);
    expect(diagnostics.at(-1)).toMatchObject({
      code: 'HOST_CALLBACK_FAILURE',
      operation: 'selection.resolveModifierSelection',
    });

    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.pointerListener).toBeNull();
  });

  it('keeps Shift point selection through 4px and starts box ownership at 5px', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      box: { partialIntersection: true, activationModifier: 'shift' },
    });
    await engine.initialize({ instanceId: 'pointer-shift-box-slop', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    const shift = { shift: true, ctrl: false, alt: false, meta: false };

    surface.emit(surfacePointer('down', 1, [20, 30], 0, { modifiers: shift }));
    surface.emit(surfacePointer('move', 1, [24, 34], 16, { modifiers: shift }));
    surface.emit(surfacePointer('up', 1, [24, 34], 32, {
      buttons: 0,
      modifiers: shift,
    }));
    expect(engine.selection.ids).toEqual(['item-a']);
    expect(surface.cancelViewportGestureCount).toBe(0);
    expect(surface.selectionMarquee).toBeNull();

    engine.selection.clear();
    surface.emit(surfacePointer('down', 2, [0, 0], 48, { modifiers: shift }));
    surface.emit(surfacePointer('move', 2, [5, 0], 64, { modifiers: shift }));
    expect(surface.cancelViewportGestureCount).toBe(1);
    expect(surface.selectionMarquee).toEqual({ start: [0, 0], current: [5, 0] });
    surface.emit(surfacePointer('up', 2, [5, 0], 80, {
      buttons: 0,
      modifiers: shift,
    }));
    expect(engine.selection.ids).toEqual([]);
    expect(surface.selectionMarquee).toBeNull();

    await expect(engine.destroy()).resolves.toBe(true);
    expect(surface.pointerListener).toBeNull();
  });

  it('latches shift-only box activation at pointer-down without taking ordinary pan drags', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
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

  it('owns configured blank and selected-target double-click deselection without delaying new targets', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      clearOnBlankClick: 'double',
      deselectOnTargetDoubleClick: true,
      box: { partialIntersection: true, activationModifier: 'shift' },
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
    });
    await engine.initialize({ instanceId: 'pointer-blank-double-clear', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    vi.useFakeTimers();
    const pointerChanges: PatchMapPointerSelectionChange[] = [];
    engine.selection.onPointerChange((change) => pointerChanges.push(change));
    try {
      engine.selection.set('item-a');
      emitClick(surface, 20, [400, 400], 0);
      expect(engine.selection.ids).toEqual(['item-a']);
      expect(pointerChanges).toEqual([]);
      expect(surface.overlayPolicy).toMatchObject({
        visibleIds: ['item-a'],
        displayMode: 'element-only',
      });

      emitClick(surface, 20, [400, 400], 100);
      expect(engine.selection.ids).toEqual([]);
      expect(pointerChanges).toHaveLength(1);
      expect(pointerChanges[0]).toMatchObject({
        selected: [],
        added: [],
        removed: [{ id: 'item-a' }],
      });

      // An unselected target paints immediately. Its second click is not
      // allowed to reinterpret that new selection as a deselection gesture.
      engine.selection.set('rect-b');
      emitClick(surface, 21, [45, 45], 700);
      expect(engine.selection.ids).toEqual(['item-a']);
      expect(pointerChanges).toHaveLength(2);
      emitClick(surface, 21, [45, 45], 800);
      expect(engine.selection.ids).toEqual(['item-a']);
      expect(pointerChanges).toHaveLength(2);

      // A target selected before the gesture arms on the first click and only
      // that target is removed by the paired second click.
      engine.selection.set(['item-a', 'rect-b']);
      emitClick(surface, 22, [45, 45], 1_400);
      expect(engine.selection.ids).toEqual(['item-a', 'rect-b']);
      expect(pointerChanges).toHaveLength(2);
      emitClick(surface, 22, [45, 45], 1_500);
      expect(engine.selection.ids).toEqual(['rect-b']);
      expect(pointerChanges).toHaveLength(3);
      expect(pointerChanges[2]).toMatchObject({
        selected: [{ id: 'rect-b' }],
        added: [],
        removed: [{ id: 'item-a' }],
      });

      const shift = { shift: true, ctrl: false, alt: false, meta: false };
      emitClick(surface, 23, [165, 45], 2_100, { modifiers: shift });
      expect(engine.selection.ids).toEqual([]);
      expect(pointerChanges).toHaveLength(4);
      emitClick(surface, 24, [45, 45], 2_700, { modifiers: shift });
      expect(engine.selection.ids).toEqual(['item-a']);
      expect(pointerChanges).toHaveLength(5);

      // A selected single click is a no-op but arms the package-owned second
      // click. Starting a box drag cancels that arm and keeps Shift box rules.
      emitClick(surface, 25, [45, 45], 3_300);
      expect(engine.selection.ids).toEqual(['item-a']);
      expect(pointerChanges).toHaveLength(5);
      surface.emit(surfacePointer('down', 26, [0, 0], 3_400, { modifiers: shift }));
      surface.emit(surfacePointer('move', 26, [210, 120], 3_416, { modifiers: shift }));
      surface.emit(surfacePointer('up', 26, [210, 120], 3_432, { buttons: 0 }));
      expect(engine.selection.ids).toEqual(['item-a', 'rect-b']);
      expect(pointerChanges).toHaveLength(6);
      expect(surface.selectionMarquee).toBeNull();
      expect(surface.overlayPolicy?.visibleIds).toEqual(['item-a', 'rect-b']);

      emitClick(surface, 27, [45, 45], 4_000);
      const beforeDestroyCallbacks = pointerChanges.length;
      await expect(engine.destroy()).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(pointerChanges).toHaveLength(beforeDestroyCallbacks);
      expect(surface.pointerListener).toBeNull();
    } finally {
      await engine.destroy().catch(() => undefined);
      vi.useRealTimers();
    }
  });

  it('treats non-selectable point hits as blank for configured selection clearing', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      clearOnBlankClick: 'double',
      isSelectable: ({ id }) => id !== 'rect-b',
    });
    await engine.initialize({ instanceId: 'pointer-rejected-target-clear', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    const pointerChanges: PatchMapPointerSelectionChange[] = [];
    engine.selection.onPointerChange((change) => pointerChanges.push(change));

    engine.selection.set('item-a');
    emitClick(surface, 28, [180, 55], 0);
    expect(engine.selection.ids).toEqual(['item-a']);
    expect(pointerChanges).toEqual([]);

    emitClick(surface, 28, [180, 55], 100);
    expect(engine.selection.ids).toEqual([]);
    expect(pointerChanges).toHaveLength(1);
    expect(pointerChanges[0]).toMatchObject({
      selected: [],
      added: [],
      removed: [{ id: 'item-a' }],
    });

    await expect(engine.destroy()).resolves.toBe(true);
  });

  it('keeps the compatible blank single-click clear default', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'pointer-blank-default-clear', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);
    engine.selection.set('item-a');
    emitClick(surface, 23, [400, 400], 0);
    expect(engine.selection.ids).toEqual([]);
    await expect(engine.destroy()).resolves.toBe(true);
  });

  it('normalizes mount selection visuals and clears transient marquee on every cancel path', async () => {
    const surface = new PointerTestSurface();
    const engine = createPublicApiEngine({ surfaceFactory: () => Promise.resolve(surface) });
    engine.configurePointerSelectionPolicy({
      allowMultiple: true,
      box: {
        activationModifier: 'shift',
        visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
      },
      visual: {
        color: '#ef4444',
        strokeWidth: 3,
        strokeScale: 'viewport',
        minStrokeWidth: 1,
        strokeAlignment: 'outside',
        displayMode: 'element-only',
      },
    });
    await engine.initialize({ instanceId: 'pointer-selection-visual', width: 800, height: 600 });
    engine.loadDataset(REGION_DATASET);

    expect(surface.overlayPolicy).toMatchObject({
      visibleIds: [],
      color: 0xef4444,
      strokeCssPx: 3,
      strokeScale: 'viewport',
      minStrokeCssPx: 1,
      strokeAlignment: 'outside',
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
    expect(() => engine.configurePointerSelectionPolicy({
      visual: { strokeAlignment: 'over' as 'outside' },
    })).toThrow('selection.visual.strokeAlignment is unsupported');
    expect(() => engine.configurePointerSelectionPolicy({
      visual: { strokeScale: 'world' as 'viewport' },
    })).toThrow('selection.visual.strokeScale must be fixed or viewport');
    expect(() => engine.configurePointerSelectionPolicy({
      visual: { strokeWidth: 3, minStrokeWidth: 0 },
    })).toThrow('selection.visual.minStrokeWidth must be positive and finite');
    expect(() => engine.configurePointerSelectionPolicy({
      visual: { strokeWidth: 3, minStrokeWidth: 4 },
    })).toThrow('selection.visual.minStrokeWidth cannot exceed strokeWidth');
    expect(() => engine.configurePointerSelectionPolicy({
      clearOnBlankClick: 'triple' as 'double',
    })).toThrow('selection.clearOnBlankClick must be single, double, or never');
    expect(() => engine.configurePointerSelectionPolicy({
      deselectOnTargetDoubleClick: 'yes' as unknown as boolean,
    })).toThrow('selection.deselectOnTargetDoubleClick must be boolean');

    engine.configurePointerSelectionPolicy({
      box: { activationModifier: 'shift' },
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
    });
    expect(surface.overlayPolicy).toMatchObject({
      color: 0xef4444,
      strokeCssPx: 3,
      strokeScale: 'fixed',
      minStrokeCssPx: 1,
      strokeAlignment: 'center',
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
      sceneRevision: 1,
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
