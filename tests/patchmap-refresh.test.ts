import {
  Application,
  Rectangle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Patchmap } from '../src/patchmap';
import type { PublicDisplayHandle } from '../src/contracts';
import { AggregateRenderLayer } from '../src/scene/render-layer';

const disabledViewportPlugins = {
  clampZoom: { disabled: true },
  decelerate: { disabled: true },
  drag: { disabled: true },
  pinch: { disabled: true },
  wheel: { disabled: true },
};

describe('Patchmap managed-scene refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('coalesces sequential updates into the next aggregate render refresh', async () => {
    const canvas = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(Application.prototype, 'init').mockImplementation(function (
      this: Application,
    ) {
      Reflect.set(this, 'renderer', {
        canvas,
        events: { domElement: canvas },
        resize: vi.fn(),
        screen: new Rectangle(0, 0, 320, 240),
      });
      return Promise.resolve();
    });
    vi.spyOn(Application.prototype, 'destroy').mockImplementation(function (
      this: Application,
    ) {
      if (!this.stage.destroyed) this.stage.destroy({ children: true });
    });

    const frameCallbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      frameCallbacks.push(callback);
      return 17;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const renderScene = vi.spyOn(
      AggregateRenderLayer.prototype,
      'renderScene',
    );
    const host = {
      appendChild: vi.fn(),
      clientHeight: 240,
      clientWidth: 320,
    } as unknown as HTMLElement;
    const patchmap = new Patchmap();
    await patchmap.init(host, {
      app: { autoStart: false },
      viewport: { noTicker: true, plugins: disabledViewportPlugins },
    });
    patchmap.draw(Array.from({ length: 24 }, (_, index) => ({
      type: 'item' as const,
      id: `item-${index}`,
      size: 20,
      components: [{
        type: 'text' as const,
        id: `text-${index}`,
        text: 'before',
      }],
    })));
    const components = patchmap.selector('$..children[?(@.type==="text")]');
    renderScene.mockClear();

    for (const [index, component] of components.entries()) {
      const returned = patchmap.update({
        elements: component,
        changes: { text: `after-${index}` },
        emit: false,
      });
      expect(returned).toEqual([component]);
      expect((component.props as unknown as { text: string }).text).toBe(
        `after-${index}`,
      );
    }

    expect(renderScene).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    const renderLayer = patchmap.viewport?.children.find(
      ({ label }) => label === 'patch-map-aggregate-render-layer',
    );
    expect(renderLayer).toBeInstanceOf(AggregateRenderLayer);

    const renderer = patchmap.app?.renderer;
    if (!renderer) throw new Error('Expected initialized renderer');
    renderLayer?.onRender?.(renderer);

    expect(renderScene).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(17);

    renderScene.mockClear();
    requestFrame.mockClear();
    for (const [index, component] of components.entries()) {
      const returned = patchmap.update({
        path: `$..children[?(@.id==="${component.id}")]`,
        changes: { text: `path-${index}` },
        emit: false,
      });
      expect(returned).toEqual([component]);
      expect((component.props as unknown as { text: string }).text).toBe(
        `path-${index}`,
      );
    }

    expect(renderScene).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    renderLayer?.onRender?.(renderer);
    expect(renderScene).toHaveBeenCalledTimes(1);

    patchmap.draw([{
      type: 'grid',
      id: 'event-grid',
      cells: [[1, 0]],
      item: { size: 20 },
    }]);
    const eventGrid = patchmap.selector(
      '$..children[?(@.id==="event-grid")]',
    )[0];
    if (!eventGrid) throw new Error('Expected the event grid');
    let eventHits = 0;
    patchmap.event.add({
      id: 'new-cell-click',
      path: '$..children[?(@.id==="event-grid.0.1")]',
      action: 'click',
      fn: () => { eventHits += 1; },
    });
    patchmap.update({
      elements: eventGrid,
      changes: { cells: [[1, 1]] },
      emit: false,
    });
    const eventItems = eventGrid.children as PublicDisplayHandle[];
    const addedCell = eventItems.find(
      (child) => child.id === 'event-grid.0.1',
    );
    expect(addedCell).toBeDefined();
    addedCell?.emit(
      'click',
      { target: addedCell } as unknown as FederatedPointerEvent,
    );
    expect(eventHits).toBe(1);

    renderScene.mockClear();
    const firstItem = eventItems[0];
    if (!firstItem) throw new Error('Expected a managed grid item');
    patchmap.update({
      elements: firstItem,
      changes: { attrs: { x: 5 } },
      emit: false,
    });
    const pendingFrame = frameCallbacks.at(-1);
    const cancellationCount = cancelFrame.mock.calls.length;
    patchmap.destroy();
    expect(renderLayer?.onRender).toBeNull();
    expect(cancelFrame).toHaveBeenCalledTimes(cancellationCount + 1);

    pendingFrame?.(performance.now());
    expect(renderScene).not.toHaveBeenCalled();
  });
});
