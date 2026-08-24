export const PATCH_MAP_PAGE_LIFECYCLE_REVISION =
  'core-v2-page-lifecycle/1' as const;

export type PatchMapDocumentVisibilityState = 'visible' | 'hidden';
export type PatchMapPageLifecycleWorkKind = 'asset' | 'extraction';

export interface PatchMapPageLifecycleWorkToken {
  readonly schemaRevision: typeof PATCH_MAP_PAGE_LIFECYCLE_REVISION;
  readonly kind: PatchMapPageLifecycleWorkKind;
  readonly requestId: string;
  readonly lifecycleGeneration: number;
}

export interface PatchMapPageLifecycleWorkCompletion {
  readonly status: 'completed' | 'obsolete' | 'rejected';
  readonly applied: boolean;
  readonly kind: PatchMapPageLifecycleWorkKind;
  readonly requestId: string;
  readonly lifecycleGeneration: number;
}

export interface PatchMapPageLifecycleProbe {
  readonly schemaRevision: typeof PATCH_MAP_PAGE_LIFECYCLE_REVISION;
  readonly state: PatchMapDocumentVisibilityState;
  readonly lifecycleGeneration: number;
  readonly clockMs: number;
  readonly hiddenAtMs: number | null;
  readonly resumedAtMs: number | null;
  readonly pendingAssetCount: number;
  readonly pendingExtractionCount: number;
  readonly pendingWorkCount: number;
  readonly cancelledAssetCount: number;
  readonly cancelledExtractionCount: number;
  readonly obsoleteCompletionCount: number;
  readonly resumeFramePending: boolean;
  readonly resumePublishedFrameCount: number;
  readonly transitionCount: number;
  readonly destroyed: boolean;
}

export interface PatchMapPageLifecycleTransition {
  readonly changed: boolean;
  readonly previousState: PatchMapDocumentVisibilityState;
  readonly state: PatchMapDocumentVisibilityState;
  readonly cancelledAssetCount: number;
  readonly cancelledExtractionCount: number;
  readonly probe: PatchMapPageLifecycleProbe;
}

interface PendingWork {
  readonly kind: PatchMapPageLifecycleWorkKind;
  readonly requestId: string;
  readonly lifecycleGeneration: number;
}

/**
 * Engine-local page lifecycle and cancellable-work ledger.
 *
 * The authority owns only fixed-size request metadata. It never owns a
 * Promise, asset, renderer object, listener, ticker, or per-entity callback.
 * Hosts keep the real asynchronous operation and must present this authority's
 * token before a completion can publish.
 */
export class PatchMapPageLifecycleAuthority {
  private readonly pending = new Map<string, PendingWork>();
  private readonly tokens = new WeakMap<PatchMapPageLifecycleWorkToken, PendingWork>();
  private state: PatchMapDocumentVisibilityState = 'visible';
  private lifecycleGeneration = 1;
  private clockMs = 0;
  private hiddenAtMs: number | null = null;
  private resumedAtMs: number | null = null;
  private cancelledAssetCount = 0;
  private cancelledExtractionCount = 0;
  private obsoleteCompletionCount = 0;
  private resumeFramePending = false;
  private resumePublishedFrameCount = 0;
  private transitionCount = 0;
  private destroyed = false;

  public register(
    kindValue: PatchMapPageLifecycleWorkKind,
    requestIdValue: string,
  ): PatchMapPageLifecycleWorkToken {
    this.assertAlive();
    if (this.state !== 'visible') {
      throw new Error('page lifecycle work requires a visible document');
    }
    const kind = workKind(kindValue);
    const requestId = nonEmptyString(requestIdValue, 'requestId');
    const key = workKey(kind, requestId);
    if (this.pending.has(key)) {
      throw new Error(`page lifecycle work already registered: ${key}`);
    }
    const work = Object.freeze({
      kind,
      requestId,
      lifecycleGeneration: this.lifecycleGeneration,
    } satisfies PendingWork);
    const token = Object.freeze({
      schemaRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
      ...work,
    } satisfies PatchMapPageLifecycleWorkToken);
    this.pending.set(key, work);
    this.tokens.set(token, work);
    return token;
  }

