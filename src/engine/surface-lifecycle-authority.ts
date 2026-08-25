import type { PatchMapAccessibilityActivationInput } from '../accessibility';
import type { PatchMapRendererLossProbe } from '../rendering-port';
import type {
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapSurfaceOptions,
  PatchMapSurfaceContextMenuInput,
  PatchMapSurfacePointerInput,
  PatchMapSurfaceViewportInput,
} from './contracts';

export interface PatchMapSurfaceInputCallbacks {
  readonly viewport: (input: PatchMapSurfaceViewportInput) => void;
  readonly pointer: (input: PatchMapSurfacePointerInput) => void;
  readonly contextMenu?: (input: PatchMapSurfaceContextMenuInput) => boolean;
  readonly accessibility: (
    targetId: string,
    input: PatchMapAccessibilityActivationInput,
  ) => void;
}

export interface PatchMapInstalledSurface {
  readonly surface: PatchMapEngineSurface;
  readonly canvas: HTMLCanvasElement | null;
}

export interface PatchMapSurfaceCleanupResult {
  readonly released: boolean;
  readonly error: Error | null;
  readonly rendererLoss: PatchMapRendererLossProbe | null;
}

interface PatchMapSurfaceInputBindings {
  readonly viewport: (() => void) | null;
  readonly pointer: (() => void) | null;
  readonly contextMenu: (() => void) | null;
  readonly accessibility: (() => void) | null;
}

const EMPTY_BINDINGS: PatchMapSurfaceInputBindings = Object.freeze({
  viewport: null,
  pointer: null,
  contextMenu: null,
  accessibility: null,
});

/**
 * Owns every renderer surface reference from allocation through final release.
 * PatchMap remains the lifecycle coordinator, but it can only install, retain,
 * query, or clean a surface through this explicit transfer boundary.
 */
export class PatchMapSurfaceLifecycleAuthority<TInitialization> {
  private liveSurfaceValue: PatchMapEngineSurface | null = null;
  private candidateSurfaceValue: PatchMapEngineSurface | null = null;
  private cleanupSurfaceValue: PatchMapEngineSurface | null = null;
  private authoritativeCanvasValue: HTMLCanvasElement | null = null;
  private initializationValue: Promise<TInitialization> | null = null;
  private terminalFailureValue: Error | null = null;
  private inputBindings: PatchMapSurfaceInputBindings = EMPTY_BINDINGS;
  private candidateAllocationInProgress = false;

  public constructor(
    private readonly surfaceFactory: PatchMapEngineSurfaceFactory,
  ) {}

  public get liveSurface(): PatchMapEngineSurface | null {
    return this.liveSurfaceValue;
  }

  public get cleanupSurface(): PatchMapEngineSurface | null {
    return this.cleanupSurfaceValue;
  }

  public get authoritativeCanvas(): HTMLCanvasElement | null {
    return this.authoritativeCanvasValue;
  }

  public get initialization(): Promise<TInitialization> | null {
    return this.initializationValue;
  }

  public get terminalFailure(): Error | null {
    return this.terminalFailureValue;
  }

  public get canvasCount(): number {
    const live = this.liveSurfaceValue;
    const candidate = this.candidateSurfaceValue;
    const cleanup = this.cleanupSurfaceValue;
    let count = live?.canvasCount ?? 0;
    if (candidate !== null && candidate !== live) count += candidate.canvasCount;
    if (cleanup !== null && cleanup !== live && cleanup !== candidate) {
      count += cleanup.canvasCount;
    }
    return count;
  }

  public setInitialization(promise: Promise<TInitialization>): void {
    if (this.initializationValue !== null && this.initializationValue !== promise) {
      throw new Error('PatchMap surface initialization is already owned');
    }
    this.initializationValue = promise;
  }

  public clearInitialization(promise?: Promise<TInitialization>): void {
    if (promise === undefined || this.initializationValue === promise) {
      this.initializationValue = null;
    }
  }

  public async allocateCandidate(
    options: PatchMapSurfaceOptions,
  ): Promise<PatchMapEngineSurface> {
    if (
      this.candidateAllocationInProgress ||
      this.candidateSurfaceValue !== null
    ) {
      throw new Error('PatchMap surface candidate is already owned');
    }
    this.candidateAllocationInProgress = true;
    try {
      const surface = await this.surfaceFactory(options);
      this.candidateSurfaceValue = surface;
      return surface;
    } finally {
      this.candidateAllocationInProgress = false;
    }
  }

  public installCandidate(
    surface: PatchMapEngineSurface,
    callbacks: PatchMapSurfaceInputCallbacks,
  ): PatchMapInstalledSurface {
    if (this.candidateSurfaceValue !== surface) {
      throw new Error('PatchMap surface candidate ownership was lost');
    }
    if (this.liveSurfaceValue !== null) {
      throw new Error('PatchMap live surface is already installed');
    }
    // Resolve the canvas before binding root listeners so an injected surface
    // cannot throw between listener allocation and ownership publication.
    const canvas = surface.canvasElement?.() ?? null;
    const bindings = this.bindInputs(surface, callbacks);
    this.liveSurfaceValue = surface;
    this.candidateSurfaceValue = null;
    this.authoritativeCanvasValue = canvas;
    this.inputBindings = bindings;
    return Object.freeze({
      surface,
      canvas: this.authoritativeCanvasValue,
    });
  }

