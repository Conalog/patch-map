import { describe, expect, it } from 'vitest';

import type {
  PatchMapEngineSurface,
  PatchMapSurfaceOptions,
} from '../../src/patch-map/engine/contracts';
import { PatchMapSurfaceLifecycleAuthority } from '../../src/patch-map/engine/surface-lifecycle-authority';

const SURFACE_OPTIONS: PatchMapSurfaceOptions = Object.freeze({
  width: 800,
  height: 600,
  pixelRatio: 1,
  antialias: true,
  background: 0xfafafaff,
  strategy: 'mesh',
  preference: 'webgl',
  backend: 'webgl2',
  powerPreference: 'high-performance',
});

describe('PatchMapSurfaceLifecycleAuthority', () => {
  it('owns allocation, root input bindings, live install, and final release', async () => {
    const fixture = createSurface();
    const authority = new PatchMapSurfaceLifecycleAuthority(
      () => Promise.resolve(fixture.surface),
    );
    const candidate = await authority.allocateCandidate(SURFACE_OPTIONS);

    expect(candidate).toBe(fixture.surface);
    expect(authority.liveSurface).toBeNull();
    expect(authority.canvasCount).toBe(1);

    const installed = authority.installCandidate(candidate, emptyCallbacks());

    expect(installed).toEqual({
      surface: fixture.surface,
      canvas: fixture.canvas,
    });
    expect(authority.isCurrent(fixture.surface)).toBe(true);
    expect(authority.authoritativeCanvas).toBe(fixture.canvas);
    expect(fixture.bindCounts()).toEqual([1, 1, 1]);

    const cleanup = await authority.cleanup(fixture.surface);

    expect(cleanup).toMatchObject({ released: true, error: null });
    expect(fixture.unbindCounts()).toEqual([1, 1, 1]);
    expect(fixture.destroyCalls()).toBe(1);
    expect(authority.liveSurface).toBeNull();
    expect(authority.authoritativeCanvas).toBeNull();
    expect(authority.canvasCount).toBe(0);
  });

  it('reports an input unbind failure while still releasing every renderer resource', async () => {
    const fixture = createSurface({ failingUnbind: 'viewport' });
    const authority = new PatchMapSurfaceLifecycleAuthority(
      () => Promise.resolve(fixture.surface),
    );
    const candidate = await authority.allocateCandidate(SURFACE_OPTIONS);
    authority.installCandidate(candidate, emptyCallbacks());

    const cleanup = await authority.cleanup(fixture.surface);

    expect(cleanup).toMatchObject({
      released: true,
      error: { message: 'PatchMap viewport input cleanup failed' },
    });
    expect(fixture.unbindCounts()).toEqual([1, 1, 1]);
    expect(authority.canvasCount).toBe(0);
  });

  it('retains a late candidate through failed cleanup and releases it on retry', async () => {
    const fixture = createSurface({ destroyFailures: 2 });
    const authority = new PatchMapSurfaceLifecycleAuthority(
      () => Promise.resolve(fixture.surface),
    );
    const candidate = await authority.allocateCandidate(SURFACE_OPTIONS);
    authority.retainCandidateForCleanup(candidate);

    expect(authority.cleanupSurface).toBe(fixture.surface);
    expect(authority.canvasCount).toBe(1);

    const first = await authority.cleanup(fixture.surface);
    expect(first.released).toBe(false);
    expect(first.error).toBeInstanceOf(Error);
    expect(fixture.destroyCalls()).toBe(2);
    expect(authority.cleanupSurface).toBe(fixture.surface);

    const retry = await authority.cleanup(fixture.surface);
    expect(retry).toMatchObject({ released: true, error: null });
    expect(fixture.destroyCalls()).toBe(3);
    expect(authority.cleanupSurface).toBeNull();
    expect(authority.canvasCount).toBe(0);
  });

  it('keeps one initialization promise and the first terminal failure authoritative', () => {
    const fixture = createSurface();
    const authority = new PatchMapSurfaceLifecycleAuthority(
      () => Promise.resolve(fixture.surface),
    );
    const firstInitialization = Promise.resolve('ready');
    const foreignInitialization = Promise.resolve('foreign');
    const firstFailure = new Error('first');

    authority.setInitialization(firstInitialization);
    expect(authority.initialization).toBe(firstInitialization);
    expect(() => authority.setInitialization(foreignInitialization)).toThrow(
      'surface initialization is already owned',
    );
    authority.clearInitialization(foreignInitialization);
    expect(authority.initialization).toBe(firstInitialization);
    authority.clearInitialization(firstInitialization);
    expect(authority.initialization).toBeNull();

    expect(authority.recordTerminalFailure(firstFailure)).toBe(true);
    expect(authority.recordTerminalFailure(new Error('later'))).toBe(false);
    expect(authority.terminalFailure).toBe(firstFailure);
  });

  it('rejects overlapping allocation before invoking a second surface factory', async () => {
    const allocation = deferred<PatchMapEngineSurface>();
    let factoryCalls = 0;
    const authority = new PatchMapSurfaceLifecycleAuthority(() => {
      factoryCalls += 1;
      return allocation.promise;
    });

    const first = authority.allocateCandidate(SURFACE_OPTIONS);
    await expect(authority.allocateCandidate(SURFACE_OPTIONS)).rejects.toThrow(
      'surface candidate is already owned',
    );
    expect(factoryCalls).toBe(1);

    const fixture = createSurface();
    allocation.resolve(fixture.surface);
    await expect(first).resolves.toBe(fixture.surface);
    await authority.cleanup(fixture.surface);
  });

  it('does not bind root inputs when the authoritative canvas lookup fails', async () => {
    const fixture = createSurface({ canvasLookupFailure: true });
    const authority = new PatchMapSurfaceLifecycleAuthority(
      () => Promise.resolve(fixture.surface),
    );
    const candidate = await authority.allocateCandidate(SURFACE_OPTIONS);

    expect(() => authority.installCandidate(candidate, emptyCallbacks())).toThrow(
      'canvas lookup failed',
    );
    expect(fixture.bindCounts()).toEqual([0, 0, 0]);

    await expect(authority.cleanup(candidate)).resolves.toMatchObject({
      released: true,
      error: null,
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function emptyCallbacks() {
  return {
    viewport: () => undefined,
    pointer: () => undefined,
    accessibility: () => undefined,
  };
}

function createSurface(options: Readonly<{
  readonly destroyFailures?: number;
  readonly failingUnbind?: 'viewport' | 'pointer' | 'accessibility';
  readonly canvasLookupFailure?: boolean;
}> = {}) {
  let canvasCount = 1;
  let destroyFailures = options.destroyFailures ?? 0;
  let destroyCalls = 0;
  const bindCounts = [0, 0, 0];
  const unbindCounts = [0, 0, 0];
  const canvas = Object.freeze({}) as HTMLCanvasElement;
  const binding = (index: number, kind: typeof options.failingUnbind) => {
    bindCounts[index] = (bindCounts[index] ?? 0) + 1;
    return () => {
      unbindCounts[index] = (unbindCounts[index] ?? 0) + 1;
      if (options.failingUnbind === kind) throw new Error(`${kind} unbind failed`);
    };
  };
  const surface = {
    get canvasCount() { return canvasCount; },
    get destroyed() { return canvasCount === 0; },
    canvasElement: () => {
      if (options.canvasLookupFailure) throw new Error('canvas lookup failed');
      return canvas;
    },
    bindViewportInput: () => binding(0, 'viewport'),
    bindPointerInput: () => binding(1, 'pointer'),
    bindAccessibilityActivation: () => binding(2, 'accessibility'),
    destroy: () => {
      destroyCalls += 1;
      if (destroyFailures > 0) {
        destroyFailures -= 1;
        return Promise.reject(new Error('surface destroy failed'));
      }
      canvasCount = 0;
      return Promise.resolve(true);
    },
  } as unknown as PatchMapEngineSurface;
  return {
    surface,
    canvas,
    bindCounts: () => [...bindCounts],
    unbindCounts: () => [...unbindCounts],
    destroyCalls: () => destroyCalls,
  };
}
