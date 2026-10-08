import { describe, expect, it } from 'vitest';

import {
  type PatchMapOperationalDispatchResult,
  PatchMapExtractionSecurityAuthority,
  PatchMapOperationsAuthority,
  redactPatchMapOperationalDiagnostic,
} from '../../src/operations';

const REVISIONS = Object.freeze({
  lifecycleGeneration: 1,
  sceneRevision: 2,
  viewRevision: 3,
  interactionRevision: 4,
});

describe('PatchMap production operations authority', () => {
  it('redacts one sensitive failure identically across every public channel', () => {
    const marker = 'fixture-sensitive-value';
    const logs: unknown[] = [];
    const observers: unknown[] = [];
    const telemetry: unknown[] = [];
    const operations = new PatchMapOperationsAuthority({
      collectionEnabled: true,
      telemetryEnabled: true,
      instanceId: 'redaction-a',
      logger: (diagnostic) => logs.push(diagnostic),
    });
    operations.subscribeDiagnostics('observer', (diagnostic) => observers.push(diagnostic));
    operations.subscribeTelemetry('telemetry', (event) => telemetry.push(event));

    const returned = operations.reportDiagnostic({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'loadDataset',
      revisionStamp: REVISIONS,
      logicalId: 'rect-b',
      recoverable: true,
      details: {
        text: marker,
        dataUri: `data:text/plain,${marker}`,
        token: `Bearer ${marker}`,
        queryString: `https://customer.invalid/map?token=${marker}`,
        attrs: { metadata: { secret: marker } },
      },
    });
    const runtime = operations.captureRuntimeDiagnostics(runtimeState('redaction-a'));
    const evidence = operations.exportEvidence();
    const channels = { returned, logs, observers, telemetry, runtime, evidence };
    const serialized = JSON.stringify(channels);

    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain('data:text/plain');
    expect(serialized).not.toContain('customer.invalid');
    expect(serialized).not.toContain('Bearer');
    expect(returned).toMatchObject({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'loadDataset',
      logicalId: 'rect-b',
      revisionStamp: REVISIONS,
    });
    expect(returned.sanitizedHash).toMatch(/^fnv1a32:[a-f0-9]{8}$/u);
    expect(logs).toEqual([returned]);
    expect(observers).toEqual([returned]);
    expect(evidence.diagnostics).toEqual([returned]);
  });

  it('keeps runtime snapshots bounded, immutable, instance-local, and cheap when disabled', () => {
    const disabled = new PatchMapOperationsAuthority();
    expect(disabled.captureRuntimeDiagnostics(runtimeState('disabled'))).toEqual({
      revision: 'patch-map-runtime-diagnostics/1',
      enabled: false,
      capacity: 0,
      records: [],
      current: null,
    });

    const first = new PatchMapOperationsAuthority({
      collectionEnabled: true,
      capacity: 2,
      instanceId: 'A',
    });
    const second = new PatchMapOperationsAuthority({
      collectionEnabled: true,
      capacity: 2,
      instanceId: 'B',
    });
    first.noteAction('initialize');
    first.captureRuntimeDiagnostics(runtimeState('A'));
    first.noteAction('load');
    first.captureRuntimeDiagnostics(runtimeState('A'));
    const firstSnapshot = first.captureRuntimeDiagnostics(runtimeState('A'));
    const secondSnapshot = second.captureRuntimeDiagnostics(runtimeState('B'));

    expect(firstSnapshot.records).toHaveLength(2);
    expect(firstSnapshot.records.every(({ instanceId }) => instanceId === 'A')).toBe(true);
    expect(secondSnapshot.records).toHaveLength(1);
    expect(secondSnapshot.records[0]?.instanceId).toBe('B');
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.records)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.current?.resources)).toBe(true);
    expect(first.probe().recordCount).toBe(2);
    expect(second.probe().recordCount).toBe(1);
  });

  it('preflights instance identity without mutating an unbound authority', () => {
    const operations = new PatchMapOperationsAuthority();

    expect(operations.isInstanceCompatible('A')).toBe(true);
    expect(operations.isInstanceCompatible('B')).toBe(true);
    operations.configureInstance('A');
    expect(operations.isInstanceCompatible('A')).toBe(true);
    expect(operations.isInstanceCompatible('B')).toBe(false);
    expect(() => operations.configureInstance('B')).toThrow(
      /instance identity cannot change/u,
    );
  });

  it('isolates callback failure and drains reentrant actions after registration order', () => {
    const operations = new PatchMapOperationsAuthority({ telemetryEnabled: true });
    const delivery: string[] = [];
    let semanticRevision = 2;
    const a = operations.subscribeTelemetry('A', (_event, control) => {
      delivery.push('A');
      control.enqueue('queued-action', () => {
        semanticRevision += 1;
        delivery.push('queued-action');
      });
    });
    const b = operations.subscribeTelemetry('B', () => {
      delivery.push('B');
      throw new Error('fixture-sensitive-value');
    });
    const c = operations.subscribeTelemetry('C', () => delivery.push('C'));

    const dispatched = operations.emitTelemetry({
      type: 'update',
      operation: 'transact',
      revisionStamp: REVISIONS,
      details: { customerText: 'fixture-sensitive-value' },
    });

    expect(delivery).toEqual(['A', 'B', 'C', 'queued-action']);
    expect(semanticRevision).toBe(3);
    expect(dispatched).toEqual({
      deliveredCount: 3,
      callbackFailureCount: 1,
      queuedActionCount: 1,
      queuedActionFailureCount: 0,
    });
    expect(operations.probe().lastCallbackFailure).toMatchObject({
      code: 'HOST_CALLBACK_FAILURE',
      category: 'HOST_CALLBACK_FAILURE',
      logicalId: 'B',
    });
    expect(JSON.stringify(operations.probe())).not.toContain('fixture-sensitive-value');

    expect(a.dispose()).toBe(true);
    expect(a.dispose()).toBe(false);
    expect(b.dispose()).toBe(true);
    expect(c.dispose()).toBe(true);
    expect(operations.emitTelemetry({
      type: 'post-dispose',
      operation: 'probe',
      revisionStamp: REVISIONS,
    }).deliveredCount).toBe(0);
    expect(operations.probe().callbackRegistrations).toBe(0);
  });

  it('keeps nested dispatch queue counts nonnegative when disposal clears the outer queue', () => {
    const operations = new PatchMapOperationsAuthority({ telemetryEnabled: true });
    const delivery: string[] = [];
    let nestedDispatch: PatchMapOperationalDispatchResult | null = null;
    operations.subscribeTelemetry('observer', (event, control) => {
      delivery.push(event.type);
      if (event.type === 'outer') {
        control.enqueue('cleared-action', () => delivery.push('queued-action'));
        nestedDispatch = operations.emitTelemetry({
          type: 'nested',
          operation: 'nested-dispose',
          revisionStamp: REVISIONS,
        });
        return;
      }
      operations.disposeCallbacks();
    });

    const outerDispatch = operations.emitTelemetry({
      type: 'outer',
      operation: 'outer-dispatch',
      revisionStamp: REVISIONS,
    });

    expect(delivery).toEqual(['outer', 'nested']);
    expect(nestedDispatch).toEqual({
      deliveredCount: 1,
      callbackFailureCount: 0,
      queuedActionCount: 0,
      queuedActionFailureCount: 0,
    });
    expect(outerDispatch).toEqual({
      deliveredCount: 1,
      callbackFailureCount: 0,
      queuedActionCount: 0,
      queuedActionFailureCount: 0,
    });
    expect(operations.probe()).toMatchObject({
      callbackRegistrations: 0,
      queuedActionCount: 0,
      disposed: true,
    });
  });

  it('records a failed queued action without recursively redispatching telemetry', () => {
    const operations = new PatchMapOperationsAuthority({ telemetryEnabled: true });
    const deliveries: string[] = [];
    const diagnostics: unknown[] = [];
    operations.subscribeDiagnostics('diagnostic', (value) => diagnostics.push(value));
    operations.subscribeTelemetry('A', (_event, control) => {
      deliveries.push('A');
      control.enqueue('failing-action', () => {
        throw new Error('fixture-sensitive-value');
      });
    });

    const dispatched = operations.emitTelemetry({
      type: 'update',
      operation: 'transact',
      revisionStamp: REVISIONS,
    });

    expect(deliveries).toEqual(['A']);
    expect(dispatched).toMatchObject({
      deliveredCount: 1,
      queuedActionCount: 1,
      queuedActionFailureCount: 1,
    });
    expect(diagnostics).toHaveLength(1);
    expect(operations.probe().queuedActionCount).toBe(0);
    expect(operations.probe().lastCallbackFailure).toMatchObject({
      code: 'HOST_CALLBACK_FAILURE',
      operation: 'queued:failing-action',
    });
    expect(JSON.stringify({ diagnostics, probe: operations.probe() }))
      .not.toContain('fixture-sensitive-value');
  });

  it('classifies extraction readability without retaining source material', () => {
    const security = new PatchMapExtractionSecurityAuthority();
    security.setAssetReadability('safe-icon', 'readable');
    security.setAssetReadability('private-image', 'tainted');
    const tainted = security.preflight();

    expect(tainted).toMatchObject({
      trackedAssetCount: 2,
      unreadableAssetCount: 1,
      code: 'EXTRACTION_TAINTED',
    });
    expect(tainted.sanitizedAssetId).toMatch(/^asset:fnv1a32:/u);
    expect(JSON.stringify(tainted)).not.toContain('private-image');

    security.setAssetReadability('private-image', 'readable');
    security.setAssetReadability('failed-image', 'readback-failed');
    expect(security.preflight().code).toBe('EXTRACTION_READBACK_FAILED');
    security.clear();
    expect(security.preflight()).toMatchObject({
      trackedAssetCount: 0,
      unreadableAssetCount: 0,
      code: null,
    });
  });

  it('bounds hashing work for cyclic and hostile inputs', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    cyclic.secret = 'fixture-sensitive-value';
    const diagnostic = redactPatchMapOperationalDiagnostic({
      code: 'INTERNAL_FAILURE',
      category: 'INTERNAL_FAILURE',
      operation: 'cycle',
      details: cyclic,
    });
    expect(diagnostic.sanitizedHash).toMatch(/^fnv1a32:/u);
    expect(JSON.stringify(diagnostic)).not.toContain('fixture-sensitive-value');
  });
});

function runtimeState(instanceId: string) {
  return {
    instanceId,
    lifecycle: 'scene-ready',
    backend: { kind: 'webgl', lossState: 'healthy' },
    revisions: REVISIONS,
    counts: {
      roots: 3,
      elements: 4,
      components: 4,
      materialized: 8,
      text: 2,
      relations: 1,
    },
    activeWork: {
      gestures: 0,
      animations: 0,
      pendingAssets: 0,
      pendingWork: 0,
    },
    resources: {
      canvases: 1,
      listeners: 1,
      observers: 2,
      tickers: 0,
      textureLeases: 0,
      callbackRegistrations: 2,
    },
    cleanup: { destroyed: false, released: false },
  } as const;
}
