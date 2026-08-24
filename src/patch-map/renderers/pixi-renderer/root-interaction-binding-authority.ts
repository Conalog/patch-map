import type { Container, FederatedPointerEvent } from 'pixi.js';

import type {
  RootInteractionHandlers,
  RootPointerInput,
} from '../types';

interface PatchMapPixiRootInteractionBindingPort {
  readonly stage: Container;
  readonly canvas: HTMLCanvasElement;
  readonly readViewportWidth: () => number;
  readonly readViewportHeight: () => number;
  readonly isSurfacePublished: () => boolean;
}

interface PatchMapDeferredRootInteractionBinding {
  readonly activate: () => void;
  readonly deactivate: () => void;
  readonly release: () => void;
}

/**
 * Owns the fixed Pixi stage and DOM canvas listener set for one root input
 * binding. It translates input only; gesture, selection, and viewport policy
 * remain owned by the Core root interaction authority.
 */
export class PatchMapPixiRootInteractionBindingAuthority {
  private binding: PatchMapDeferredRootInteractionBinding | null = null;
  private activeUnbind: (() => void) | null = null;
  private destroyed = false;

  public constructor(
    private readonly port: PatchMapPixiRootInteractionBindingPort,
  ) {}

  public bind(handlers: RootInteractionHandlers): () => void {
    if (this.destroyed) {
      throw new Error('PatchMap root interaction binding authority is destroyed');
    }
    this.binding?.release();
    let activeUnbind: (() => void) | null = null;
    let released = false;
    const binding: PatchMapDeferredRootInteractionBinding = Object.freeze({
      activate: () => {
        if (released || activeUnbind !== null) return;
        activeUnbind = this.install(handlers);
      },
      deactivate: () => {
        activeUnbind?.();
        activeUnbind = null;
      },
      release: () => {
        if (released) return;
        released = true;
        activeUnbind?.();
        activeUnbind = null;
        if (this.binding === binding) this.binding = null;
      },
    });
    this.binding = binding;
    if (this.port.isSurfacePublished()) binding.activate();
    return binding.release;
  }

  public activate(): void {
    if (!this.destroyed) this.binding?.activate();
  }

  public deactivate(): void {
    this.binding?.deactivate();
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.binding?.release();
    this.binding = null;
    this.activeUnbind?.();
    this.activeUnbind = null;
    return true;
  }

  public probe(): Readonly<{
    readonly rootBindingCount: number;
    readonly rootListenerCount: number;
    readonly entityCallbackCount: number;
  }> {
    return Object.freeze({
      rootBindingCount: this.activeUnbind === null ? 0 : 6,
      rootListenerCount: this.activeUnbind === null ? 0 : 8,
      entityCallbackCount: 0,
    });
  }

  private install(handlers: RootInteractionHandlers): () => void {
    this.activeUnbind?.();
    const { stage, canvas } = this.port;
    const capturedPointerIds = new Set<number>();
    const capturePointer = (pointerId: number): void => {
      try {
        canvas.setPointerCapture(pointerId);
        capturedPointerIds.add(pointerId);
      } catch {
        // Synthetic/non-active pointer input cannot be captured. Federated
        // pointerupoutside remains the fallback completion path.
      }
    };
    const releasePointer = (pointerId: number): void => {
      capturedPointerIds.delete(pointerId);
      try {
        if (canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
      } catch {
        // The browser may implicitly release capture before this root cleanup.
      }
    };
    const pointerInput = (
      type: RootPointerInput['type'],
      event: FederatedPointerEvent,
    ): RootPointerInput => Object.freeze({
      type,
      screenX: event.global.x,
      screenY: event.global.y,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      timeMs: event.timeStamp,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    const pointerDown = (event: FederatedPointerEvent): void => {
      capturePointer(event.pointerId);
      handlers.pointer(pointerInput('down', event));
    };
    const pointerMove = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('move', event));
    };
    const pointerUp = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up', event));
      releasePointer(event.pointerId);
    };
    const pointerUpOutside = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up-outside', event));
      releasePointer(event.pointerId);
    };
    const pointerCancel = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('cancel', event));
      releasePointer(event.pointerId);
    };
    const pointerLeave = (event: PointerEvent): void => {
      if (capturedPointerIds.has(event.pointerId)) return;
      const width = this.port.readViewportWidth();
      const height = this.port.readViewportHeight();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? width / bounds.width : 1;
      const scaleY = bounds.height > 0 ? height / bounds.height : 1;
      handlers.pointer(Object.freeze({
        type: 'leave',
        screenX: (event.clientX - bounds.left) * scaleX,
        screenY: (event.clientY - bounds.top) * scaleY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        timeMs: event.timeStamp,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    };
    // Pixi v8 forwards wheel through a passive native listener in Chromium.
    // Keep pointer input federated, but own one non-passive root canvas wheel
    // listener so only a committed zoom prevents native scroll without a warning.
    const wheel = (event: WheelEvent): void => {
      const width = this.port.readViewportWidth();
      const height = this.port.readViewportHeight();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? width / bounds.width : 1;
      const scaleY = bounds.height > 0 ? height / bounds.height : 1;
      const handled = handlers.wheel(Object.freeze({
        screenX: (event.clientX - bounds.left) * scaleX,
        screenY: (event.clientY - bounds.top) * scaleY,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
      if (handled) event.preventDefault();
    };
    const contextMenu = (event: MouseEvent): void => {
      const width = this.port.readViewportWidth();
      const height = this.port.readViewportHeight();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? width / bounds.width : 1;
      const scaleY = bounds.height > 0 ? height / bounds.height : 1;
      if (handlers.contextMenu(Object.freeze({
        screenX: (event.clientX - bounds.left) * scaleX,
        screenY: (event.clientY - bounds.top) * scaleY,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }))) {
        event.preventDefault();
      }
    };
    const unbind = (): void => {
      stage.off('pointerdown', pointerDown);
      stage.off('pointermove', pointerMove);
      stage.off('pointerup', pointerUp);
      stage.off('pointerupoutside', pointerUpOutside);
      stage.off('pointercancel', pointerCancel);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('contextmenu', contextMenu);
      for (const pointerId of capturedPointerIds) releasePointer(pointerId);
      capturedPointerIds.clear();
      if (this.activeUnbind === unbind) this.activeUnbind = null;
    };
    this.activeUnbind = unbind;
    try {
      stage.on('pointerdown', pointerDown);
      stage.on('pointermove', pointerMove);
      stage.on('pointerup', pointerUp);
      stage.on('pointerupoutside', pointerUpOutside);
      stage.on('pointercancel', pointerCancel);
      canvas.addEventListener('wheel', wheel, { passive: false });
      canvas.addEventListener('pointerleave', pointerLeave);
      canvas.addEventListener('contextmenu', contextMenu);
    } catch (error) {
      unbind();
      throw error;
    }
    return unbind;
  }
}
