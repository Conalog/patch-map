import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EnginePointerInput,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceView,
} from '../../src/core-v2';

describe('Core v2 host interaction substrate', () => {
  it('binds surface, direct, and query clicks with one deduplicated delivery', async () => {
    const { engine } = await createEngine('host-bindings');
    engine.loadDataset(HOST_DATASET);
    const deliveries: Array<Readonly<{
      targetId: string | null;
      bindingIds: readonly string[];
    }>> = [];
    const handle = engine.bindLogicalEvents([
      { id: 'surface', event: 'click', target: null },
      {
        id: 'direct-rect-b',
        event: 'click',
        target: { kind: 'element', id: 'rect-b' },
      },
      {
        id: 'query-rect',
        event: 'click',
        query: { where: { type: 'rect' } },
      },
    ], ({ targetId, bindingIds }) => deliveries.push({ targetId, bindingIds }));

    expect(handle.enable()).toBe('enabled');
    click(engine, 1, [170, 50], 0);
    click(engine, 2, [500, 500], 100);
    expect(handle.disable()).toBe('disabled');
    click(engine, 3, [170, 50], 200);
    expect(handle.enable()).toBe('enabled');
    expect(handle.enable()).toBe('already-enabled');
    click(engine, 4, [170, 50], 300);
    expect(engine.redrawLogicalEventBindings()).toBe(1);
    click(engine, 5, [170, 50], 400);

    expect(deliveries).toEqual([
      {
        targetId: 'rect-b',
        bindingIds: ['direct-rect-b', 'query-rect'],
      },
      {
        targetId: null,
        bindingIds: ['surface'],
      },
      {
        targetId: 'rect-b',
        bindingIds: ['direct-rect-b', 'query-rect'],
      },
      {
        targetId: 'rect-b',
        bindingIds: ['direct-rect-b', 'query-rect'],
      },
    ]);
    expect(handle.probe()).toEqual({
      enabled: true,
      disposed: false,
      bindingCount: 3,
      listenerCount: 1,
      deliveryCount: 4,
    });
    expect(handle.dispose()).toBe('disposed');
    expect(handle.dispose()).toBe('already-disposed');
    click(engine, 6, [170, 50], 500);
    expect(deliveries).toHaveLength(4);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(engine.hostInteractionProbe()).toMatchObject({
      bindings: 0,
      bindingListeners: 0,
      eventSubscriptions: 0,
      selectionHostListeners: 0,
      destroyed: true,
      mode: {
        activeOwnerCount: 0,
        captureCount: 0,
        destroyed: true,
      },
    });
  });

  it('propagates through the logical path and isolates host-owned keyboard targets', async () => {
    const { engine } = await createEngine('host-propagation');
    engine.loadDataset(HOST_DATASET);
    const target = { kind: 'component', ownerId: 'item-a', id: 'label' } as const;

    expect(engine.dispatchLogicalPropagation(target)).toEqual({
      phases: [
        'capture:surface',
        'capture:item-a',
        'target:component:item-a/label',
        'bubble:item-a',
        'bubble:surface',
      ],
      currentTargets: [
        'surface',
        'item-a',
        'component:item-a/label',
        'item-a',
        'surface',
      ],
      composedPath: ['component:item-a/label', 'item-a', 'surface'],
      target: 'component:item-a/label',
      targetListenerCount: 2,
      sceneRevision: 1,
    });
    expect(engine.dispatchLogicalPropagation(target, {
      phase: 'target',
      mode: 'stop',
    })?.phases).toEqual([
      'capture:surface',
      'capture:item-a',
      'target:component:item-a/label',
    ]);
    expect(engine.dispatchLogicalPropagation(target, {
      phase: 'target',
      mode: 'immediate-stop',
    })?.targetListenerCount).toBe(1);
    expect([
      'input',
      'textarea',
      'select',
      'contenteditable',
      'open-shadow-editable',
      'iframe',
    ].map((kind) => engine.ownsKeyboardInput(kind))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(engine.ownsKeyboardInput('canvas')).toBe(true);
    expect(engine.transformerHandlePropagationProbe()).toEqual({
      owner: 'transformer',
      surfaceDeliveryCount: 0,
    });

    await expect(engine.destroy()).resolves.toBe(true);
  });

  it('owns one interaction mode stack with temporary and blur cleanup', async () => {
    const { engine } = await createEngine('host-modes');
    const lifecycle: string[] = [];
    const apply = (operation: Parameters<
      CoreV2Engine['applyInteractionModeOperation']
    >[0]) => {
      const result = engine.applyInteractionModeOperation(operation);
      lifecycle.push(...result.lifecycleDelta);
      return result;
    };

    apply({ op: 'replace', state: 'select' });
    apply({ op: 'push', state: 'pan' });
    apply({ op: 'pause' });
    apply({ op: 'resume' });
    apply({ op: 'push', state: 'relation-paint' });
    apply({ op: 'pop' });
    apply({ op: 'temporary', state: 'pan', modifier: 'Space' });
    apply({ op: 'release-temporary', modifier: 'Space' });
    apply({ op: 'pop' });
    expect(apply({ op: 'pop' }).status).toBe('unchanged');
    expect(apply({ op: 'push', state: 'unknown' })).toMatchObject({
      status: 'rejected',
      code: 'MISSING_TARGET',
    });
    apply({ op: 'blur' });

    expect(lifecycle).toEqual([
      'enter:select',
      'exit:select',
      'enter:pan',
      'pause:pan',
      'resume:pan',
      'exit:pan',
      'enter:relation-paint',
      'exit:relation-paint',
      'enter:pan',
      'exit:pan',
      'enter:select',
    ]);
    expect(engine.interactionModeProbe()).toMatchObject({
      activeState: 'select',
      stack: ['select'],
      temporaryModeCount: 0,
      captureCount: 0,
      activeOwnerCount: 1,
    });
    expect([
      engine.interactionInputOwner('select', 'pointer-click'),
      engine.interactionInputOwner('pan', 'pointer-drag'),
      engine.interactionInputOwner('relation-paint', 'pointer-drag'),
    ]).toEqual(['select', 'pan', 'relation-paint']);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(engine.hostInteractionProbe().mode).toMatchObject({
      temporaryModeCount: 0,
      captureCount: 0,
      activeOwnerCount: 0,
      destroyed: true,
    });
  });

  it('delivers specific observers before family observers at one revision', async () => {
    const { engine } = await createEngine('host-observers');
    engine.loadDataset(HOST_DATASET);
    const order: string[] = [];
    const payloads: unknown[] = [];
    const revisions: number[] = [];
    const specific = engine.subscribeHostEvent('selection', 'changed', (event) => {
      order.push('specific');
      payloads.push(event.payload);
      revisions.push(event.revision);
    });
    const family = engine.subscribeHostEvent('selection', null, (event) => {
      order.push('family');
      payloads.push(event.payload);
      revisions.push(event.revision);
    });

    engine.applySelection({
      op: 'replace',
      ids: ['rect-b'],
      source: 'canvas',
    });

    expect(order).toEqual(['specific', 'family']);
    expect(payloads).toEqual([
      {
        source: 'pointer',
        target: 'rect-b',
        selectedIds: ['rect-b'],
      },
      {
        source: 'pointer',
        target: 'rect-b',
        selectedIds: ['rect-b'],
        family: 'selection',
        type: 'changed',
      },
    ]);
    expect(revisions).toEqual([revisions[0], revisions[0]]);
    expect(revisions[0]).toBe(engine.snapshot().revisions.interactionRevision);
    expect(specific.dispose()).toBe('disposed');
    expect(family.dispose()).toBe('disposed');
    await expect(engine.destroy()).resolves.toBe(true);
  });

  it('accepts external selection without echo and reapplies only surviving IDs', async () => {
    const { engine, surface } = await createEngine('host-selection');
    engine.loadDataset(HOST_DATASET);
    const firstHostPublications: unknown[] = [];
    const unbindFirstHost = engine.bindSelectionHost((publication) => {
      firstHostPublications.push(publication);
    });

    engine.applySelection({
      op: 'replace',
      ids: ['item-a'],
      source: 'canvas',
    });
    expect(firstHostPublications).toHaveLength(1);
    expect(firstHostPublications[0]).toMatchObject({ selectedIds: ['item-a'] });

    expect(engine.setExternalSelection(['rect-b', 'missing'])).toMatchObject({
      requestedIds: ['rect-b', 'missing'],
      missingIds: ['missing'],
      change: {
        source: 'external',
        current: ['rect-b'],
      },
    });
    expect(firstHostPublications).toHaveLength(1);
    expect(surface.selectionIds).toEqual(['rect-b']);

    engine.loadDataset(REDRAW_DATASET);
    expect(surface.selectionIds).toEqual([]);
    expect(engine.setExternalSelection(['rect-b']).change.current).toEqual(['rect-b']);
    expect(surface.selectionIds).toEqual(['rect-b']);

    expect(engine.rebindHostLifecycle(2).selectionIds).toEqual([]);
    expect(surface.selectionIds).toEqual([]);
    unbindFirstHost();
    const remountedPublications: unknown[] = [];
    engine.bindSelectionHost((publication) => remountedPublications.push(publication));
    expect(engine.setExternalSelection(['rect-b']).change.current).toEqual(['rect-b']);
    expect(remountedPublications).toEqual([]);
    expect(engine.hostInteractionProbe().selectionHostListeners).toBe(1);

    await expect(engine.destroy()).resolves.toBe(true);
    expect(engine.hostInteractionProbe().selectionHostListeners).toBe(0);
  });
});

const HOST_DATASET = [
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
] as const;

const REDRAW_DATASET = HOST_DATASET.slice(1);

function click(
  engine: CoreV2Engine,
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
): void {
  engine.dispatchPointerInput(pointer('down', pointerId, screen, timeMs));
  engine.dispatchPointerInput(pointer('up', pointerId, screen, timeMs + 16));
}

function pointer(
  type: CoreV2EnginePointerInput['type'],
  pointerId: number,
  screen: readonly [number, number],
  timeMs: number,
): CoreV2EnginePointerInput {
  return {
    type,
    pointerId,
    screen,
    timeMs,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'up' ? 0 : 1,
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
  };
}

async function createEngine(instanceId: string): Promise<Readonly<{
  engine: CoreV2Engine;
  surface: HostInteractionSurface;
}>> {
  const surface = new HostInteractionSurface();
  const engine = new CoreV2Engine({
    surfaceFactory: () => Promise.resolve(surface),
  });
  await engine.initialize({
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
  });
  return Object.freeze({ engine, surface });
}

class HostInteractionSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
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

  public debugSnapshot(): CoreV2SurfaceDebug {
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
