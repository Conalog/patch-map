import { describe, expect, it } from 'vitest';

import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';

describe('PatchMap executable bridge failure cleanup', () => {
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
      revision: 'core-v2-text-runtime-cleanup/1',
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
