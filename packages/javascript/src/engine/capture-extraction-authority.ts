import type { PatchMapExtractionSecurityAuthority } from '../operations/extraction-security-authority';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDiagnostic,
  PatchMapPublishedTuple,
} from './contracts/lifecycle';
import type {
  PatchMapEngineCanvasHandle,
  PatchMapEngineExtractionRequest,
  PatchMapEngineExtractionResult,
  PatchMapEngineImageRequest,
  PatchMapEngineImageResult,
} from './contracts/extraction';
import type { PatchMapEngineSurface } from './contracts';
import { validateExtractionRequest } from './input-contracts';
import { PatchMapError } from './operation-outcomes';
import type { PatchMapManagedFrameLoopAuthority } from './managed-frame-loop-authority';
import type { PatchMapPublicationAuthority } from './publication-authority';

export interface PatchMapCaptureExtractionPort {
  readonly image?: Readonly<{
    settleAssets(): Promise<void>;
    publish(): void;
  }>;
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly liveSurface: () => PatchMapEngineSurface | null;
  readonly authoritativeCanvas: () => HTMLCanvasElement | null;
  readonly isDestroyingOrDestroyed: () => boolean;
  readonly resize: (width: number, height: number, pixelRatio: number) => boolean;
  readonly adjustPendingWork: (delta: 1 | -1) => void;
  readonly operationError: (
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ) => PatchMapError;
  readonly operationDiagnostic: (
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ) => PatchMapEngineDiagnostic;
  readonly emitDiagnostic: (diagnostic: PatchMapEngineDiagnostic) => void;
}

/**
 * Owns the serialized managed-capture and exact published-scene extraction
 * lifecycle. Renderer, publication, security, and frame-loop state stay in
 * their canonical authorities; this authority owns their ordering, freshness,
 * pending-work balance, and capture-time mount resize deferral.
 */
export class PatchMapCaptureExtractionAuthority {
  private managedCaptureDepth = 0;
  private managedCaptureSettlement: Promise<void> = Promise.resolve();
  private deferredMountResize: readonly [number, number, number] | null = null;
  private mountResizeCleanup: (() => void) | null = null;
  private imageRendering = false;
  private readonly imageLifetime = new AbortController();

  public constructor(
    private readonly extractionSecurity: PatchMapExtractionSecurityAuthority,
    private readonly managedFrameLoop: PatchMapManagedFrameLoopAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly port: PatchMapCaptureExtractionPort,
  ) {}

  public observeMountSize(
    target: HTMLElement,
    pixelRatio: number | undefined,
  ): void {
    this.mountResizeCleanup?.();
    let disposed = false;
    const resize = (): void => {
      if (disposed || this.port.isDestroyingOrDestroyed()) return;
      const bounds = target.getBoundingClientRect();
      if (!(bounds.width > 0) || !(bounds.height > 0)) return;
      const resolution = pixelRatio ?? globalThis.devicePixelRatio ?? 1;
      if (this.managedCaptureDepth > 0) {
        this.deferredMountResize = Object.freeze([bounds.width, bounds.height, resolution]);
        return;
      }
      this.resizeAndPublishMount(bounds.width, bounds.height, resolution);
    };
    const ownerWindow = target.ownerDocument?.defaultView;
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver ?? globalThis.ResizeObserver;
    const cleanup = ResizeObserverConstructor === undefined
      ? (): void => {
          if (disposed) return;
          disposed = true;
          ownerWindow?.removeEventListener('resize', resize);
        }
      : (() => {
          const observer = new ResizeObserverConstructor(resize);
          observer.observe(target);
          return (): void => {
            if (disposed) return;
            disposed = true;
            observer.disconnect();
          };
        })();
    if (ResizeObserverConstructor === undefined) {
      ownerWindow?.addEventListener('resize', resize);
    }
    this.mountResizeCleanup = (): void => {
      cleanup();
      if (this.mountResizeCleanup !== null) this.mountResizeCleanup = null;
    };
  }

