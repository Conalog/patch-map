import { describe, expect, it, vi } from 'vitest';

import { createPatchMapExecutableLabBridge } from '../../lab/contract/executable-bridge';
import { TargetedWebGLPatchMapEngine } from '../../lab/contract/targeted-webgl-engine';
import type { PatchMapSurfaceOptions } from '../../src/patch-map/engine';
import { FakeSurface } from '../support/contract-lab-harness';

describe('PatchMap executable bridge failure cleanup', () => {
  it('rejects a repeat as soon as bridge destruction begins', async () => {
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'LIF-001',
      rootTestId: 'scenario-lif-001',
      size: '100',
      seed: 319,
      surfaceHost: trackedSurfaceHost(() => null),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    const destruction = bridge.destroyCase();
    expect(() => bridge.repeatCase()).toThrow('LIF-001 bridge is destroyed');
    await expect(destruction).resolves.toMatchObject({
      status: 'not-run',
      runCount: 0,
    });
  });

  it('retains late initialization cleanup ownership until destroy can release it', async () => {
    let surface: RetryableDestroySurface | null = null;
    const surfaceHost = trackedSurfaceHost(() => surface);
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'VIE-001',
      rootTestId: 'scenario-vie-001',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: (options) => {
        surface = new RetryableDestroySurface(options, 4, true);
        return Promise.resolve(surface);
      },
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.armGesture(0)).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'PatchMap VIE-001 live gesture initialization cleanup failed',
    });

    const allocatedSurface = requireRetryableSurface(surface);
    expect(allocatedSurface.destroyAttempts).toBe(4);
    expect(allocatedSurface.canvasCount).toBe(1);
    expect(surfaceHost.dataset.patchMapRootInputProbe).toBeUndefined();
    expect(bridge.state()).toMatchObject({
      status: 'armed',
      actionIndex: -1,
      publishedTuple: { scene: 0, view: 0, interaction: 0 },
    });
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'not-run',
      runCount: 0,
      completedRunCount: 0,
      releasedEngineCount: 0,
      retainedCanvasCount: null,
      retainedSubscriptionCount: null,
      retainedPendingWork: null,
    });
    expect(allocatedSurface.destroyAttempts).toBe(5);
    expect(allocatedSurface.canvasCount).toBe(0);
  });

  it('retries only unfinished live-gesture release steps', async () => {
    let surface: RetryableDestroySurface | null = null;
    const surfaceHost = trackedSurfaceHost(() => surface);
    const unbind = vi.fn();
    const subscription = vi
      .spyOn(TargetedWebGLPatchMapEngine.prototype, 'on')
      .mockReturnValue(unbind);
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'VIE-001',
      rootTestId: 'scenario-vie-001',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: (options) => {
        surface = new RetryableDestroySurface(options, 2);
        return Promise.resolve(surface);
      },
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    try {
      await expect(bridge.armGesture(0)).resolves.toMatchObject({
        driverId: 'trusted-pointer-wheel',
      });
      const allocatedSurface = requireRetryableSurface(surface);
      await expect(bridge.awaitMilestone(0, 'released')).rejects.toMatchObject({
        name: 'AggregateError',
        message: 'PatchMap VIE-001 live gesture cleanup failed',
      });
      expect(unbind).toHaveBeenCalledTimes(1);
      expect(allocatedSurface.destroyAttempts).toBe(2);
      expect(allocatedSurface.canvasCount).toBe(1);
      expect(surfaceHost.dataset.patchMapRootInputProbe).toBeUndefined();

      await expect(bridge.awaitMilestone(0, 'released')).resolves.toBeUndefined();
      expect(unbind).toHaveBeenCalledTimes(1);
      expect(allocatedSurface.destroyAttempts).toBe(3);
      expect(allocatedSurface.canvasCount).toBe(0);
      await expect(bridge.destroyCase()).resolves.toMatchObject({ status: 'not-run' });
      expect(allocatedSurface.destroyAttempts).toBe(3);
    } finally {
      subscription.mockRestore();
    }
  });

  it('allows destroy cleanup to retry while keeping execution permanently closed', async () => {
    let surface: RetryableDestroySurface | null = null;
    const surfaceHost = trackedSurfaceHost(() => surface);
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'VIE-001',
      rootTestId: 'scenario-vie-001',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: (options) => {
        surface = new RetryableDestroySurface(options, 2);
        return Promise.resolve(surface);
      },
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.armGesture(0)).resolves.toMatchObject({
      driverId: 'trusted-pointer-wheel',
    });
    const allocatedSurface = requireRetryableSurface(surface);
    await expect(bridge.destroyCase()).rejects.toMatchObject({
      name: 'AggregateError',
    });
    expect(allocatedSurface.canvasCount).toBe(1);
    expect(() => bridge.repeatCase()).toThrow('VIE-001 bridge is destroyed');

    await expect(bridge.destroyCase()).resolves.toMatchObject({ status: 'not-run' });
    expect(allocatedSurface.canvasCount).toBe(0);
    expect(() => bridge.runCase()).toThrow('VIE-001 bridge is destroyed');
  });

  it('releases and publishes text product resources without masking the execution failure', async () => {
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'REN-006',
      rootTestId: 'scenario-ren-006',
      size: '100',
      seed: 319,
      surfaceHost: {
        querySelector(): null {
          return null;
        },
      } as unknown as HTMLElement,
      surfaceFactory: () => Promise.reject(new Error('synthetic text WebGL failure')),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.runCase()).rejects.toThrow(/INTERNAL_FAILURE.*initialize/u);

    const execution = requireRecord(bridge.execution(), 'failed execution');
    const cleanup = requireRecord(execution.cleanup, 'failed execution cleanup');
    const productResources = requireRecord(cleanup.productResources, 'text product cleanup');
    expect(execution.status).toBe('failed');
    expect(cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(productResources).toMatchObject({
      revision: 'patch-map-text-runtime-cleanup/1',
      caseId: 'REN-006',
      runtimeCounts: {
        activeSessionCount: 0,
        fontFaceCount: 0,
        atlasLeaseCount: 0,
        assetLeaseCount: 0,
        pendingLoadCount: 0,
        pendingWorkCount: 0,
      },
      transport: {
        networkRequestCount: 0,
        externalFontRequestCount: 0,
      },
    });
    expect(journalEvents(productResources)).toEqual(['text-runtime-released']);
    expect(
      requireRecord(bridge.cleanup(), 'bridge cleanup').productResources,
    ).toBe(productResources);

    const actual = await bridge.actualObservation();
    expect(actual).toMatchObject({
      outcome: {
        status: 'failed',
      },
    });
    const outcome = requireRecord(actual.outcome, 'failed outcome');
    const executionError = requireRecord(outcome.error, 'failed outcome error');
    expect(executionError.message).toMatch(/INTERNAL_FAILURE.*initialize/u);
    expect(journalEvents(productResources)).toEqual(['text-runtime-released']);
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'completed',
      runCount: 1,
      completedRunCount: 0,
      retainedCanvasCount: 0,
      retainedSubscriptionCount: 0,
      retainedPendingWork: 0,
    });
  });
});

