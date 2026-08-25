import { Container, type FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { PatchMapPixiRootInteractionBindingAuthority } from '../../src/patch-map/renderers/pixi-renderer/root-interaction-binding-authority';
import type {
  RootContextMenuInput,
  RootInteractionHandlers,
  RootPointerInput,
  RootWheelInput,
} from '../../src/patch-map/renderers/types';

describe('PatchMap Pixi root interaction binding authority', () => {
  it('defers listeners until publication and preserves pointer and scaled DOM input', () => {
    const stage = new Container();
    const canvas = fakeCanvas();
    let published = false;
    const pointers: RootPointerInput[] = [];
    const wheels: RootWheelInput[] = [];
    const contextMenus: RootContextMenuInput[] = [];
    const authority = new PatchMapPixiRootInteractionBindingAuthority({
      stage,
      canvas: canvas.element,
      readViewportWidth: () => 400,
      readViewportHeight: () => 200,
      isSurfacePublished: () => published,
    });
    const release = authority.bind({
      pointer: (input) => pointers.push(input),
      wheel: (input) => {
        wheels.push(input);
        return true;
      },
      contextMenu: (input) => {
        contextMenus.push(input);
        return true;
      },
    });

    expect(authority.probe()).toEqual({
      rootBindingCount: 0,
      rootListenerCount: 0,
      entityCallbackCount: 0,
    });
    expect(canvas.listenerCount()).toBe(0);

    published = true;
    authority.activate();
    expect(authority.probe()).toEqual({
      rootBindingCount: 6,
      rootListenerCount: 8,
      entityCallbackCount: 0,
    });
    expect(canvas.listenerCount()).toBe(3);
    expect(canvas.options('wheel')).toEqual({ passive: false });

    stage.emit('pointerdown', pointerEvent(7, 20, 30));
    expect(canvas.captured.has(7)).toBe(true);
    canvas.dispatch('pointerleave', domPointerEvent(7, 25, 35));
    expect(pointers.map(({ type }) => type)).toEqual(['down']);
    stage.emit('pointerup', pointerEvent(7, 21, 31));
    expect(canvas.captured.has(7)).toBe(false);
    canvas.dispatch('pointerleave', domPointerEvent(7, 25, 35));
    expect(pointers.map(({ type }) => type)).toEqual(['down', 'up', 'leave']);
    expect(pointers.at(-1)).toMatchObject({ screenX: 30, screenY: 50 });

    const wheel = domWheelEvent(35, 45);
    canvas.dispatch('wheel', wheel);
    expect(wheels).toEqual([expect.objectContaining({ screenX: 50, screenY: 70 })]);
    expect(wheel.defaultPrevented).toBe(true);

    const contextMenu = domMouseEvent(45, 55);
    canvas.dispatch('contextmenu', contextMenu);
    expect(contextMenus).toEqual([
      expect.objectContaining({ screenX: 70, screenY: 90 }),
    ]);
    expect(contextMenu.defaultPrevented).toBe(true);

    release();
    expect(authority.probe().rootListenerCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);
    stage.destroy();
  });

  it('replaces one active binding and destroys listeners and pointer capture once', () => {
    const stage = new Container();
    const canvas = fakeCanvas();
    const authority = new PatchMapPixiRootInteractionBindingAuthority({
      stage,
      canvas: canvas.element,
      readViewportWidth: () => 200,
      readViewportHeight: () => 100,
      isSurfacePublished: () => true,
    });
    const firstPointers: RootPointerInput[] = [];
    const secondPointers: RootPointerInput[] = [];
    const first = handlers(firstPointers);
    const second = handlers(secondPointers);
    authority.bind(first);
    stage.emit('pointerdown', pointerEvent(9, 1, 2));
    expect(canvas.captured.has(9)).toBe(true);

    authority.deactivate();
    expect(canvas.captured.has(9)).toBe(false);
    expect(authority.probe().rootListenerCount).toBe(0);
    authority.activate();
    authority.activate();
    expect(authority.probe().rootListenerCount).toBe(8);

    authority.bind(second);
    expect(authority.probe().rootListenerCount).toBe(8);
    stage.emit('pointerdown', pointerEvent(10, 2, 3));
    expect(canvas.captured.has(10)).toBe(true);
    stage.emit('pointercancel', pointerEvent(10, 2, 3));
    expect(canvas.captured.has(10)).toBe(false);
    expect(firstPointers.map(({ type }) => type)).toEqual(['down']);
    expect(secondPointers.map(({ type }) => type)).toEqual(['down', 'cancel']);

    const wheel = domWheelEvent(10, 10);
    const contextMenu = domMouseEvent(10, 10);
    canvas.dispatch('wheel', wheel);
    canvas.dispatch('contextmenu', contextMenu);
    expect(wheel.defaultPrevented).toBe(false);
    expect(contextMenu.defaultPrevented).toBe(false);
    expect(authority.destroy()).toBe(true);
    expect(authority.destroy()).toBe(false);
    expect(authority.probe()).toEqual({
      rootBindingCount: 0,
      rootListenerCount: 0,
      entityCallbackCount: 0,
    });
    expect(canvas.listenerCount()).toBe(0);
    expect(() => authority.bind(first)).toThrow('authority is destroyed');
    stage.destroy();
  });

  it('rolls back every installed listener when DOM listener installation fails', () => {
    const stage = new Container();
    const canvas = fakeCanvas({ throwOnAddType: 'pointerleave' });
    const authority = new PatchMapPixiRootInteractionBindingAuthority({
      stage,
      canvas: canvas.element,
      readViewportWidth: () => 200,
      readViewportHeight: () => 100,
      isSurfacePublished: () => true,
    });

    expect(() => authority.bind(handlers())).toThrow('listener install failed');
    expect(authority.probe()).toEqual({
      rootBindingCount: 0,
      rootListenerCount: 0,
      entityCallbackCount: 0,
    });
    expect(canvas.listenerCount()).toBe(0);
    expect(stage.listenerCount('pointerdown')).toBe(0);
    expect(stage.listenerCount('pointercancel')).toBe(0);
    expect(authority.destroy()).toBe(true);
    stage.destroy();
  });
});

function handlers(pointers: RootPointerInput[] = []): RootInteractionHandlers {
  return {
    pointer: (input) => pointers.push(input),
    wheel: () => false,
    contextMenu: () => false,
  };
}

function pointerEvent(
  pointerId: number,
  x: number,
  y: number,
): FederatedPointerEvent {
  return {
    global: { x, y },
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    timeStamp: 10,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  } as unknown as FederatedPointerEvent;
}

function fakeCanvas(config: Readonly<{
  readonly throwOnAddType?: string;
}> = {}): Readonly<{
  element: HTMLCanvasElement;
  captured: Set<number>;
  dispatch(type: string, event: unknown): void;
  listenerCount(): number;
  options(type: string): AddEventListenerOptions | boolean | undefined;
}> {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const optionsByType = new Map<string, AddEventListenerOptions | boolean | undefined>();
  const captured = new Set<number>();
  const element = {
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      listenerOptions?: AddEventListenerOptions | boolean,
    ): void {
      if (type === config.throwOnAddType) throw new Error('listener install failed');
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
      optionsByType.set(type, listenerOptions);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture(pointerId: number): void {
      captured.add(pointerId);
    },
    hasPointerCapture(pointerId: number): boolean {
      return captured.has(pointerId);
    },
    releasePointerCapture(pointerId: number): void {
      captured.delete(pointerId);
    },
    getBoundingClientRect(): DOMRect {
      return {
        left: 10,
        top: 10,
        width: 200,
        height: 100,
      } as DOMRect;
    },
  } as unknown as HTMLCanvasElement;
  return {
    element,
    captured,
    dispatch(type, event): void {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener(event as Event);
        else listener.handleEvent(event as Event);
      }
    },
    listenerCount(): number {
      return [...listeners.values()].reduce((total, values) => total + values.size, 0);
    },
    options(type): AddEventListenerOptions | boolean | undefined {
      return optionsByType.get(type);
    },
  };
}

function preventable<T extends object>(value: T): T & Readonly<{
  defaultPrevented: boolean;
  preventDefault(): void;
}> {
  return Object.assign(value, {
    defaultPrevented: false,
    preventDefault(): void {
      this.defaultPrevented = true;
    },
  });
}

function domPointerEvent(pointerId: number, clientX: number, clientY: number): PointerEvent {
  return preventable({
    pointerId,
    pointerType: 'mouse',
    clientX,
    clientY,
    button: 0,
    buttons: 0,
    timeStamp: 20,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  }) as unknown as PointerEvent;
}

function domWheelEvent(clientX: number, clientY: number): WheelEvent & {
  defaultPrevented: boolean;
} {
  return preventable({
    clientX,
    clientY,
    deltaY: 5,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  }) as unknown as WheelEvent & { defaultPrevented: boolean };
}

function domMouseEvent(clientX: number, clientY: number): MouseEvent & {
  defaultPrevented: boolean;
} {
  return preventable({
    clientX,
    clientY,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  }) as unknown as MouseEvent & { defaultPrevented: boolean };
}