  public retainCandidateForCleanup(surface: PatchMapEngineSurface): void {
    if (this.candidateSurfaceValue !== surface) {
      throw new Error('PatchMap surface candidate ownership was lost');
    }
    if (this.cleanupSurfaceValue !== null && this.cleanupSurfaceValue !== surface) {
      throw new Error('PatchMap cleanup surface is already retained');
    }
    this.candidateSurfaceValue = null;
    this.cleanupSurfaceValue = surface;
  }

  public isCurrent(surface: PatchMapEngineSurface): boolean {
    return this.liveSurfaceValue === surface;
  }

  public recordTerminalFailure(error: Error): boolean {
    if (this.terminalFailureValue !== null) return false;
    this.terminalFailureValue = error;
    return true;
  }

  public async cleanup(
    surface: PatchMapEngineSurface,
  ): Promise<PatchMapSurfaceCleanupResult> {
    const inputCleanupError = this.releaseInputBindings(surface);
    let lastError = inputCleanupError;
    let rendererLoss: PatchMapRendererLossProbe | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let attemptFailed = false;
      try {
        await surface.destroy();
        rendererLoss = surface.rendererLossProbe?.() ?? rendererLoss;
      } catch {
        lastError = new Error('PatchMap surface cleanup failed');
        attemptFailed = true;
      }
      if (surface.canvasCount === 0) {
        this.releaseSurfaceReference(surface);
        return Object.freeze({
          released: true,
          error: attemptFailed || inputCleanupError !== null ? lastError : null,
          rendererLoss,
        });
      }
      if (!attemptFailed) {
        lastError = new Error('PatchMap surface retained a canvas after destroy');
      }
    }

    this.transferToCleanupOnly(surface);
    return Object.freeze({
      released: false,
      error: lastError,
      rendererLoss,
    });
  }

  private bindInputs(
    surface: PatchMapEngineSurface,
    callbacks: PatchMapSurfaceInputCallbacks,
  ): PatchMapSurfaceInputBindings {
    let viewport: (() => void) | null = null;
    let pointer: (() => void) | null = null;
    let contextMenu: (() => void) | null = null;
    let accessibility: (() => void) | null = null;
    try {
      viewport = surface.bindViewportInput?.(callbacks.viewport) ?? null;
      pointer = surface.bindPointerInput?.(callbacks.pointer) ?? null;
      contextMenu = callbacks.contextMenu === undefined
        ? null
        : surface.bindContextMenuInput?.(callbacks.contextMenu) ?? null;
      accessibility = surface.bindAccessibilityActivation?.(
        callbacks.accessibility,
      ) ?? null;
      return Object.freeze({ viewport, pointer, contextMenu, accessibility });
    } catch (error) {
      safelyUnbind(accessibility);
      safelyUnbind(contextMenu);
      safelyUnbind(pointer);
      safelyUnbind(viewport);
      throw error;
    }
  }

  private releaseInputBindings(surface: PatchMapEngineSurface): Error | null {
    if (this.liveSurfaceValue !== surface) return null;
    const bindings = this.inputBindings;
    this.inputBindings = EMPTY_BINDINGS;
    let error: Error | null = null;
    error = unbindWithDiagnostic(
      bindings.viewport,
      'PatchMap viewport input cleanup failed',
      error,
    );
    error = unbindWithDiagnostic(
      bindings.pointer,
      'PatchMap pointer input cleanup failed',
      error,
    );
    error = unbindWithDiagnostic(
      bindings.contextMenu,
      'PatchMap context-menu input cleanup failed',
      error,
    );
    return unbindWithDiagnostic(
      bindings.accessibility,
      'PatchMap accessibility activation cleanup failed',
      error,
    );
  }

  private releaseSurfaceReference(surface: PatchMapEngineSurface): void {
    if (this.liveSurfaceValue === surface) {
      this.liveSurfaceValue = null;
      this.authoritativeCanvasValue = null;
      this.inputBindings = EMPTY_BINDINGS;
    }
    if (this.candidateSurfaceValue === surface) this.candidateSurfaceValue = null;
    if (this.cleanupSurfaceValue === surface) this.cleanupSurfaceValue = null;
  }

  private transferToCleanupOnly(surface: PatchMapEngineSurface): void {
    if (this.liveSurfaceValue === surface) {
      this.liveSurfaceValue = null;
      this.authoritativeCanvasValue = null;
      this.inputBindings = EMPTY_BINDINGS;
    }
    if (this.candidateSurfaceValue === surface) this.candidateSurfaceValue = null;
    this.cleanupSurfaceValue = surface;
  }
}

function safelyUnbind(unbind: (() => void) | null): void {
  try {
    unbind?.();
  } catch {
    // The allocation remains a candidate and its renderer teardown is still
    // owned by the caller's initialization failure path.
  }
}

function unbindWithDiagnostic(
  unbind: (() => void) | null,
  message: string,
  previous: Error | null,
): Error | null {
  if (unbind === null) return previous;
  try {
    unbind();
    return previous;
  } catch {
    return new Error(message);
  }
}