function journalEvents(value: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(value.journal)) throw new Error('Missing cleanup journal');
  return value.journal.map((entry) => {
    const record = requireRecord(entry, 'cleanup journal entry');
    if (typeof record.event !== 'string') throw new Error('Missing cleanup journal event');
    return record.event;
  });
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${label}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

class RetryableDestroySurface extends FakeSurface {
  public destroyAttempts = 0;

  public constructor(
    options: PatchMapSurfaceOptions,
    private readonly failedDestroyCount: number,
    private readonly failCanvasLookup = false,
  ) {
    super(options);
  }

  public override canvasElement(): HTMLCanvasElement {
    if (this.failCanvasLookup) throw new Error('synthetic late initialization failure');
    return super.canvasElement();
  }

  public override destroy(): Promise<boolean> {
    this.destroyAttempts += 1;
    if (this.destroyAttempts <= this.failedDestroyCount) {
      return Promise.reject(new Error('synthetic retryable teardown failure'));
    }
    return super.destroy();
  }
}

function trackedSurfaceHost(
  surface: () => RetryableDestroySurface | null,
): HTMLElement {
  return {
    dataset: {},
    querySelector(): HTMLCanvasElement | null {
      return (surface()?.canvasCount ?? 0) > 0 ? {} as HTMLCanvasElement : null;
    },
  } as unknown as HTMLElement;
}

function requireRetryableSurface(
  surface: RetryableDestroySurface | null,
): RetryableDestroySurface {
  if (surface === null) throw new Error('Missing retryable surface');
  return surface;
}