  public publishManagedFrameNow(): void {
    this.port.requireSurface('publishManagedFrameNow');
    if (this.managedFrameLoop.publishNow() === null) {
      throw this.port.operationError(
        'NOT_READY',
        'NOT_READY',
        'publishManagedFrameNow',
        true,
      );
    }
  }

  /** Queue captures so one request cannot resume or supersede another request's frame tuple. */
  public captureManagedPng(): Promise<PatchMapEngineExtractionResult> {
    const capture = this.managedCaptureSettlement.then(() => this.performManagedPngCapture());
    this.managedCaptureSettlement = capture.then(
      () => undefined,
      () => undefined,
    );
    return capture;
  }

  public canvasHandle(): PatchMapEngineCanvasHandle {
    const surface = this.port.requireSurface('canvasHandle');
    return this.canvasHandleForSurface(surface, 'canvasHandle');
  }

  /** Snapshot the published viewport in the same task, before yielding to the encoder. */
  public async renderImage(request: PatchMapEngineImageRequest): Promise<PatchMapEngineImageResult> {
    const operation = 'render';
    const fail = (code: 'DESTROYED' | 'CANCELLED' | 'CONFLICT' | 'SUPERSEDED' | 'RENDERER_LOST'): PatchMapError =>
      this.port.operationError(code, code, operation, code !== 'DESTROYED');
    const surface = this.port.requireSurface(operation);
    const image = this.port.image;
    if (image === undefined) {
      throw this.port.operationError('UNSUPPORTED_RUNTIME', 'UNSUPPORTED_RUNTIME', operation, false);
    }
    if (request.signal?.aborted === true) throw fail('CANCELLED');
    if (this.imageRendering || this.managedCaptureDepth > 0) throw fail('CONFLICT');
    const stamp = this.publication.revisionStamp();
    const assertCurrent = (): void => {
      if (this.port.isDestroyingOrDestroyed() || this.port.liveSurface() !== surface) {
        throw fail('DESTROYED');
      }
      if (request.signal?.aborted === true) throw fail('CANCELLED');
      const loss = surface.rendererLossProbe?.();
      if (loss?.contextLost === true || loss?.state === 'lost') throw fail('RENDERER_LOST');
      const current = this.publication.revisionStamp();
      if (
        current.lifecycleGeneration !== stamp.lifecycleGeneration ||
        current.sceneRevision !== stamp.sceneRevision ||
        current.viewRevision !== stamp.viewRevision ||
        current.interactionRevision !== stamp.interactionRevision
      ) throw fail('SUPERSEDED');
    };
    let rejectInterrupted: (reason: PatchMapError) => void = () => undefined;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
    const cancel = (): void => rejectInterrupted(fail('CANCELLED'));
    const destroy = (): void => rejectInterrupted(fail('DESTROYED'));
    request.signal?.addEventListener('abort', cancel, { once: true });
    this.imageLifetime.signal.addEventListener('abort', destroy, { once: true });
    this.imageRendering = true;
    this.port.adjustPendingWork(1);
    try {
      assertCurrent();
      await Promise.race([image.settleAssets(), interrupted]);
      assertCurrent();
      const preflightFailure = this.extractionSecurityFailure(operation);
      if (preflightFailure !== null) throw preflightFailure;
      image.publish();
      assertCurrent();
      const before = this.canvasHandleForSurface(surface, operation);
      const encoding = new Promise<Blob>((resolve, reject) => {
        before.element.toBlob((blob) => {
          if (blob === null || blob.size === 0 || blob.type !== request.mime) {
            reject(this.port.operationError('EXTRACTION_READBACK_FAILED', 'EXTRACTION_FAILURE', operation, true));
          } else {
            resolve(blob);
          }
        }, request.mime, request.quality);
      });
      const blob = await Promise.race([encoding, interrupted]);
      assertCurrent();
      const after = this.canvasHandleForSurface(surface, operation);
      if (before.element !== after.element) throw fail('RENDERER_LOST');
      if (before.backingSize[0] !== after.backingSize[0] || before.backingSize[1] !== after.backingSize[1]) {
        throw fail('SUPERSEDED');
      }
      return Object.freeze({ blob, mime: request.mime, size: before.backingSize });
    } catch (error) {
      return this.rethrowExtractionFailure(error, surface, operation);
    } finally {
      request.signal?.removeEventListener('abort', cancel);
      this.imageLifetime.signal.removeEventListener('abort', destroy);
      this.imageRendering = false;
      this.port.adjustPendingWork(-1);
    }
  }