  public complete(
    tokenValue: PatchMapPageLifecycleWorkToken,
  ): PatchMapPageLifecycleWorkCompletion {
    const token = tokenValue;
    const authority = token !== null && typeof token === 'object'
      ? this.tokens.get(token)
      : undefined;
    const kind = authority?.kind ?? safeWorkKind(token?.kind);
    const requestId = authority?.requestId ?? safeRequestId(token?.requestId);
    if (authority === undefined || this.destroyed) {
      return Object.freeze({
        status: 'rejected',
        applied: false,
        kind,
        requestId,
        lifecycleGeneration: this.lifecycleGeneration,
      });
    }
    const key = workKey(authority.kind, authority.requestId);
    const current = this.pending.get(key);
    if (
      current !== authority ||
      authority.lifecycleGeneration !== this.lifecycleGeneration ||
      this.state !== 'visible'
    ) {
      this.obsoleteCompletionCount += 1;
      return Object.freeze({
        status: 'obsolete',
        applied: false,
        kind: authority.kind,
        requestId: authority.requestId,
        lifecycleGeneration: this.lifecycleGeneration,
      });
    }
    this.pending.delete(key);
    return Object.freeze({
      status: 'completed',
      applied: true,
      kind: authority.kind,
      requestId: authority.requestId,
      lifecycleGeneration: this.lifecycleGeneration,
    });
  }

  public transition(
    stateValue: PatchMapDocumentVisibilityState,
    timeMsValue: number,
  ): PatchMapPageLifecycleTransition {
    this.assertAlive();
    const state = visibilityState(stateValue);
    const timeMs = monotonicTime(timeMsValue, this.clockMs);
    const previousState = this.state;
    this.clockMs = timeMs;
    if (state === previousState) {
      return Object.freeze({
        changed: false,
        previousState,
        state,
        cancelledAssetCount: 0,
        cancelledExtractionCount: 0,
        probe: this.probe(),
      });
    }

    let cancelledAssetCount = 0;
    let cancelledExtractionCount = 0;
    if (state === 'hidden') {
      for (const work of this.pending.values()) {
        if (work.kind === 'asset') cancelledAssetCount += 1;
        else cancelledExtractionCount += 1;
      }
      this.pending.clear();
      this.cancelledAssetCount += cancelledAssetCount;
      this.cancelledExtractionCount += cancelledExtractionCount;
      this.hiddenAtMs = timeMs;
      this.resumeFramePending = false;
    } else {
      this.resumedAtMs = timeMs;
      this.resumeFramePending = true;
    }
    this.state = state;
    this.lifecycleGeneration = nextGeneration(this.lifecycleGeneration);
    this.transitionCount += 1;
    return Object.freeze({
      changed: true,
      previousState,
      state,
      cancelledAssetCount,
      cancelledExtractionCount,
      probe: this.probe(),
    });
  }

  public publishedFrame(): boolean {
    if (
      this.destroyed ||
      this.state !== 'visible' ||
      !this.resumeFramePending
    ) {
      return false;
    }
    this.resumeFramePending = false;
    this.resumePublishedFrameCount += 1;
    return true;
  }

  public probe(): PatchMapPageLifecycleProbe {
    let pendingAssetCount = 0;
    let pendingExtractionCount = 0;
    for (const work of this.pending.values()) {
      if (work.kind === 'asset') pendingAssetCount += 1;
      else pendingExtractionCount += 1;
    }
    return Object.freeze({
      schemaRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
      state: this.state,
      lifecycleGeneration: this.lifecycleGeneration,
      clockMs: this.clockMs,
      hiddenAtMs: this.hiddenAtMs,
      resumedAtMs: this.resumedAtMs,
      pendingAssetCount,
      pendingExtractionCount,
      pendingWorkCount: pendingAssetCount + pendingExtractionCount,
      cancelledAssetCount: this.cancelledAssetCount,
      cancelledExtractionCount: this.cancelledExtractionCount,
      obsoleteCompletionCount: this.obsoleteCompletionCount,
      resumeFramePending: this.resumeFramePending,
      resumePublishedFrameCount: this.resumePublishedFrameCount,
      transitionCount: this.transitionCount,
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.pending.clear();
    this.resumeFramePending = false;
    this.destroyed = true;
    return true;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('page lifecycle authority is destroyed');
  }
}

function workKey(kind: PatchMapPageLifecycleWorkKind, requestId: string): string {
  return `${kind.length}:${kind}:${requestId}`;
}

function workKind(value: unknown): PatchMapPageLifecycleWorkKind {
  if (value !== 'asset' && value !== 'extraction') {
    throw new TypeError('page lifecycle work kind must be asset or extraction');
  }
  return value;
}

function safeWorkKind(value: unknown): PatchMapPageLifecycleWorkKind {
  return value === 'extraction' ? 'extraction' : 'asset';
}

function visibilityState(value: unknown): PatchMapDocumentVisibilityState {
  if (value !== 'visible' && value !== 'hidden') {
    throw new TypeError('document visibility state must be visible or hidden');
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function safeRequestId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'invalid';
}

function monotonicTime(value: unknown, previous: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < previous) {
    throw new RangeError('page lifecycle time must be finite and monotonic');
  }
  return value;
}

function nextGeneration(value: number): number {
  return ((value + 1) >>> 0) || 1;
}
