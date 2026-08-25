import { describe, expect, it } from 'vitest';
import type { Application } from 'pixi.js';

import { pixiDevtoolsOwnsApplication } from '../../src/patch-map/renderers/pixi-devtools-registration';
import type { PatchMapCanvasSurfaceLifecycle } from '../../src/patch-map/renderers/pixi-renderer/canvas-surface-lifecycle';
import type { PatchMapPixiRootInteractionBindingAuthority } from '../../src/patch-map/renderers/pixi-renderer/root-interaction-binding-authority';
import { PatchMapPixiSurfacePublicationAuthority } from '../../src/patch-map/renderers/pixi-renderer/surface-publication-authority';

describe('PatchMap Pixi surface publication authority', () => {
  it('publishes once, restores the original render, and owns loss/devtools cleanup', () => {
    const application = fakeApplication(2);
    const canvas = fakeCanvas();
    const lifecycle = new FakeCanvasLifecycle();
    const root = new FakeRootBindings();
    let lossCount = 0;
    let restorationCount = 0;
    const authority = createAuthority({
      application,
      canvas,
      lifecycle,
      root,
      devtoolsRequested: true,
      onContextLost: () => { lossCount += 1; },
      onContextRestored: () => { restorationCount += 1; },
    });
    const originalRender = application.value.render;

    authority.armInitialRender();
    const initialRender = application.value.render;
    expect(initialRender).not.toBe(originalRender);
    application.value.render();

    expect(application.value.render).toBe(originalRender);
    expect(authority.published).toBe(true);
    expect(authority.rendererLossListenerCount).toBe(2);
    expect(application.renderCount).toBe(1);
    expect(lifecycle.publishCount).toBe(1);
    expect(root.activateCount).toBe(1);
    expect(pixiDevtoolsOwnsApplication(application.value)).toBe(true);

    const lost = preventableEvent();
    canvas.dispatch('webglcontextlost', lost);
    canvas.dispatch('webglcontextrestored', {} as Event);
    expect(lost.defaultPrevented).toBe(true);
    expect(lossCount).toBe(1);
    expect(restorationCount).toBe(1);

    application.value.render();
    expect(application.renderCount).toBe(2);
    expect(lifecycle.publishCount).toBe(1);
    expect(root.activateCount).toBe(1);

    expect(authority.deactivate()).toBe(true);
    expect(authority.deactivate()).toBe(false);
    expect(authority.published).toBe(false);
    expect(authority.rendererLossListenerCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);
    expect(pixiDevtoolsOwnsApplication(application.value)).toBe(false);
    expect(authority.destroyCanvas()).toBe(true);
    expect(authority.destroyCanvas()).toBe(false);
  });

  it('rolls publication back in reverse order and keeps the one-shot wrapper for retry', () => {
    const trace: string[] = [];
    const application = fakeApplication(2);
    const canvas = fakeCanvas(trace);
    const lifecycle = new FakeCanvasLifecycle(trace);
    const root = new FakeRootBindings(trace);
    root.throwOnActivate = true;
    const authority = createAuthority({ application, canvas, lifecycle, root });
    const originalRender = application.value.render;
    authority.armInitialRender();
    const initialRender = application.value.render;

    expect(() => application.value.render()).toThrow('root activation failed');
    expect(application.value.render).toBe(initialRender);
    expect(application.renderCount).toBe(1);
    expect(authority.published).toBe(false);
    expect(authority.rendererLossListenerCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);
    expect(root.deactivateCount).toBe(1);
    expect(lifecycle.rollbackCount).toBe(1);
    expect(trace).toEqual([
      'canvas.publish',
      'canvas.add:webglcontextlost',
      'canvas.add:webglcontextrestored',
      'root.activate',
      'root.deactivate',
      'canvas.remove:webglcontextlost',
      'canvas.remove:webglcontextrestored',
      'canvas.rollback',
    ]);

    root.throwOnActivate = false;
    trace.length = 0;
    application.value.render();
    expect(application.value.render).toBe(originalRender);
    expect(application.renderCount).toBe(2);
    expect(authority.published).toBe(true);
    expect(lifecycle.publishCount).toBe(2);
    expect(root.activateCount).toBe(2);
    expect(trace.slice(0, 4)).toEqual([
      'canvas.publish',
      'canvas.add:webglcontextlost',
      'canvas.add:webglcontextrestored',
      'root.activate',
    ]);
    authority.deactivate();
    authority.destroyCanvas();
  });

  it('retains the wrapper and leaves publication untouched when Pixi render itself fails', () => {
    const application = fakeApplication(2, 1);
    const canvas = fakeCanvas();
    const lifecycle = new FakeCanvasLifecycle();
    const root = new FakeRootBindings();
    const authority = createAuthority({ application, canvas, lifecycle, root });
    const originalRender = application.value.render;
    authority.armInitialRender();
    const initialRender = application.value.render;

    expect(() => application.value.render()).toThrow('render failed');
    expect(application.value.render).toBe(initialRender);
    expect(application.value.render).not.toBe(originalRender);
    expect(application.renderCount).toBe(0);
    expect(lifecycle.publishCount).toBe(0);
    expect(root.activateCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);

    application.value.render();
    expect(application.value.render).toBe(originalRender);
    expect(application.renderCount).toBe(1);
    expect(authority.published).toBe(true);
    authority.deactivate();
    authority.destroyCanvas();
  });

  it('keeps publication side effects at zero until render and listener installation succeed', () => {
    const application = fakeApplication(2);
    const canvas = fakeCanvas();
    const lifecycle = new FakeCanvasLifecycle();
    const root = new FakeRootBindings();
    let contextAvailable = false;
    const authority = createAuthority({
      application,
      canvas,
      lifecycle,
      root,
      assertInitialRenderAvailable: () => {
        if (!contextAvailable) throw new Error('context lost');
      },
    });
    authority.armInitialRender();

    expect(() => application.value.render()).toThrow('context lost');
    expect(application.renderCount).toBe(0);
    expect(lifecycle.publishCount).toBe(0);
    expect(root.activateCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);

    contextAvailable = true;
    canvas.throwOnAddType = 'webglcontextrestored';
    expect(() => application.value.render()).toThrow('listener install failed');
    expect(application.renderCount).toBe(1);
    expect(lifecycle.publishCount).toBe(1);
    expect(lifecycle.rollbackCount).toBe(1);
    expect(root.activateCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);

    canvas.throwOnAddType = null;
    application.value.render();
    expect(application.renderCount).toBe(2);
    expect(authority.published).toBe(true);
    expect(authority.rendererLossListenerCount).toBe(2);
    authority.deactivate();
    authority.destroyCanvas();
  });

  it('does not install WebGL loss listeners for a non-WebGL2 renderer', () => {
    const application = fakeApplication(1);
    const canvas = fakeCanvas();
    const lifecycle = new FakeCanvasLifecycle();
    const root = new FakeRootBindings();
    const authority = createAuthority({ application, canvas, lifecycle, root });
    authority.armInitialRender();
    application.value.render();

    expect(authority.published).toBe(true);
    expect(authority.rendererLossListenerCount).toBe(0);
    expect(canvas.listenerCount()).toBe(0);
    authority.deactivate();
    authority.destroyCanvas();
  });
});