  public async extractPublishedScene(
    request: PatchMapEngineExtractionRequest,
  ): Promise<PatchMapEngineExtractionResult> {
    validateExtractionRequest(request);
    const surface = this.port.requireSurface('extractPublishedScene');
    if (surface.captureBase64 === undefined) {
      throw this.port.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'extractPublishedScene',
        false,
      );
    }
    const rendererLoss = surface.rendererLossProbe?.() ?? null;
    if (rendererLoss?.contextLost === true || rendererLoss?.state === 'lost') {
      throw this.port.operationError(
        'RENDERER_LOST',
        'RENDERER_LOST',
        'extractPublishedScene',
        true,
      );
    }
    const preflightFailure = this.extractionSecurityFailure('extractPublishedScene');
    if (preflightFailure !== null) {
      this.port.emitDiagnostic(preflightFailure.diagnostic);
      throw preflightFailure;
    }
    if (!samePublishedTuple(this.publication.publishedTuple, request.targetTuple)) {
      throw this.port.operationError(
        'STALE_TARGET',
        'STALE_TARGET',
        'extractPublishedScene',
        true,
      );
    }
    const before = this.canvasHandleForSurface(surface, 'extractPublishedScene');
    if (
      before.cssSize[0] !== request.cssSize[0] ||
      before.cssSize[1] !== request.cssSize[1]
    ) {
      throw this.port.operationError(
        'INVALID_VALUE',
        'INVALID_INPUT',
        'extractPublishedScene',
        true,
      );
    }

