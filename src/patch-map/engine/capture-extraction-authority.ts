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
} from './contracts/extraction';
import type { PatchMapEngineSurface } from './contracts';
import { validateExtractionRequest } from './input-contracts';
import { PatchMapError } from './operation-outcomes';
import type { PatchMapManagedFrameLoopAuthority } from './managed-frame-loop-authority';
import type { PatchMapPublicationAuthority } from './publication-authority';

export interface PatchMapCaptureExtractionPort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly liveSurface: () => PatchMapEngineSurface | null;
  readonly authoritativeCanvas: () => HTMLCanvasElement | null;
  readonly isDestroyingOrDestroyed: () => boolean;
  readonly resize: (width: number, height: number, pixelRatio: number) => void;
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
      this.port.resize(bounds.width, bounds.height, resolution);
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
    const extractionPreflight = this.extractionSecurity.preflight();
    if (extractionPreflight.code !== null) {
      const diagnostic = Object.freeze({
        ...this.port.operationDiagnostic(
          extractionPreflight.code,
          'EXTRACTION_FAILURE',
          'extractPublishedScene',
          true,
        ),
        ...(extractionPreflight.sanitizedAssetId === null
          ? {}
          : { sanitizedAssetId: extractionPreflight.sanitizedAssetId }),
      });
      const failure = new PatchMapError(diagnostic);
      this.port.emitDiagnostic(diagnostic);
      throw failure;
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
      const currentRendererLoss = surface.rendererLossProbe?.() ?? null;
      const failure = error instanceof PatchMapError
        ? error
        : currentRendererLoss?.contextLost === true || currentRendererLoss?.state === 'lost'
          ? this.port.operationError(
              'RENDERER_LOST',
              'RENDERER_LOST',
              'extractPublishedScene',
              true,
            )
          : this.port.operationError(
              extractionFailureCode(error),
              'EXTRACTION_FAILURE',
              'extractPublishedScene',
              true,
            );
      if (!this.port.isDestroyingOrDestroyed()) {
        this.port.emitDiagnostic(failure.diagnostic);
      }
      throw failure;
    } finally {
      this.port.adjustPendingWork(-1);
    }
  }

  public destroy(): void {
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
      if (
        this.managedCaptureDepth === 0 &&
        this.deferredMountResize !== null &&
        !this.port.isDestroyingOrDestroyed()
      ) {
        const [width, height, pixelRatio] = this.deferredMountResize;
        this.deferredMountResize = null;
        this.port.resize(width, height, pixelRatio);
      }
      if (resume) this.managedFrameLoop.resume();
    }
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