function createAuthority(input: Readonly<{
  application: ReturnType<typeof fakeApplication>;
  canvas: ReturnType<typeof fakeCanvas>;
  lifecycle: FakeCanvasLifecycle;
  root: FakeRootBindings;
  devtoolsRequested?: boolean;
  assertInitialRenderAvailable?: () => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}>): PatchMapPixiSurfacePublicationAuthority {
  return new PatchMapPixiSurfacePublicationAuthority({
    application: input.application.value,
    canvas: input.canvas.value,
    canvasLifecycle: input.lifecycle as unknown as PatchMapCanvasSurfaceLifecycle,
    rootInteractionBindings:
      input.root as unknown as PatchMapPixiRootInteractionBindingAuthority,
    devtoolsRequested: input.devtoolsRequested ?? false,
    assertInitialRenderAvailable: input.assertInitialRenderAvailable ?? (() => undefined),
    onContextLost: input.onContextLost ?? (() => undefined),
    onContextRestored: input.onContextRestored ?? (() => undefined),
  });
}

function fakeApplication(webGLVersion: 1 | 2, initialRenderFailures = 0): Readonly<{
  value: Application;
  render: () => void;
  readonly renderCount: number;
}> {
  let renderCount = 0;
  let renderFailures = initialRenderFailures;
  const value = {
    renderer: {
      name: 'WebGLRenderer',
      context: { webGLVersion, isLost: false },
    },
    render(): void {
      if (renderFailures > 0) {
        renderFailures -= 1;
        throw new Error('render failed');
      }
      renderCount += 1;
    },
  } as unknown as Application;
  return {
    value,
    render: () => value.render(),
    get renderCount() { return renderCount; },
  };
}

class FakeCanvasLifecycle {
  public publishCount = 0;
  public rollbackCount = 0;
  private destroyed = false;

  public constructor(private readonly trace: string[] = []) {}

  public publish(): boolean {
    this.trace.push('canvas.publish');
    this.publishCount += 1;
    return true;
  }

  public rollbackPublication(): boolean {
    this.trace.push('canvas.rollback');
    this.rollbackCount += 1;
    return true;
  }

  public destroy(): boolean {
    this.trace.push('canvas.destroy');
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
}

class FakeRootBindings {
  public activateCount = 0;
  public deactivateCount = 0;
  public throwOnActivate = false;

  public constructor(private readonly trace: string[] = []) {}

  public activate(): void {
    this.trace.push('root.activate');
    this.activateCount += 1;
    if (this.throwOnActivate) throw new Error('root activation failed');
  }

  public deactivate(): void {
    this.trace.push('root.deactivate');
    this.deactivateCount += 1;
  }
}

function fakeCanvas(trace: string[] = []): {
  value: HTMLCanvasElement;
  dispatch(type: string, event: Event): void;
  listenerCount(): number;
  get throwOnAddType(): string | null;
  set throwOnAddType(value: string | null);
} {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  let throwOnAddType: string | null = null;
  const value = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      if (type === throwOnAddType) throw new Error('listener install failed');
      trace.push(`canvas.add:${type}`);
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      trace.push(`canvas.remove:${type}`);
      listeners.get(type)?.delete(listener);
    },
  } as unknown as HTMLCanvasElement;
  return {
    value,
    dispatch(type, event): void {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    },
    listenerCount(): number {
      return [...listeners.values()].reduce((count, values) => count + values.size, 0);
    },
    get throwOnAddType() { return throwOnAddType; },
    set throwOnAddType(value: string | null) { throwOnAddType = value; },
  };
}

function preventableEvent(): Event & Readonly<{ defaultPrevented: boolean }> {
  return {
    defaultPrevented: false,
    preventDefault(): void {
      Reflect.set(this, 'defaultPrevented', true);
    },
  } as unknown as Event & Readonly<{ defaultPrevented: boolean }>;
}