    this.port.adjustPendingWork(1);
    try {
      const dataUrl = await surface.captureBase64();
      if (
        this.port.liveSurface() !== surface ||
        this.port.isDestroyingOrDestroyed()
      ) {
        throw this.port.operationError(
          'DESTROYED',
          'DESTROYED',
          'extractPublishedScene',
          false,
        );
      }
      if (!samePublishedTuple(this.publication.publishedTuple, request.targetTuple)) {
        throw this.port.operationError(
          'SUPERSEDED',
          'SUPERSEDED',
          'extractPublishedScene',
          true,
        );
      }
      const after = this.canvasHandleForSurface(surface, 'extractPublishedScene');
      if (before.element !== after.element) {
        throw this.port.operationError(
          'RENDERER_LOST',
          'RENDERER_LOST',
          'extractPublishedScene',
          true,
        );
      }
      if (!dataUrl.startsWith('data:image/png;base64,')) {
        throw this.port.operationError(
          'EXTRACTION_READBACK_FAILED',
          'EXTRACTION_FAILURE',
          'extractPublishedScene',
          true,
        );
      }
      return Object.freeze({
        capturedTuple: Object.freeze({ ...request.targetTuple }),
        cssSize: after.cssSize,
        backingSize: after.backingSize,
        mime: 'image/png',
        dataUrl,
        canvasIdentity: after.identity,
        authoritativeCanvasRetained: true,
        temporaryImageCount: 0,
        renderTextureCount: 0,
      });
    } catch (error) {
      return this.rethrowExtractionFailure(error, surface, 'extractPublishedScene');
    } finally {
      this.port.adjustPendingWork(-1);
    }
  }

  private extractionSecurityFailure(operation: string): PatchMapError | null {
    const preflight = this.extractionSecurity.preflight();
    if (preflight.code === null) return null;
    return new PatchMapError(Object.freeze({
      ...this.port.operationDiagnostic(preflight.code, 'EXTRACTION_FAILURE', operation, true),
      ...(preflight.sanitizedAssetId === null ? {} : { sanitizedAssetId: preflight.sanitizedAssetId }),
    }));
  }

  private rethrowExtractionFailure(error: unknown, surface: PatchMapEngineSurface, operation: string): never {
    const loss = error instanceof PatchMapError ? null : surface.rendererLossProbe?.() ?? null;
    const failure = error instanceof PatchMapError
      ? error
      : loss?.contextLost === true || loss?.state === 'lost'
        ? this.port.operationError('RENDERER_LOST', 'RENDERER_LOST', operation, true)
        : this.port.operationError(extractionFailureCode(error), 'EXTRACTION_FAILURE', operation, true);
    if (!this.port.isDestroyingOrDestroyed()) this.port.emitDiagnostic(failure.diagnostic);
    throw failure;
  }

  public destroy(): void {
    this.imageLifetime.abort();
    this.mountResizeCleanup?.();
    this.mountResizeCleanup = null;
    this.deferredMountResize = null;
  }

  private async performManagedPngCapture(): Promise<PatchMapEngineExtractionResult> {
    this.publishManagedFrameNow();
    const resume = this.managedFrameLoop.pause();
    this.managedCaptureDepth += 1;
    try {
      const surface = this.port.requireSurface('extractPublishedScene');
      const targetTuple = this.publication.publishedTuple;
      const cssSize = surface.debugSnapshot().cssSize;
      return await this.extractPublishedScene({
        targetTuple,
        cssSize,
        mime: 'image/png',
      });
    } finally {
      this.managedCaptureDepth -= 1;
      let resized = false;
      if (
        this.managedCaptureDepth === 0 &&
        this.deferredMountResize !== null &&
        !this.port.isDestroyingOrDestroyed()
      ) {
        const [width, height, pixelRatio] = this.deferredMountResize;
        this.deferredMountResize = null;
        resized = this.port.resize(width, height, pixelRatio);
      }
      if (resume) this.managedFrameLoop.resume();
      if (resized) this.managedFrameLoop.publishNow();
    }
  }

  private resizeAndPublishMount(width: number, height: number, pixelRatio: number): void {
    if (!this.port.resize(width, height, pixelRatio)) return;
    // ResizeObserver runs before paint, so publish before its callback can expose
    // the renderer-cleared backing store to browser composition.
    this.managedFrameLoop.publishNow();
  }

  private canvasHandleForSurface(
    surface: PatchMapEngineSurface,
    operation: string,
  ): PatchMapEngineCanvasHandle {
    const canvas = surface.canvasElement?.() ?? null;
    if (canvas === null || this.port.authoritativeCanvas() === null) {
      throw this.port.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        false,
      );
    }
    if (canvas !== this.port.authoritativeCanvas()) {
      throw this.port.operationError(
        'RENDERER_LOST',
        'RENDERER_LOST',
        operation,
        true,
      );
    }
    const debug = surface.debugSnapshot();
    return Object.freeze({
      element: canvas,
      identity: 'initial-canvas',
      cssSize: Object.freeze([...debug.cssSize] as [number, number]),
      backingSize: Object.freeze([...debug.backingSize] as [number, number]),
    });
  }
}

function extractionFailureCode(
  error: unknown,
): 'EXTRACTION_TAINTED' | 'EXTRACTION_READBACK_FAILED' {
  if (
    error instanceof DOMException &&
    (error.name === 'SecurityError' || error.name === 'InvalidStateError')
  ) {
    return error.name === 'SecurityError'
      ? 'EXTRACTION_TAINTED'
      : 'EXTRACTION_READBACK_FAILED';
  }
  return 'EXTRACTION_READBACK_FAILED';
}

function samePublishedTuple(
  left: PatchMapPublishedTuple,
  right: PatchMapPublishedTuple,
): boolean {
  return left.scene === right.scene &&
    left.view === right.view &&
    left.interaction === right.interaction;
}
