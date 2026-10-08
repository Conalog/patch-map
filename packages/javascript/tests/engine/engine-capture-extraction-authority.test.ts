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
  it('classifies native image failures using the same renderer-loss policy as extraction', async () => {
    const harness = captureHarness();
    harness.surface.lossDuringBlob = true;
    const image = harness.authority.renderImage({ mime: 'image/png' });
    await expect(image).rejects.toMatchObject({ diagnostic: { code: 'RENDERER_LOST' } });
    expect(harness.pendingWork).toBe(0);
    expect(harness.diagnostics).toHaveLength(1);
  });

  it('snapshots one published viewport into a native Blob with the requested MIME and quality', async () => {
    const harness = captureHarness();
    const image = harness.authority.renderImage({ mime: 'image/jpeg', quality: 0.9 });
    await drainMicrotasks();
    expect(harness.publishedFrameCount).toBe(1);
    expect(harness.surface.blobRequests).toMatchObject([{ mime: 'image/jpeg', quality: 0.9 }]);
    harness.surface.resolveBlob(new Blob(['jpeg'], { type: 'image/jpeg' }));
    await expect(image).resolves.toMatchObject({ mime: 'image/jpeg', size: [640, 360] });
    expect(harness.surface.captureCount).toBe(0);
    expect(harness.pendingWork).toBe(0);
  });

  it('waits for assets and rejects concurrent rendering without publishing an incomplete scene', async () => {
    const harness = captureHarness();
    let ready = (): void => undefined;
    harness.assetsReady = new Promise((resolve) => { ready = resolve; });
    const first = harness.authority.renderImage({ mime: 'image/png' });
    await expect(harness.authority.renderImage({ mime: 'image/png' })).rejects.toMatchObject({
      diagnostic: { code: 'CONFLICT' },
    });
    expect(harness.publishedFrameCount).toBe(0);
    ready();
    await drainMicrotasks();
    harness.surface.resolveBlob(new Blob(['png'], { type: 'image/png' }));
    await expect(first).resolves.toMatchObject({ mime: 'image/png' });
    expect(harness.pendingWork).toBe(0);
  });

  it.each(['assets', 'encoding'] as const)('cancels during %s without waiting for native completion', async (phase) => {
    const harness = captureHarness();
    if (phase === 'assets') harness.assetsReady = new Promise(() => undefined);
    const controller = new AbortController();
    const image = harness.authority.renderImage({ mime: 'image/png', signal: controller.signal });
    await drainMicrotasks();
    controller.abort();
    await expect(image).rejects.toMatchObject({ diagnostic: { code: 'CANCELLED' } });
    expect(harness.pendingWork).toBe(0);
    if (phase === 'encoding') harness.surface.resolveBlob(null);
  });

  it('rejects changed scenes before publication and changed views after encoding', async () => {
    const scene = captureHarness();
    const image = scene.authority.renderImage({ mime: 'image/png' });
    scene.publication.advanceScene();
    await expect(image).rejects.toMatchObject({ diagnostic: { code: 'SUPERSEDED' } });
    expect(scene.publishedFrameCount).toBe(0);
    expect(scene.pendingWork).toBe(0);

    const view = captureHarness();
    const encoded = view.authority.renderImage({ mime: 'image/png' });
    await drainMicrotasks();
    view.publication.advanceView();
    view.surface.resolveBlob(new Blob(['png'], { type: 'image/png' }));
    await expect(encoded).rejects.toMatchObject({ diagnostic: { code: 'SUPERSEDED' } });
    expect(view.pendingWork).toBe(0);
  });

  it('rejects destroy immediately while the encoder is pending', async () => {
    const harness = captureHarness();
    const image = harness.authority.renderImage({ mime: 'image/png' });
    await drainMicrotasks();
    harness.destroyed = true;
    harness.authority.destroy();
    await expect(image).rejects.toMatchObject({ diagnostic: { code: 'DESTROYED' } });
    expect(harness.pendingWork).toBe(0);
    expect(harness.diagnostics).toEqual([]);
    harness.surface.resolveBlob(null);
  });

  it.each([null, new Blob([]), new Blob(['wrong'], { type: 'image/png' })])(
    'rejects invalid JPEG encoding and allows a subsequent render', async (blob) => {
      const harness = captureHarness();
      const image = harness.authority.renderImage({ mime: 'image/jpeg' });
      await drainMicrotasks();
      harness.surface.resolveBlob(blob);
      await expect(image).rejects.toMatchObject({ diagnostic: { code: 'EXTRACTION_READBACK_FAILED' } });
      const retry = harness.authority.renderImage({ mime: 'image/png' });
      await drainMicrotasks();
      harness.surface.resolveBlob(new Blob(['ok'], { type: 'image/png' }));
      await expect(retry).resolves.toMatchObject({ mime: 'image/png' });
      expect(harness.pendingWork).toBe(0);
    },
  );

  it('uses extraction security before publishing an image', async () => {
    const harness = captureHarness();
    harness.extractionSecurity.setAssetReadability('unreadable-source', 'tainted');
    await expect(harness.authority.renderImage({ mime: 'image/png' })).rejects.toMatchObject({
      diagnostic: { code: 'EXTRACTION_TAINTED', category: 'EXTRACTION_FAILURE' },
    });
    expect(harness.publishedFrameCount).toBe(0);
    expect(harness.pendingWork).toBe(0);
  });

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

  it('publishes a deferred mount resize before managed capture frame ownership resumes', async () => {
    const harness = captureHarness();
    const resizeObserver = resizeObserverHarness();
    harness.authority.observeMountSize(resizeObserver.target, 2);

    const capture = harness.authority.captureManagedPng();
    await Promise.resolve();
    expect(harness.publishedFrameCount).toBe(1);

    resizeObserver.setSize(640, 360);
    resizeObserver.notify();
    expect(harness.resizes).toEqual([]);

    harness.surface.resolveNextCapture();
    await expect(capture).resolves.toMatchObject({ mime: 'image/png' });
    expect(harness.resizes).toEqual([[640, 360, 2]]);
    expect(harness.publishedFrameCount).toBe(2);
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
  readonly publishedFrameCount: number;
  readonly resizes: Array<readonly [number, number, number]>;
  readonly surface: DeferredCaptureSurface;
  destroyed: boolean;
  liveSurface: PatchMapEngineSurface | null;
  onResize: (() => void) | null;
  readonly pendingWork: number;
  assetsReady: Promise<void>;
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
  let publishedFrameCount = 0;
  let onResize: (() => void) | null = null;
  let assetsReady = Promise.resolve();
  frameLoop.create({
    activeAnimations: 0,
    frameWorkloadSize: 1,
    frameTimeMs: 0,
    viewportGestureActive: false,
    get destroyed() {
      return destroyed;
    },
    publishFrame: () => {
      publishedFrameCount += 1;
      publication.commitFrame();
    },
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
      image: {
        settleAssets: () => assetsReady,
        publish: () => {
          publishedFrameCount += 1;
          publication.commitFrame();
        },
      },
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
        return true;
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
    get publishedFrameCount() {
      return publishedFrameCount;
    },
    resizes,
    surface,
    get assetsReady() { return assetsReady; },
    set assetsReady(value: Promise<void>) { assetsReady = value; },
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
  public lossDuringBlob = false;
  private contextLost = false;
  public readonly blobRequests: Array<{ mime: string | undefined; quality: number | undefined }> = [];
  private readonly blobCallbacks: BlobCallback[] = [];
  public readonly canvas = {
    toBlob: (callback: BlobCallback, mime?: string, quality?: number): void => {
      if (this.lossDuringBlob) {
        this.contextLost = true;
        throw new Error('native encoder context failure');
      }
      this.blobRequests.push({ mime, quality });
      this.blobCallbacks.push(callback);
    },
  } as HTMLCanvasElement;
  public captureCount = 0;
  public rendererLossProbe() { return { contextLost: this.contextLost, state: this.contextLost ? 'lost' : 'healthy' }; }
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

  public resolveBlob(blob: Blob | null): void {
    const callback = this.blobCallbacks.shift();
    if (callback === undefined) throw new Error('no pending Blob');
    callback(blob);
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

async function drainMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
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
