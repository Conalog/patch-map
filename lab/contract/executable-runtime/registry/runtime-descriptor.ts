import type {
  PatchMapExecutableCasePlan,
} from '../../executable-cases';
import type {
  PatchMapExecutableRun,
  PatchMapExecutableRuntimeDescriptor,
  PatchMapExecutableRuntimeKey,
  PatchMapFold,
  PatchMapHandlerFactory,
} from '../contracts';
import {
  createPatchMapRuntimeDescriptor,
  requirePatchMapFold,
  requirePatchMapHandlerFactory,
  selectPatchMapHandlerEntries,
} from '../descriptor';

interface PatchMapProductRuntime {
  readonly product: unknown;
}

type PatchMapPostDestroyProbe = NonNullable<
  PatchMapExecutableRun['postDestroyProductProbe']
>;

/**
 * Adapts one actual-product runtime to the shared handler/fold descriptor
 * contract. Expected evidence and comparison remain outside this boundary.
 */
export function createPatchMapProductRuntimeDescriptor<
  Runtime extends PatchMapProductRuntime,
>(options: Readonly<{
  key: PatchMapExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  handlerFactory: PatchMapHandlerFactory | undefined;
  handlerLabel: string;
  fold: PatchMapFold | undefined;
  foldLabel: string;
  createRuntime(plan: PatchMapExecutableCasePlan): Runtime;
  engineOptions?(
    runtime: Runtime,
  ): PatchMapExecutableRun['engineOptions'];
  actionTimeoutMs?: number;
  postDestroyProductProbe?(
    runtime: Runtime,
  ): PatchMapPostDestroyProbe;
}>): PatchMapExecutableRuntimeDescriptor {
  const fold = requirePatchMapFold(options.fold, options.foldLabel);
  const createEntries = requirePatchMapHandlerFactory(
    options.handlerFactory,
    options.handlerLabel,
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    const runtime = options.createRuntime(plan);
    const baseRun = {
      handlerEntries: selectPatchMapHandlerEntries(
        plan,
        createEntries(
          runtime.product as Readonly<Record<string, unknown>>,
        ),
      ),
      engineOptions: options.engineOptions?.(runtime) ?? Object.freeze({}),
    };
    return Object.freeze({
      ...baseRun,
      ...(options.actionTimeoutMs === undefined
        ? {}
        : { actionTimeoutMs: options.actionTimeoutMs }),
      ...(options.postDestroyProductProbe === undefined
        ? {}
        : {
            postDestroyProductProbe:
              options.postDestroyProductProbe(runtime),
          }),
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    createRun,
    fold,
  });
}
