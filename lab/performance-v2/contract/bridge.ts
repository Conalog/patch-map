export const CORE_V2_CONTRACT_LAB_BRIDGE_REVISION = 'core-v2-contract-lab-bridge/1' as const;

export type CoreV2ContractLabMilestone = 'semantic' | 'published' | 'settled' | 'released';
export type CoreV2ContractLabStatus =
  | 'loading'
  | 'ready'
  | 'armed'
  | 'running'
  | 'observed'
  | 'not-implemented'
  | 'failed'
  | 'destroyed';

export interface CoreV2ContractPublishedTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export interface CoreV2ContractLabState {
  readonly caseId: string;
  readonly rootTestId: string;
  readonly status: CoreV2ContractLabStatus;
  readonly actionIndex: number;
  readonly repeatIndex: number;
  readonly publishedTuple: CoreV2ContractPublishedTuple;
}

export interface CoreV2ContractGesturePlan {
  readonly revision: 'core-v2-contract-gesture-plan/1';
  readonly actionIndex: number;
  readonly driverId: string;
  readonly ownerQualifiedTarget: string;
  readonly cssLocalAnchors: readonly Readonly<{ x: number; y: number }>[];
  readonly button: number;
  readonly modifiers: readonly string[];
  readonly publishedTuple: CoreV2ContractPublishedTuple;
}

export interface CoreV2ContractLabRunResult {
  readonly status: 'observed';
  readonly execution: Readonly<Record<string, unknown>>;
  readonly actualObservation: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
  readonly cleanup: Readonly<Record<string, unknown>>;
}

export interface CoreV2ContractLabBridgeV1 {
  readonly revision: typeof CORE_V2_CONTRACT_LAB_BRIDGE_REVISION;
  state(): Readonly<CoreV2ContractLabState>;
  execution(): Readonly<Record<string, unknown>> | null;
  cleanup(): Readonly<Record<string, unknown>> | null;
  runCase(): Promise<Readonly<CoreV2ContractLabRunResult>>;
  resetCase(): Promise<Readonly<Record<string, unknown>>>;
  repeatCase(): Promise<Readonly<CoreV2ContractLabRunResult>>;
  armGesture(actionIndex: number): Promise<Readonly<CoreV2ContractGesturePlan>>;
  awaitMilestone(actionIndex: number, milestone: CoreV2ContractLabMilestone): Promise<void>;
  actualObservation(): Promise<Readonly<Record<string, unknown>>>;
  destroyCase(): Promise<Readonly<Record<string, unknown>>>;
}

export class CoreV2ContractExecutionNotImplementedError extends Error {
  constructor(caseId: string, operation: string) {
    super(`Core v2 contract ${caseId} ${operation} is not implemented in the focused Lab`);
    this.name = 'CoreV2ContractExecutionNotImplementedError';
  }
}

interface StubBridgeOptions {
  readonly caseId: string;
  readonly rootTestId: string;
  readonly actionCount: number;
}

function frozenTuple(): CoreV2ContractPublishedTuple {
  return Object.freeze({ scene: 0, view: 0, interaction: 0 });
}

export function createNotImplementedCoreV2ContractLabBridge(
  options: StubBridgeOptions,
): CoreV2ContractLabBridgeV1 {
  let status: CoreV2ContractLabStatus = 'not-implemented';

  function state(): Readonly<CoreV2ContractLabState> {
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
    revision: CORE_V2_CONTRACT_LAB_BRIDGE_REVISION,
    state,
    execution(): null {
      return null;
    },
    cleanup(): null {
      return null;
    },
    runCase(): Promise<Readonly<CoreV2ContractLabRunResult>> {
      return Promise.reject(
        new CoreV2ContractExecutionNotImplementedError(options.caseId, 'case execution'),
      );
    },
    resetCase(): Promise<Readonly<Record<string, unknown>>> {
      if (status !== 'destroyed') status = 'not-implemented';
      return Promise.resolve(Object.freeze({ notImplemented: 1 }));
    },
    repeatCase(): Promise<Readonly<CoreV2ContractLabRunResult>> {
      return Promise.reject(
        new CoreV2ContractExecutionNotImplementedError(options.caseId, 'repeat execution'),
      );
    },
    armGesture(actionIndex: number): Promise<Readonly<CoreV2ContractGesturePlan>> {
      return Promise.resolve().then(() => {
        assertActionIndex(actionIndex);
        throw new CoreV2ContractExecutionNotImplementedError(options.caseId, 'gesture execution');
      });
    },
    awaitMilestone(
      actionIndex: number,
      _milestone: CoreV2ContractLabMilestone,
    ): Promise<void> {
      return Promise.resolve().then(() => {
        assertActionIndex(actionIndex);
        throw new CoreV2ContractExecutionNotImplementedError(options.caseId, 'milestone observation');
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
