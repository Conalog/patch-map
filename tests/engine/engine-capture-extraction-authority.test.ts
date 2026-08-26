import { describe, expect, it } from 'vitest';

import { PatchMapCaptureExtractionAuthority } from '../../src/engine/capture-extraction-authority';
import type { PatchMapEngineSurface } from '../../src/engine/contracts';
import { PatchMapManagedFrameLoopAuthority } from '../../src/engine/managed-frame-loop-authority';
import {
  createPatchMapOperationDiagnostic,
  createPatchMapOperationError,
} from '../../src/engine/operation-outcomes';
import { PatchMapPublicationAuthority } from '../../src/engine/publication-authority';
import type {
  PatchMapEngineDiagnostic,
} from '../../src/engine/contracts/lifecycle';
import { PatchMapExtractionSecurityAuthority } from '../../src/operations';

describe('PatchMapCaptureExtractionAuthority', () => {
  it('serializes managed captures and applies deferred reentrant resize before resume', async () => {
    const harness = captureHarness();
    const resizeObserver = resizeObserverHarness();
    const resizePausedStates: boolean[] = [];
    let reentered = false;
    harness.onResize = () => {
      resizePausedStates.push(harness.frameLoop.pause() === false);
      if (reentered) return;
      reentered = true;
      resizeObserver.setSize(720, 405);
      resizeObserver.notify();
    };
    harness.authority.observeMountSize(resizeObserver.target, 2);

    const first = harness.authority.captureManagedPng();
    await Promise.resolve();
    const second = harness.authority.captureManagedPng();
    await Promise.resolve();
    expect(harness.surface.captureCount).toBe(1);
    expect(harness.frameLoop.pause()).toBe(false);

    resizeObserver.setSize(640, 360);
    resizeObserver.notify();
    resizeObserver.setSize(680, 382.5);
    resizeObserver.notify();
    expect(harness.resizes).toEqual([]);

    harness.surface.resolveNextCapture();
    await expect(first).resolves.toMatchObject({
      capturedTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [320, 180],
    });
    await Promise.resolve();
    expect(harness.resizes).toEqual([
      [680, 382.5, 2],
      [720, 405, 2],
    ]);
    expect(resizePausedStates).toEqual([true, true]);
    expect(harness.surface.captureCount).toBe(2);

    harness.surface.resolveNextCapture();
    await expect(second).resolves.toMatchObject({ mime: 'image/png' });
    expect(harness.pendingWork).toBe(0);
    expect(harness.frameLoop.pause()).toBe(true);
    harness.frameLoop.resume();
  });

  it('uses the injected security authority before acquiring capture work', async () => {
    const harness = captureHarness();
    harness.extractionSecurity.setAssetReadability('unreadable-source', 'tainted');

    await expect(harness.authority.extractPublishedScene(currentRequest())).rejects.toMatchObject({
      diagnostic: {
        code: 'EXTRACTION_TAINTED',
        category: 'EXTRACTION_FAILURE',
      },
    });

    expect(harness.surface.captureCount).toBe(0);
    expect(harness.pendingWork).toBe(0);
    expect(harness.diagnostics).toHaveLength(1);
  });

  it('recovers managed capture state when preparation fails and advances the queue', async () => {
    const harness = captureHarness();
    harness.surface.failNextDebugSnapshot = true;

    const failed = harness.authority.captureManagedPng();
    const queued = harness.authority.captureManagedPng();
    await expect(failed).rejects.toThrow('capture debug preparation failed');
    await Promise.resolve();
    expect(harness.surface.captureCount).toBe(1);

    harness.surface.resolveNextCapture();
    await expect(queued).resolves.toMatchObject({
      capturedTuple: { scene: 1, view: 0, interaction: 0 },
      mime: 'image/png',
    });
    expect(harness.pendingWork).toBe(0);
    expect(harness.frameLoop.pause()).toBe(true);
    harness.frameLoop.resume();
  });

  it('balances pending work across supersede and destroy settlements', async () => {
    const superseded = captureHarness();
    const supersededCapture = superseded.authority.extractPublishedScene(currentRequest());
    expect(superseded.pendingWork).toBe(1);
    superseded.publication.advanceView();
    superseded.publication.commitFrame();
    superseded.surface.resolveNextCapture();
    await expect(supersededCapture).rejects.toMatchObject({
      diagnostic: { code: 'SUPERSEDED', category: 'SUPERSEDED' },
    });
    expect(superseded.pendingWork).toBe(0);
    expect(superseded.diagnostics).toEqual([
      expect.objectContaining({ code: 'SUPERSEDED' }),
    ]);

    const destroyed = captureHarness();
    const destroyedCapture = destroyed.authority.extractPublishedScene(currentRequest());
    expect(destroyed.pendingWork).toBe(1);
    destroyed.destroyed = true;
    destroyed.liveSurface = null;
    destroyed.authority.destroy();
    destroyed.surface.resolveNextCapture();
    await expect(destroyedCapture).rejects.toMatchObject({
      diagnostic: { code: 'DESTROYED', category: 'DESTROYED' },
    });
    expect(destroyed.pendingWork).toBe(0);
    expect(destroyed.diagnostics).toEqual([]);
  });
});

