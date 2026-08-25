import type {
  PatchMapExecutableCasePlan,
} from '../executable-cases';
import type {
  PatchMapExecutableHandlerEntry,
  PatchMapExecutableRuntimeDescriptor,
  PatchMapExecutableRuntimeKey,
  PatchMapFold,
  PatchMapFoldedExecution,
  PatchMapHandlerFactory,
  PatchMapRuntimeFoldInput,
} from './contracts';

export function createPatchMapExecutableDescriptor(options: Readonly<{
  key: PatchMapExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  createEntries: () => readonly PatchMapExecutableHandlerEntry[];
  fold: PatchMapFold;
}>): PatchMapExecutableRuntimeDescriptor {
  const createRun = (plan: PatchMapExecutableCasePlan) => Object.freeze({
    handlerEntries: selectPatchMapHandlerEntries(plan, options.createEntries()),
    engineOptions: Object.freeze({}),
  });
  return Object.freeze({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    createRun,
    handlerEntries(plan: PatchMapExecutableCasePlan) {
      return createRun(plan).handlerEntries;
    },
    fold(input: PatchMapRuntimeFoldInput): PatchMapFoldedExecution {
      return foldPatchMapExecution(options.fold, input);
    },
  });
}

export function createPatchMapRuntimeDescriptor(options: Readonly<{
  key: PatchMapExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  createRun: PatchMapExecutableRuntimeDescriptor['createRun'];
  fold: PatchMapFold;
}>): PatchMapExecutableRuntimeDescriptor {
  return Object.freeze({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    createRun: options.createRun,
    handlerEntries(plan: PatchMapExecutableCasePlan) {
      return options.createRun(plan).handlerEntries;
    },
    fold(input: PatchMapRuntimeFoldInput): PatchMapFoldedExecution {
      return foldPatchMapExecution(options.fold, input);
    },
  });
}

export function selectPatchMapHandlerEntries(
  plan: PatchMapExecutableCasePlan,
  entries: readonly PatchMapExecutableHandlerEntry[],
): readonly PatchMapExecutableHandlerEntry[] {
  const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
  const selected = entries.filter(([handlerId]) => required.has(handlerId));
  patchMapExecutableInvariant(
    selected.length === required.size,
    `${plan.id} exact handler coverage`,
  );
  patchMapExecutableInvariant(
    new Set(selected.map(([handlerId]) => handlerId)).size === selected.length,
    `${plan.id} handler collisions`,
  );
  return Object.freeze(selected);
}

export function requirePatchMapHandlerFactory(
  value: PatchMapHandlerFactory | undefined,
  label: string,
): PatchMapHandlerFactory {
  patchMapExecutableInvariant(typeof value === 'function', `${label} export`);
  return value;
}

export function requirePatchMapFold(
  value: PatchMapFold | undefined,
  label: string,
): PatchMapFold {
  patchMapExecutableInvariant(typeof value === 'function', `${label} export`);
  return value;
}

export function patchMapExecutableInvariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap executable Lab runtime: ${message}`);
  }
}

function foldPatchMapExecution(
  fold: PatchMapFold,
  input: PatchMapRuntimeFoldInput,
): PatchMapFoldedExecution {
  return fold({
    casePlan: input.casePlan,
    execution: input.execution,
    provenance: input.provenance,
    environment: input.environment,
  });
}
