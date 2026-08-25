import type { FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { ownsPatchMapPixiPointerMove } from '../../src/patch-map/renderers/pixi-renderer/root-pointer-move-ownership';
import { PatchMapPointerGestureAuthority } from '../../src/patch-map';

describe('PatchMap Pixi root pointer-move ownership', () => {
  it('does not create map hover from a document move targeted at a host DOM overlay', () => {
    const canvas = target() as HTMLCanvasElement;
    const overlay = target();
    const authority = new PatchMapPointerGestureAuthority({
      hitTest: () => 'panel-a',
    });
    const activePointerIds = new Set<number>();
    const event = pointerMove(1, overlay, [overlay]);
    let dispatchCount = 0;

    if (ownsPatchMapPixiPointerMove(canvas, activePointerIds, event)) {
      dispatchCount += 1;
      authority.dispatch(pointerInput('move', 1, 20, 30, 0, 0));
    }

    expect(dispatchCount).toBe(0);
    expect(authority.probe().hoverTarget).toBeNull();
  });

  it('accepts canvas idle hover through composed-path retargeting', () => {
    const canvas = target() as HTMLCanvasElement;
    const shadowRetarget = target();
    const authority = new PatchMapPointerGestureAuthority({
      hitTest: () => 'panel-a',
    });
    const event = pointerMove(2, shadowRetarget, [canvas, shadowRetarget]);

    if (ownsPatchMapPixiPointerMove(canvas, new Set(), event)) {
      authority.dispatch(pointerInput('move', 2, 20, 30, 0, 0));
    }

    expect(authority.probe().hoverTarget).toBe('panel-a');
  });

  it('keeps a canvas-owned active drag moving across a DOM overlay', () => {
    const canvas = target() as HTMLCanvasElement;
    const overlay = target();
    const authority = new PatchMapPointerGestureAuthority({
      hitTest: () => 'panel-a',
    });
    const activePointerIds = new Set([3]);
    authority.dispatch(pointerInput('down', 3, 20, 30, 0, 1));
    const event = pointerMove(3, overlay, [overlay]);
    let moveEventTypes: readonly string[] = [];

    if (ownsPatchMapPixiPointerMove(canvas, activePointerIds, event)) {
      moveEventTypes = authority.dispatch(pointerInput('move', 3, 30, 40, 16, 1))
        .events.map(({ type }) => type);
    }

    expect(moveEventTypes).toEqual(['drag-start', 'drag-update']);
    expect(authority.probe().activePointerCount).toBe(1);
  });
});

function target(): EventTarget {
  return {} as EventTarget;
}

function pointerMove(
  pointerId: number,
  nativeTarget: EventTarget,
  composedPath: readonly EventTarget[],
): Pick<FederatedPointerEvent, 'nativeEvent' | 'pointerId'> {
  return {
    pointerId,
    nativeEvent: {
      target: nativeTarget,
      composedPath: () => [...composedPath],
    } as unknown as PointerEvent,
  };
}

function pointerInput(
  type: 'down' | 'move',
  pointerId: number,
  x: number,
  y: number,
  timeMs: number,
  buttons: number,
) {
  return {
    type,
    pointerId,
    screen: [x, y] as const,
    timeMs,
    pointerType: 'mouse',
    button: 0,
    buttons,
    viewRevision: 0,
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
  } as const;
}
