export const PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION = 'core-v2-contract-lab-bridge/1' as const;

export type PatchMapContractLabMilestone = 'semantic' | 'published' | 'settled' | 'released';
export type PatchMapContractLabStatus =
  | 'loading'
  | 'ready'
  | 'armed'
  | 'running'
  | 'observed'
  | 'not-implemented'
  | 'failed'
  | 'destroyed';

export interface PatchMapContractPublishedTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export interface PatchMapContractLabState {
  readonly caseId: string;
  readonly rootTestId: string;
  readonly status: PatchMapContractLabStatus;
  readonly actionIndex: number;
  readonly repeatIndex: number;
  readonly publishedTuple: PatchMapContractPublishedTuple;
}

export interface PatchMapContractGesturePlan {
  readonly revision: 'core-v2-contract-gesture-plan/1';
  readonly actionIndex: number;
  readonly driverId: string;
  readonly ownerQualifiedTarget: string;
  readonly cssLocalAnchors: readonly Readonly<{ x: number; y: number }>[];
  readonly button: number;
  readonly modifiers: readonly string[];
  readonly publishedTuple: PatchMapContractPublishedTuple;
}

export interface PatchMapContractLabRunResult {
  readonly status: 'observed';
  readonly execution: Readonly<Record<string, unknown>>;
  readonly actualObservation: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
  readonly cleanup: Readonly<Record<string, unknown>>;
}

export interface PatchMapContractLabBridgeV1 {
  readonly revision: typeof PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION;
  state(): Readonly<PatchMapContractLabState>;
  execution(): Readonly<Record<string, unknown>> | null;
  cleanup(): Readonly<Record<string, unknown>> | null;
  runCase(): Promise<Readonly<PatchMapContractLabRunResult>>;
  resetCase(): Promise<Readonly<Record<string, unknown>>>;
  repeatCase(): Promise<Readonly<PatchMapContractLabRunResult>>;
  armGesture(actionIndex: number): Promise<Readonly<PatchMapContractGesturePlan>>;
  awaitMilestone(actionIndex: number, milestone: PatchMapContractLabMilestone): Promise<void>;
  actualObservation(): Promise<Readonly<Record<string, unknown>>>;
  destroyCase(): Promise<Readonly<Record<string, unknown>>>;
}

export class PatchMapContractExecutionNotImplementedError extends Error {
  constructor(caseId: string, operation: string) {
    super(`PatchMap contract ${caseId} ${operation} is not implemented in the focused Lab`);
    this.name = 'PatchMapContractExecutionNotImplementedError';
  }
}

interface StubBridgeOptions {
  readonly caseId: string;
  readonly rootTestId: string;
  readonly actionCount: number;
}

function frozenTuple(): PatchMapContractPublishedTuple {
  return Object.freeze({ scene: 0, view: 0, interaction: 0 });
}

export function createNotImplementedPatchMapContractLabBridge(
  options: StubBridgeOptions,
): PatchMapContractLabBridgeV1 {
  let status: PatchMapContractLabStatus = 'not-implemented';

  function state(): Readonly<PatchMapContractLabState> {
    return Object.freeze({
      caseId: options.caseId,
      rootTestId: options.rootTestId,
      status,
      actionIndex: -1,
      repeatIndex: 0,
      publishedTuple: frozenTuple(),
    });
  }

  function assertActionIndex(actionIndex: number): void {
    if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= options.actionCount) {
      throw new RangeError(`Action index is outside ${options.caseId}: ${actionIndex}`);
    }
  }

  return Object.freeze({
    revision: PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION,
    state,
    execution(): null {
      return null;
    },
    cleanup(): null {
      return null;
    },
    runCase(): Promise<Readonly<PatchMapContractLabRunResult>> {
      return Promise.reject(
        new PatchMapContractExecutionNotImplementedError(options.caseId, 'case execution'),
      );
    },
    resetCase(): Promise<Readonly<Record<string, unknown>>> {
      if (status !== 'destroyed') status = 'not-implemented';
      return Promise.resolve(Object.freeze({ notImplemented: 1 }));
    },
    repeatCase(): Promise<Readonly<PatchMapContractLabRunResult>> {
      return Promise.reject(
        new PatchMapContractExecutionNotImplementedError(options.caseId, 'repeat execution'),
      );
    },
    armGesture(actionIndex: number): Promise<Readonly<PatchMapContractGesturePlan>> {
      return Promise.resolve().then(() => {
        assertActionIndex(actionIndex);
        throw new PatchMapContractExecutionNotImplementedError(options.caseId, 'gesture execution');
      });
    },
    awaitMilestone(
      actionIndex: number,
      _milestone: PatchMapContractLabMilestone,
    ): Promise<void> {
      return Promise.resolve().then(() => {
        assertActionIndex(actionIndex);
        throw new PatchMapContractExecutionNotImplementedError(options.caseId, 'milestone observation');
      });
    },
    actualObservation(): Promise<Readonly<Record<string, unknown>>> {
      return Promise.resolve(Object.freeze({
        $schema: 'core-v2-contract-lab-actual-stub/1',
        case: Object.freeze({ id: options.caseId, rootTestId: options.rootTestId }),
        execution: Object.freeze({
          status: 'not-implemented',
          reason: 'The T0 Lab shell has no engine action executor',
        }),
        state: state(),
      }));
    },
    destroyCase(): Promise<Readonly<Record<string, number>>> {
      status = 'destroyed';
      return Promise.resolve(Object.freeze({ notImplemented: 1 }));
    },
  });
}
