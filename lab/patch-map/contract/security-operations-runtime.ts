import packageConsumerResultJson from '../../../performance/patch-map/results/package-consumer.json';
import { retainedPatchMapPackageEvidence } from './package-evidence';
import {
  PatchMapOperationsAuthority,
  type PatchMap,
  type PatchMapOperationalSubscription,
} from '../../../src/patch-map';

export const PATCH_MAP_SECURITY_OPERATIONS_RUNTIME_REVISION =
  'core-v2-security-operations-runtime/1' as const;
export const PATCH_MAP_SECURITY_OPERATIONS_CLEANUP_REVISION =
  'core-v2-security-operations-cleanup/1' as const;

export const PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS = Object.freeze([
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'OPS-001',
  'OPS-002',
] as const);

export type PatchMapSecurityOperationsCaseId =
  (typeof PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS)[number];

export interface PatchMapSecurityOperationsProductAdapter {
  observeEngine(engine: PatchMap): Readonly<Record<string, unknown>>;
  injectSensitiveFailure(input: Readonly<{
    readonly marker: string;
    readonly fields: readonly string[];
  }>): Readonly<Record<string, unknown>>;
  captureSensitiveChannels(
    channels: readonly string[],
  ): Readonly<Record<string, unknown>>;
  readPackageSupplyChainEvidence(): Readonly<Record<string, unknown>>;
}

export interface PatchMapSecurityOperationsRuntime {
  readonly product: PatchMapSecurityOperationsProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only browser transport for the shared security/operations substrate.
 * Approved expected observations and comparators are deliberately absent.
 */
export function createPatchMapSecurityOperationsRuntime(
  caseId: PatchMapSecurityOperationsCaseId,
): PatchMapSecurityOperationsRuntime {
  requireCaseId(caseId);
  const logs: unknown[] = [];
  const observers: unknown[] = [];
  const telemetry: unknown[] = [];
  const redactionOperations = new PatchMapOperationsAuthority({
    collectionEnabled: true,
    telemetryEnabled: true,
    capacity: 100,
    instanceId: `contract-${caseId.toLowerCase()}`,
    logger: (diagnostic) => logs.push(cloneValue(diagnostic)),
  });
  const subscriptions: PatchMapOperationalSubscription[] = [
    redactionOperations.subscribeDiagnostics(
      'contract-observer',
      (diagnostic) => observers.push(cloneValue(diagnostic)),
    ),
    redactionOperations.subscribeTelemetry(
      'contract-telemetry',
      (event) => telemetry.push(cloneValue(event)),
    ),
  ];
  let returnedDiagnostic: unknown = null;
  let released = false;

  const product: PatchMapSecurityOperationsProductAdapter = Object.freeze({
    observeEngine(engine: PatchMap): Readonly<Record<string, unknown>> {
      assertActive(released, 'observeEngine');
      return deepFreeze({
        runtimeRevision: PATCH_MAP_SECURITY_OPERATIONS_RUNTIME_REVISION,
        snapshot: structuredClone(engine.snapshot()),
        semantic: structuredClone(engine.semanticProbe()),
        operations: structuredClone(engine.operationsProbe()),
        extractionSecurity: structuredClone(engine.extractionSecurityProbe()),
      });
    },

    injectSensitiveFailure(input: Readonly<{
      readonly marker: string;
      readonly fields: readonly string[];
    }>): Readonly<Record<string, unknown>> {
      assertActive(released, 'injectSensitiveFailure');
      const fields = [...input.fields];
      const details: Record<string, unknown> = {};
      for (const field of fields) {
        details[field] = sensitiveValue(field, input.marker);
      }
      returnedDiagnostic = cloneValue(redactionOperations.reportDiagnostic({
        code: 'INVALID_VALUE',
        category: 'INVALID_INPUT',
        operation: 'contractSensitiveFailure',
        revisionStamp: {
          lifecycleGeneration: 1,
          sceneRevision: 1,
          viewRevision: 0,
          interactionRevision: 0,
        },
        logicalId: 'rect-b',
        recoverable: true,
        retryable: false,
        details,
      }));
      redactionOperations.captureRuntimeDiagnostics({
        instanceId: `contract-${caseId.toLowerCase()}`,
        lifecycle: 'scene-ready',
        backend: { kind: 'webgl', lossState: 'healthy' },
        revisions: {
          lifecycleGeneration: 1,
          sceneRevision: 1,
          viewRevision: 0,
          interactionRevision: 0,
        },
        counts: {
          roots: 4,
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
          callbackRegistrations: redactionOperations.probe().callbackRegistrations,
        },
        cleanup: { destroyed: false, released: false },
      });
      return deepFreeze({
        fields,
        diagnostic: cloneValue(returnedDiagnostic),
      });
    },

    captureSensitiveChannels(
      channels: readonly string[],
    ): Readonly<Record<string, unknown>> {
      assertActive(released, 'captureSensitiveChannels');
      invariant(returnedDiagnostic !== null, 'sensitive diagnostic was not injected');
      const evidence = redactionOperations.exportEvidence();
      const available: Readonly<Record<string, unknown>> = {
        return: returnedDiagnostic,
        observer: observers,
        telemetry,
        log: logs,
        lab: {
          failureDetail: returnedDiagnostic,
        },
        'evidence-artifact': evidence,
      };
      const selected: Record<string, unknown> = {};
      for (const channel of channels) {
        invariant(Object.hasOwn(available, channel), `unsupported sensitive channel ${channel}`);
        selected[channel] = structuredClone(available[channel]);
      }
      return deepFreeze(selected);
    },

    readPackageSupplyChainEvidence(): Readonly<Record<string, unknown>> {
      assertActive(released, 'readPackageSupplyChainEvidence');
      return retainedPatchMapPackageEvidence(
        packageConsumerResultJson as Readonly<Record<string, unknown>>,
      );
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (!released) {
        released = true;
        for (const subscription of subscriptions) subscription.dispose();
        redactionOperations.disposeCallbacks();
      }
      const probe = redactionOperations.probe();
      returnedDiagnostic = null;
      logs.splice(0);
      observers.splice(0);
      telemetry.splice(0);
      return deepFreeze({
        revision: PATCH_MAP_SECURITY_OPERATIONS_CLEANUP_REVISION,
        caseId,
        callbackRegistrations: probe.callbackRegistrations,
        queuedActionCount: probe.queuedActionCount,
        retainedChannelRecordCount: logs.length + observers.length + telemetry.length,
      });
    },
  });
}

function sensitiveValue(field: string, marker: string): unknown {
  switch (field) {
    case 'text':
      return `customer:${marker}`;
    case 'dataUri':
      return `data:text/plain;base64,${marker}`;
    case 'token':
      return `Bearer ${marker}`;
    case 'queryString':
      return `https://customer.invalid/map?token=${marker}`;
    case 'attrs':
      return { metadata: { private: marker } };
    default:
      return { [field]: marker };
  }
}

function requireCaseId(value: string): asserts value is PatchMapSecurityOperationsCaseId {
  invariant(
    (PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS as readonly string[]).includes(value),
    `unsupported case ${value}`,
  );
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} after release`);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap security/operations runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
