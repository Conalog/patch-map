import { describe, expect, it } from 'vitest';

import type { CoreView } from '../../src/patch-map/dense/contracts';
import {
  PatchMapRootInteractionAuthority,
  type PatchMapRootInteractionBinder,
  type PatchMapRootInteractionPorts,
} from '../../src/patch-map/core/root-interaction-authority';
import type { PatchMapRootPointerInput } from '../../src/patch-map/core/contracts';
import type { RootInteractionHandlers, RootWheelInput } from '../../src/patch-map/renderers/types';

describe('PatchMapRootInteractionAuthority', () => {
  it('preserves root pointer, selection, pan, viewport, and wheel publication order', () => {
    const journal: string[] = [];
    const binding = rootBinding();
    let view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
    const ports: PatchMapRootInteractionPorts = {
      readView: () => view,
      selectAtScreen: (point) => journal.push(`select:${point.x},${point.y}`),
      panBy: (delta) => {
        journal.push(`pan:${delta.x},${delta.y}`);
        view = Object.freeze({ ...view, x: view.x + delta.x, y: view.y + delta.y });
      },
      zoomAt: (point, factor) => {
        journal.push(`zoom:${point.x},${point.y}`);
        view = Object.freeze({ ...view, scale: view.scale * factor });
      },
      hitTestInteractive: (point) => point.x === 7 && point.y === 9,
      requestGestureFrame: () => journal.push('request'),
      setGestureContinuous: (enabled, reason) => {
        journal.push(`continuous:${enabled}:${reason}`);
      },
    };
    const authority = new PatchMapRootInteractionAuthority(
      binding.binder,
      ports,
      { selectionMode: 'immediate', autoRender: true, wheelActivationModifier: 'none' },
    );
    authority.bindPointerInputs((input) => journal.push(`pointer:${input.type}`));
    authority.bindViewportChanges((change) => {
      journal.push(`viewport:${change.source}:${change.view.x},${change.view.y}`);
    });

    binding.handlers().pointer(pointer('down', 10, 20, 1, 0));
    expect(authority.activeGesture).toBe(false);
    binding.handlers().pointer(pointer('move', 15, 26, 1, 0));
    expect(authority.activeGesture).toBe(true);
    binding.handlers().pointer(pointer('up', 15, 26, 1, 0));
    expect(binding.handlers().wheel(wheel(-100))).toBe(true);

    expect(journal).toEqual([
      'pointer:down',
      'select:10,20',
      'pointer:move',
      'request',
      'continuous:true:gesture',
      'pan:5,6',
      'viewport:pointer:5,6',
      'pointer:up',
      'request',
      'continuous:false:gesture-end',
      'zoom:30,40',
      'viewport:wheel:5,6',
    ]);
    expect(authority.activeGesture).toBe(false);
    const contextMenu = (screenX: number, screenY: number) => Object.freeze({
      screenX,
      screenY,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    });
    expect(binding.handlers().contextMenu(contextMenu(7, 9))).toBe(true);
    expect(binding.handlers().contextMenu(contextMenu(0, 0))).toBe(false);
  });

  it('owns gesture policy, listener cleanup, and one idempotent root unbind', () => {
    const journal: string[] = [];
    const binding = rootBinding();
    const authority = new PatchMapRootInteractionAuthority(
      binding.binder,
      staticPorts(journal),
      { selectionMode: 'deferred', autoRender: false, wheelActivationModifier: 'none' },
    );
    authority.bindPointerInputs((input) => journal.push(`pointer:${input.type}`));
    authority.bindViewportChanges((change) => journal.push(`viewport:${change.source}`));

    expect(authority.setZoomLimits([0.5, 4])).toEqual([0.5, 4]);
    expect(authority.zoomLimits).toEqual([0.5, 4]);
    expect(() => authority.setZoomLimits([0, 4])).toThrow('finite, positive, and ordered');
    expect(() => authority.setGesturePolicies(['unknown' as never])).toThrow('unsupported');

    binding.handlers().pointer(pointer('down', 1, 2, 4, 0));
    expect(authority.activeGesture).toBe(false);
    expect(authority.setGesturePolicies(['wheel'])).toEqual(['wheel']);
    expect(authority.activeGesture).toBe(false);
    expect(journal).toEqual([
      'pointer:down',
      'continuous:false:gesture-cancel',
    ]);

    expect(authority.destroy()).toBe(true);
    expect(authority.destroy()).toBe(false);
    expect(binding.unbindCount()).toBe(1);
    expect(authority.pointerListenerCount).toBe(0);
    binding.handlers().pointer(pointer('down', 3, 4, 5, 0));
    expect(binding.handlers().wheel(wheel(-100))).toBe(false);
    expect(journal).toHaveLength(2);
  });

  it('projects context menu through the single root binding and disposes listeners', () => {
    const binding = rootBinding();
    const authority = new PatchMapRootInteractionAuthority(
      binding.binder,
      staticPorts([]),
      { selectionMode: 'deferred', autoRender: false, wheelActivationModifier: 'none' },
    );
    const inputs: unknown[] = [];
    const release = authority.bindContextMenuInputs((input) => {
      inputs.push(input);
      return input.ctrlKey;
    });
    const input = Object.freeze({
      screenX: 30,
      screenY: 40,
      shiftKey: false,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
    });

    expect(binding.handlers().contextMenu(input)).toBe(true);
    expect(inputs).toEqual([input]);
    release();
    expect(binding.handlers().contextMenu(input)).toBe(false);
    expect(inputs).toHaveLength(1);
    authority.bindContextMenuInputs(() => true);
    expect(authority.destroy()).toBe(true);
    expect(binding.handlers().contextMenu(input)).toBe(false);
  });

  it('activates primary pan only beyond the strict per-axis 4 CSS px slop', () => {
    const journal: string[] = [];
    const binding = rootBinding();
    let view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
    const authority = new PatchMapRootInteractionAuthority(
      binding.binder,
      {
        ...staticPorts(journal),
        readView: () => view,
        panBy: (delta) => {
          journal.push(`pan:${delta.x},${delta.y}`);
          view = Object.freeze({ ...view, x: view.x + delta.x, y: view.y + delta.y });
        },
      },
      { selectionMode: 'deferred', autoRender: true, wheelActivationModifier: 'none' },
    );
    authority.bindPointerInputs((input) => journal.push(`pointer:${input.type}`));

    binding.handlers().pointer(pointer('down', 10, 20, 1, 0));
    binding.handlers().pointer(pointer('move', 14, 24, 1, 0));
    expect(authority.activeGesture).toBe(false);
    expect(journal).toEqual(['pointer:down', 'pointer:move']);

    binding.handlers().pointer(pointer('move', 15, 24, 1, 0));
    expect(authority.activeGesture).toBe(true);
    expect(journal.slice(2)).toEqual([
      'pointer:move',
      'request',
      'continuous:true:gesture',
      'pan:5,4',
    ]);

    binding.handlers().pointer(pointer('move', 10, 20, 1, 0));
    expect(authority.activeGesture).toBe(true);
    expect(journal.at(-1)).toBe('pan:-5,-4');
    binding.handlers().pointer(pointer('up', 10, 20, 1, 0));
    expect(authority.activeGesture).toBe(false);
    expect(journal.slice(-3)).toEqual([
      'pointer:up',
      'request',
      'continuous:false:gesture-end',
    ]);
    expect(authority.destroy()).toBe(true);
  });

  it('consumes control-policy wheel only from Ctrl or Meta and only when scale changes', () => {
    const journal: string[] = [];
    const binding = rootBinding();
    let view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
    const authority = new PatchMapRootInteractionAuthority(
      binding.binder,
      {
        ...staticPorts(journal),
        readView: () => view,
        zoomAt: (point, factor) => {
          journal.push(`zoom:${point.x},${point.y}`);
          view = Object.freeze({ ...view, scale: view.scale * factor });
        },
      },
      { selectionMode: 'deferred', autoRender: false, wheelActivationModifier: 'control' },
    );
    authority.bindViewportChanges((change) => journal.push(`viewport:${change.source}`));

    expect(binding.handlers().wheel(wheel(-100))).toBe(false);
    expect(binding.handlers().wheel(wheel(-100, { shiftKey: true }))).toBe(false);
    expect(binding.handlers().wheel(wheel(-100, { altKey: true }))).toBe(false);
    expect(journal).toEqual([]);

    expect(binding.handlers().wheel(wheel(-100, { ctrlKey: true }))).toBe(true);
    expect(binding.handlers().wheel(wheel(-100, { metaKey: true }))).toBe(true);
    expect(journal).toEqual([
      'zoom:30,40',
      'viewport:wheel',
      'zoom:30,40',
      'viewport:wheel',
    ]);

    authority.setZoomLimits([0.5, view.scale]);
    expect(binding.handlers().wheel(wheel(-100, { ctrlKey: true }))).toBe(false);
    expect(journal).toHaveLength(4);
    expect(authority.destroy()).toBe(true);
  });

  it('retries a failed unbind without repeating successful teardown', () => {
    let attempts = 0;
    let handlers: RootInteractionHandlers | null = null;
    const binder: PatchMapRootInteractionBinder = {
      bindRootInteractions: (next) => {
        handlers = next;
        return () => {
          attempts += 1;
          if (attempts === 1) throw new Error('unbind failed');
        };
      },
    };
    const authority = new PatchMapRootInteractionAuthority(
      binder,
      staticPorts([]),
      { selectionMode: 'deferred', autoRender: false, wheelActivationModifier: 'none' },
    );

    expect(handlers).not.toBeNull();
    expect(() => authority.destroy()).toThrow('unbind failed');
    expect(authority.destroy()).toBe(false);
    expect(authority.destroy()).toBe(false);
    expect(attempts).toBe(2);
  });
});

