import type { Application } from 'pixi.js';

import {
  registerPixiDevtools,
  unregisterPixiDevtools,
} from '../pixi-devtools-registration';
import {
  activeRendererBackend,
} from './backend-public-surface';
import type { PatchMapCanvasSurfaceLifecycle } from './canvas-surface-lifecycle';
import type { PatchMapPixiRootInteractionBindingAuthority } from './root-interaction-binding-authority';

export interface PatchMapPixiSurfacePublicationAuthorityOptions {
  readonly application: Application;
  readonly canvas: HTMLCanvasElement;
  readonly canvasLifecycle: PatchMapCanvasSurfaceLifecycle;
  readonly rootInteractionBindings: PatchMapPixiRootInteractionBindingAuthority;
  readonly devtoolsRequested: boolean;
  readonly assertInitialRenderAvailable: () => void;
  readonly onContextLost: () => void;
  readonly onContextRestored: () => void;
}

/**
 * Owns the one-shot transition from a staged Pixi application to the visible
 * PatchMap surface. Steady renders return to Pixi's original render function.
 */
export class PatchMapPixiSurfacePublicationAuthority {
  private readonly devtoolsToken = Object.freeze({});
  private contextLossUnbind: (() => void) | null = null;
  private devtoolsRegistered = false;
  private publishedValue = false;
  private armed = false;
  private deactivated = false;

  public constructor(
    private readonly options: PatchMapPixiSurfacePublicationAuthorityOptions,
  ) {}

  public get published(): boolean {
    return this.publishedValue;
  }

  public get rendererLossListenerCount(): 0 | 2 {
    return this.contextLossUnbind === null ? 0 : 2;
  }

  public armInitialRender(): void {
    if (this.armed) return;
    this.armed = true;
    const render = this.options.application.render;
    this.options.application.render = () => {
      this.options.assertInitialRenderAvailable();
      render.call(this.options.application);
      this.publishAfterSuccessfulRender();
      this.options.application.render = render;
    };
  }

  /** Release publication-side bindings before the renderer destroys Pixi. */
  public deactivate(): boolean {
    if (this.deactivated) return false;
    this.deactivated = true;
    this.contextLossUnbind?.();
    this.contextLossUnbind = null;
    if (this.devtoolsRegistered) {
      unregisterPixiDevtools(this.devtoolsToken);
      this.devtoolsRegistered = false;
    }
    this.publishedValue = false;
    return true;
  }

  /** Restore caller canvas ownership only after Pixi has released the view. */
  public destroyCanvas(): boolean {
    return this.options.canvasLifecycle.destroy();
  }

  private publishAfterSuccessfulRender(): void {
    if (this.publishedValue) return;
    try {
      this.options.canvasLifecycle.publish();
      this.bindRendererLossEvents();
      this.options.rootInteractionBindings.activate();
      if (this.options.devtoolsRequested) {
        registerPixiDevtools(this.devtoolsToken, this.options.application);
        this.devtoolsRegistered = true;
      }
      this.publishedValue = true;
    } catch (error) {
      if (this.devtoolsRegistered) {
        unregisterPixiDevtools(this.devtoolsToken);
        this.devtoolsRegistered = false;
      }
      this.options.rootInteractionBindings.deactivate();
      this.contextLossUnbind?.();
      this.contextLossUnbind = null;
      this.options.canvasLifecycle.rollbackPublication();
      throw error;
    }
  }

  private bindRendererLossEvents(): void {
    if (activeRendererBackend(this.options.application) !== 'webgl2') return;
    const lost = (event: Event): void => {
      event.preventDefault();
      if (this.deactivated) return;
      this.options.onContextLost();
    };
    const restored = (): void => {
      if (this.deactivated) return;
      this.options.onContextRestored();
    };
    const unbind = (): void => {
      this.options.canvas.removeEventListener('webglcontextlost', lost);
      this.options.canvas.removeEventListener('webglcontextrestored', restored);
    };
    this.contextLossUnbind = unbind;
    try {
      this.options.canvas.addEventListener('webglcontextlost', lost);
      this.options.canvas.addEventListener('webglcontextrestored', restored);
    } catch (error) {
      unbind();
      this.contextLossUnbind = null;
      throw error;
    }
  }
}
