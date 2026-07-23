import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  CoreV2PointerGestureAuthority,
  hitCoreV2BoxRegion,
  hitCoreV2PaintRegion,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2PointerInput,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceGeometrySnapshot,
  type CoreV2SurfacePointerInput,
  type CoreV2SurfaceView,
} from '../../src/core-v2';

describe('Core v2 root pointer and region-selection substrate', () => {
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

    expect(hitCoreV2BoxRegion(
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

    expect(hitCoreV2PaintRegion(
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
    const engine = new CoreV2Engine({
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

function authorityForTest(): CoreV2PointerGestureAuthority {
  return new CoreV2PointerGestureAuthority({
    hitTest: ({ x, y }) => x >= 0 && x <= 220 && y >= 0 && y <= 180
      ? (x < 120 ? 'item-a' : 'rect-b')
      : null,
  });
}

function pointer(
  type: CoreV2PointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  overrides: Partial<CoreV2PointerInput> = {},
): CoreV2PointerInput {
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
  authority: CoreV2PointerGestureAuthority,
  inputs: readonly CoreV2PointerInput[],
) {
  return inputs.flatMap((input) => authority.dispatch(input).events);
}

function geometry(
  id: string,
  screenBounds: readonly [number, number, number, number],
  ownerItemId?: string,
) {
  return {
    id,
    kind: 'rect',
    worldBounds: screenBounds,
    screenBounds,
    visible: true,
    interactive: true,
    ...(ownerItemId === undefined ? {} : { ownerItemId }),
  };
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
  type: CoreV2SurfacePointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
  overrides: Partial<CoreV2SurfacePointerInput> = {},
): CoreV2SurfacePointerInput {
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

class PointerTestSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public pointerListener: ((input: CoreV2SurfacePointerInput) => void) | null = null;
  public selectionIds: readonly string[] = Object.freeze([]);

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public publishFrame(_timeMs: number): void {}

  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }

  public setView(_view: CoreV2SurfaceView): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public bindPointerInput(
    listener: (input: CoreV2SurfacePointerInput) => void,
  ): () => void {
    this.pointerListener = listener;
    return () => {
      if (this.pointerListener === listener) this.pointerListener = null;
    };
  }

  public emit(input: CoreV2SurfacePointerInput): void {
    this.pointerListener?.(input);
  }

  public hitTestScreen(point: CoreV2Point): string | null {
    if (point.x >= 10 && point.x <= 110 && point.y >= 20 && point.y <= 100) {
      return 'item-a';
    }
    if (point.x >= 160 && point.x <= 200 && point.y >= 40 && point.y <= 70) {
      return 'rect-b';
    }
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({ ...point });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    return Object.freeze({
      revision: 1,
      entities: Object.freeze([
        geometry('item-a', [10, 20, 100, 80]),
        geometry('item-a::text:label', [20, 30, 60, 10], 'item-a'),
        geometry('rect-b', [160, 40, 40, 30]),
        geometry('text-c', [40, 140, 80, 20]),
      ]),
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

  public debugSnapshot(): CoreV2SurfaceDebug {
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
    return Promise.resolve(true);
  }
}
