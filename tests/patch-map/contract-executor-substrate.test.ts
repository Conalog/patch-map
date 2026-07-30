import { describe, expect, it } from 'vitest';

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
  readonly binding?: Readonly<{
    readonly producesFields?: readonly string[];
    readonly consumesFields?: readonly string[];
    readonly capturePaths?: readonly string[];
  }>;
}

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

interface CaseRecord {
  readonly id: string;
  readonly caseType: 'capability';
  readonly fixtureProfiles?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly Readonly<Record<string, unknown>>[];
    readonly cleanupTrace: readonly Readonly<Record<string, unknown>>[];
  }>;
}

interface Execution {
  readonly status: string;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly captures: readonly Readonly<Record<string, unknown>>[];
  readonly actionResults: readonly Readonly<Record<string, unknown>>[];
}

interface ExecutionFailure extends Error {
  readonly code: string;
  readonly partialExecution: Execution;
}

interface HandlerContext {
  readonly fixtureProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

type Handler = (
  context: HandlerContext,
  action: ContractAction,
) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;

interface WorkerRuntime {
  executeContractCase(this: void, options: Readonly<Record<string, unknown>>): Promise<Execution>;
}

const worker = await import(
  /* @vite-ignore */ new URL('../../scripts/verification/core-v2-contract/execute-worker.mjs', import.meta.url).href
) as WorkerRuntime;

describe('PatchMap contract executor shared capture substrate', () => {
  it.each([
    { label: 'dynamic', capturePaths: ['$operands.paths'] },
    { label: 'literal', capturePaths: ['bar/id'] },
  ])('preserves $label binding capture paths and commits a detached binding', async ({ capturePaths }) => {
    const source = { bar: { id: 'bar', size: { height: 10 } } };
    const execution = await execute(
      oneActionCase({
        operands: { as: 'initial', paths: ['bar/id'] },
      }),
      bindingDefinition(capturePaths),
      (_context, action) => ({
        actual: { captured: true },
        bindings: { [String(action.operands.as)]: source },
      }),
    );

    source.bar.id = 'mutated-after-execution';
    expect(execution.bindings).toEqual({
      initial: { bar: { id: 'bar', size: { height: 10 } } },
    });
    expect(Object.isFrozen(execution.bindings)).toBe(true);
    expect(Object.isFrozen((execution.bindings.initial as { bar: object }).bar)).toBe(true);
  });

  it.each([
    { label: 'missing', paths: undefined },
    { label: 'empty', paths: [] },
    { label: 'empty entry', paths: [''] },
    { label: 'duplicate', paths: ['bar/id', 'bar/id'] },
    { label: 'non-string', paths: ['bar/id', 1] },
    { label: 'sparse', paths: sparsePathArray() },
  ])('rejects $label dynamic operand paths before binding commit', async ({ paths }) => {
    const operands: Record<string, unknown> = { as: 'initial' };
    if (paths !== undefined) operands.paths = paths;
    const failure = await expectFailure(execute(
      oneActionCase({ operands }),
      bindingDefinition(['$operands.paths']),
      () => ({ actual: {}, bindings: { initial: { bar: { id: 'bar' } } } }),
    ));

    expect(failure.partialExecution.bindings).toEqual({});
    expect(failure.partialExecution.captures).toEqual([]);
  });

  it('rejects unknown dynamic operands and keeps all bindings from the action atomic', async () => {
    const definition = bindingDefinition(['$operands.capturePaths'], ['as', 'alsoAs']);
    const failure = await expectFailure(execute(
      oneActionCase({
        operands: {
          as: 'first',
          alsoAs: 'second',
          paths: ['bar/id'],
        },
      }),
      definition,
      () => ({
        actual: {},
        bindings: {
          first: { bar: { id: 'bar' } },
          second: { bar: { id: 'bar' } },
        },
      }),
    ));

    expect(failure.message).toContain('unknown dynamic binding capture path');
    expect(failure.partialExecution.bindings).toEqual({});
  });

  it('commits a before-actions checkpoint from action 0 with the declared -1 index', async () => {
    const beforeCaptureSource = { target: { size: { width: 60 } }, siblings: ['bg', 'label'] };
    const execution = await execute(
      oneActionCase({
        captureCheckpoints: [{
          id: 'before',
          phase: 'before-actions',
          afterActionIndex: -1,
          paths: ['target/size/width', 'siblings'],
        }],
      }),
      plainDefinition(),
      () => ({ actual: { frozen: true }, beforeCaptureSource }),
    );

    beforeCaptureSource.target.size.width = 99;
    expect(execution.captures).toEqual([{
      id: 'before',
      phase: 'before-actions',
      afterActionIndex: -1,
      values: {
        'target/size/width': 60,
        siblings: ['bg', 'label'],
      },
    }]);
  });

  it('fails closed when action 0 omits the declared before-actions source', async () => {
    const definition = bindingDefinition([], ['as']);
    const failure = await expectFailure(execute(
      oneActionCase({
        operands: { as: 'not-committed' },
        captureCheckpoints: [{
          id: 'before',
          phase: 'before-actions',
          afterActionIndex: -1,
          paths: ['target/id'],
        }],
      }),
      definition,
      () => ({
        actual: {},
        bindings: { 'not-committed': { target: { id: 'rect-b' } } },
      }),
    ));

    expect(failure.message).toContain('beforeCaptureSource');
    expect(failure.partialExecution.bindings).toEqual({});
    expect(failure.partialExecution.captures).toEqual([]);
  });

  it('rejects duplicate before-actions checkpoint identities before invoking action 0', async () => {
    let invoked = false;
    const failure = await expectFailure(execute(
      oneActionCase({
        captureCheckpoints: [
          { id: 'before', phase: 'before-actions', afterActionIndex: -1, paths: ['target/id'] },
          { id: 'before', phase: 'before-actions', afterActionIndex: -1, paths: ['target/id'] },
        ],
      }),
      plainDefinition(),
      () => {
        invoked = true;
        return { actual: {}, beforeCaptureSource: { target: { id: 'rect-b' } } };
      },
    ));

    expect(invoked).toBe(false);
    expect(failure.partialExecution.actionResults).toEqual([]);
    expect(failure.partialExecution.captures).toEqual([]);
  });

  it('rejects a second beforeCaptureSource after action 0 committed the checkpoint', async () => {
    const base = oneActionCase({
      captureCheckpoints: [{
        id: 'before',
        phase: 'before-actions',
        afterActionIndex: -1,
        paths: ['target/id'],
      }],
    });
    const caseRecord: CaseRecord = {
      ...base,
      fixture: {
        ...base.fixture,
        actionTrace: [
          { index: 0, type: 'probe', operands: {} },
          { index: 1, type: 'probe', operands: {} },
        ],
      },
    };
    const failure = await expectFailure(execute(
      caseRecord,
      plainDefinition(),
      (_context, action) => ({
        actual: { index: action.index },
        beforeCaptureSource: { target: { id: 'rect-b' } },
      }),
    ));

    expect(failure.message).toContain('duplicate beforeCaptureSource');
    expect(failure.partialExecution.captures).toEqual([{
      id: 'before',
      phase: 'before-actions',
      afterActionIndex: -1,
      values: { 'target/id': 'rect-b' },
    }]);
    expect(failure.partialExecution.actionResults).toHaveLength(2);
  });

  it('provides only a detached deeply frozen fixture-profile map to handlers', async () => {
    const sourceProfiles = {
      'mutation-transaction-matrix': {
        datasetRef: 'all-kinds-scene',
        strict: true,
      },
    };
    let observed: HandlerContext['fixtureProfiles'] | null = null;
    const execution = await execute(
      oneActionCase({ fixtureProfiles: sourceProfiles }),
      plainDefinition(),
      (context) => {
        observed = context.fixtureProfiles;
        return { actual: { observed: true } };
      },
    );

    expect(execution.status).toBe('completed');
    expect(observed).toEqual(sourceProfiles);
    expect(observed).not.toBe(sourceProfiles);
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed?.['mutation-transaction-matrix'])).toBe(true);
  });
});

