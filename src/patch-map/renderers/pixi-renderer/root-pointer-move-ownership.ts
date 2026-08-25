import type { FederatedPointerEvent } from 'pixi.js';

type PatchMapPixiPointerMove = Pick<
  FederatedPointerEvent,
  'nativeEvent' | 'pointerId'
>;

/**
 * Pixi listens for pointer moves at document capture scope. Keep idle map
 * hover scoped to the renderer canvas, while preserving a pointer sequence
 * that the canvas already owns from pointer down.
 */
export function ownsPatchMapPixiPointerMove(
  canvas: HTMLCanvasElement,
  activePointerIds: ReadonlySet<number>,
  event: PatchMapPixiPointerMove,
): boolean {
  if (activePointerIds.has(event.pointerId)) return true;
  const nativeEvent = event.nativeEvent;
  const path = 'composedPath' in nativeEvent && typeof nativeEvent.composedPath === 'function'
    ? nativeEvent.composedPath()
    : [];
  return (path[0] ?? nativeEvent.target) === canvas;
}