function rootBinding(): Readonly<{
  readonly binder: PatchMapRootInteractionBinder;
  readonly handlers: () => RootInteractionHandlers;
  readonly unbindCount: () => number;
}> {
  let current: RootInteractionHandlers | null = null;
  let unbound = 0;
  return Object.freeze({
    binder: {
      bindRootInteractions: (handlers) => {
        current = handlers;
        return () => {
          unbound += 1;
        };
      },
    },
    handlers: () => {
      if (current === null) throw new Error('root handlers are not bound');
      return current;
    },
    unbindCount: () => unbound,
  });
}

function wheel(
  deltaY: number,
  modifiers: Partial<Pick<RootWheelInput, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>> = {},
): RootWheelInput {
  return Object.freeze({
    screenX: 30,
    screenY: 40,
    deltaY,
    shiftKey: modifiers.shiftKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  });
}

function staticPorts(journal: string[]): PatchMapRootInteractionPorts {
  const view = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  return {
    readView: () => view,
    selectAtScreen: () => journal.push('select'),
    panBy: () => journal.push('pan'),
    zoomAt: () => journal.push('zoom'),
    hitTestInteractive: () => false,
    requestGestureFrame: () => journal.push('request'),
    setGestureContinuous: (enabled, reason) => {
      journal.push(`continuous:${enabled}:${reason}`);
    },
  };
}

function pointer(
  type: PatchMapRootPointerInput['type'],
  screenX: number,
  screenY: number,
  pointerId: number,
  button: number,
): PatchMapRootPointerInput {
  return Object.freeze({
    type,
    screenX,
    screenY,
    pointerId,
    pointerType: 'mouse',
    button,
    buttons: type === 'down' || type === 'move' ? 1 : 0,
    timeMs: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  });
}