function oneActionCase(options: Readonly<{
  operands?: Readonly<Record<string, unknown>>;
  captureCheckpoints?: readonly Readonly<Record<string, unknown>>[];
  fixtureProfiles?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}> = {}): CaseRecord {
  return {
    id: 'TST-001',
    caseType: 'capability',
    ...(options.fixtureProfiles === undefined ? {} : { fixtureProfiles: options.fixtureProfiles }),
    fixture: {
      setup: { params: {} },
      actionTrace: [{ index: 0, type: 'probe', operands: options.operands ?? {} }],
      captureCheckpoints: options.captureCheckpoints ?? [],
      cleanupTrace: [{ type: 'destroy-case', operands: { expectedResourceDelta: 0 } }],
    },
  };
}

function bindingDefinition(
  capturePaths: readonly string[],
  producesFields: readonly string[] = ['as'],
): ActionDefinition {
  return {
    type: 'probe',
    handlerId: 'contract/probe',
    binding: { producesFields, consumesFields: [], capturePaths },
  };
}

function plainDefinition(): ActionDefinition {
  return bindingDefinition([], []);
}

async function execute(
  caseRecord: CaseRecord,
  definition: ActionDefinition,
  handler: Handler,
): Promise<Execution> {
  return worker.executeContractCase({
    caseRecord,
    actionDefinitions: [definition],
    engineFactory: () => {
      throw new Error('test action unexpectedly requested an engine');
    },
    datasets: new Map<string, unknown>(),
    clock: new ManualClock(),
    handlerEntries: [['contract/probe', handler]],
  });
}

async function expectFailure(promise: Promise<Execution>): Promise<ExecutionFailure> {
  try {
    await promise;
    throw new Error('expected execution to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('PatchMapContractExecutionError');
    expect((error as ExecutionFailure).partialExecution).toBeTypeOf('object');
    return error as ExecutionFailure;
  }
}

function sparsePathArray(): readonly string[] {
  const value = new Array<string>(1);
  return value;
}

class ManualClock {
  private current = 0;

  now(): number {
    return this.current;
  }

  advanceTo(timeMs: number): Promise<void> {
    this.current = timeMs;
    return Promise.resolve();
  }

  withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}