function captureHarness(): {
  readonly authority: PatchMapCaptureExtractionAuthority;
  readonly diagnostics: PatchMapEngineDiagnostic[];
  readonly extractionSecurity: PatchMapExtractionSecurityAuthority;
  readonly frameLoop: PatchMapManagedFrameLoopAuthority;
  readonly publication: PatchMapPublicationAuthority;
  readonly resizes: Array<readonly [number, number, number]>;
  readonly surface: DeferredCaptureSurface;
  destroyed: boolean;
  liveSurface: PatchMapEngineSurface | null;
  onResize: (() => void) | null;
  readonly pendingWork: number;
} {
  const publication = new PatchMapPublicationAuthority();
  publication.advanceScene();
  publication.commitFrame();
  const extractionSecurity = new PatchMapExtractionSecurityAuthority();
  const frameLoop = new PatchMapManagedFrameLoopAuthority();
  const surface = new DeferredCaptureSurface();
  const diagnostics: PatchMapEngineDiagnostic[] = [];
  const resizes: Array<readonly [number, number, number]> = [];
  let destroyed = false;
  let liveSurface: PatchMapEngineSurface | null = surface as unknown as PatchMapEngineSurface;
  let pendingWork = 0;
  let onResize: (() => void) | null = null;
  frameLoop.create({
    activeAnimations: 0,
    frameWorkloadSize: 1,
    frameTimeMs: 0,
    viewportGestureActive: false,
    get destroyed() {
      return destroyed;
    },
    publishFrame: () => publication.commitFrame(),
  }, {
    driver: {
      now: () => 1,
      request: () => 1,
      cancel: () => undefined,
    },
  });
  const authority = new PatchMapCaptureExtractionAuthority(
    extractionSecurity,
    frameLoop,
    publication,
    {
      requireSurface: (operation) => {
        if (destroyed) {
          throw createPatchMapOperationError(
            publication.revisionStamp(),
            'DESTROYED',
            'DESTROYED',
            operation,
            false,
          );
        }
        if (liveSurface === null) {
          throw createPatchMapOperationError(
            publication.revisionStamp(),
            'NOT_READY',
            'NOT_READY',
            operation,
            true,
          );
        }
        return liveSurface;
      },
      liveSurface: () => liveSurface,
      authoritativeCanvas: () => surface.canvas,
      isDestroyingOrDestroyed: () => destroyed,
      resize: (width, height, pixelRatio) => {
        resizes.push(Object.freeze([width, height, pixelRatio]));
        onResize?.();
      },
      adjustPendingWork: (delta) => {
        pendingWork += delta;
      },
      operationError: (code, category, operation, recoverable) =>
        createPatchMapOperationError(
          publication.revisionStamp(),
          code,
          category,
          operation,
          recoverable,
        ),
      operationDiagnostic: (code, category, operation, recoverable) =>
        createPatchMapOperationDiagnostic(
          publication.revisionStamp(),
          code,
          category,
          operation,
          recoverable,
        ),
      emitDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
  );
  return {
    authority,
    diagnostics,
    extractionSecurity,
    frameLoop,
    publication,
    resizes,
    surface,
    get destroyed() {
      return destroyed;
    },
    set destroyed(value: boolean) {
      destroyed = value;
    },
    get liveSurface() {
      return liveSurface;
    },
    set liveSurface(value: PatchMapEngineSurface | null) {
      liveSurface = value;
    },
    get onResize() {
      return onResize;
    },
    set onResize(value: (() => void) | null) {
      onResize = value;
    },
    get pendingWork() {
      return pendingWork;
    },
  };
}

class DeferredCaptureSurface {
  public readonly canvas = {} as HTMLCanvasElement;
  public captureCount = 0;
  public failNextDebugSnapshot = false;
  private readonly captureResolvers: Array<() => void> = [];

  public canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public captureBase64(): Promise<string> {
    this.captureCount += 1;
    return new Promise((resolve) => {
      this.captureResolvers.push(() => resolve('data:image/png;base64,cGl4aQ=='));
    });
  }

  public resolveNextCapture(): void {
    const resolve = this.captureResolvers.shift();
    if (resolve === undefined) throw new Error('no pending capture');
    resolve();
  }

  public debugSnapshot(): Readonly<{
    cssSize: readonly [number, number];
    backingSize: readonly [number, number];
  }> {
    if (this.failNextDebugSnapshot) {
      this.failNextDebugSnapshot = false;
      throw new Error('capture debug preparation failed');
    }
    return Object.freeze({
      cssSize: Object.freeze([320, 180] as const),
      backingSize: Object.freeze([640, 360] as const),
    });
  }
}

function currentRequest() {
  return Object.freeze({
    targetTuple: Object.freeze({ scene: 1, view: 0, interaction: 0 }),
    cssSize: Object.freeze([320, 180] as const),
    mime: 'image/png' as const,
  });
}

function resizeObserverHarness(): Readonly<{
  target: HTMLElement;
  notify: () => void;
  setSize: (width: number, height: number) => void;
}> {
  let width = 320;
  let height = 180;
  let callback: ResizeObserverCallback | null = null;
  const Observer = class {
    public constructor(value: ResizeObserverCallback) {
      callback = value;
    }

    public observe(): void {}

    public disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  const target = {
    ownerDocument: {
      defaultView: {
        ResizeObserver: Observer,
      },
    },
    getBoundingClientRect: () => ({ width, height }),
  } as unknown as HTMLElement;
  return Object.freeze({
    target,
    notify: () => {
      if (callback === null) throw new Error('resize observer is not registered');
      callback([], {} as ResizeObserver);
    },
    setSize: (nextWidth, nextHeight) => {
      width = nextWidth;
      height = nextHeight;
    },
  });
}
