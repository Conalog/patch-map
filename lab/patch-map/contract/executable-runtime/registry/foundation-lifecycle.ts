import { createPatchMapDeterminismLifecycleRuntime } from '../../determinism-lifecycle-runtime';
import { createPatchMapLifecycleInterruptionRuntime } from '../../lifecycle-interruption-runtime';
import { createPatchMapReplacementRecoveryRuntime } from '../../replacement-recovery-runtime';
import {
  isDeterminismLifecycleCaseId,
  isLifecycleInterruptionCaseId,
  isReplacementRecoveryCaseId,
  type PatchMapExecutableRoute,
} from '../case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from '../contracts';
import {
  createPatchMapExecutableDescriptor as createDescriptor,
  patchMapExecutableInvariant as invariant,
  requirePatchMapFold as requireFold,
  requirePatchMapHandlerFactory as requireFactory,
} from '../descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from '../script-modules';
import {
  PATCH_MAP_DATA_FOUNDATION_PRODUCT,
  PATCH_MAP_LIFECYCLE_DESTROY_PRODUCT,
} from '../foundation-products';
import {
  createPatchMapProductRuntimeDescriptor,
} from './runtime-descriptor';

const FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => [
    ...requireFactory(
      PATCH_MAP_HANDLER_MODULES.foundation.createFoundationHandlerEntries,
      'foundation handlers',
    )(),
    ...requireFactory(
      PATCH_MAP_HANDLER_MODULES.emptyState.createEmptyStateHandlerEntries,
      'empty-state handlers',
    )(),
  ],
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.foundation.foldFoundationExecution,
    'foundation fold',
  ),
});

const DATA_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'data-foundation',
  needsSupplementalWebGLLease: true,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.dataFoundation.createDataFoundationHandlerEntries,
    'data-foundation handlers',
  )(PATCH_MAP_DATA_FOUNDATION_PRODUCT),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.dataFoundation.foldDataFoundationExecution,
    'data-foundation fold',
  ),
});

const DATA_CLOSURE_DESCRIPTOR = createDescriptor({
  key: 'data-closure',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.dataClosure.createDataClosureHandlerEntries,
    'data-closure handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.dataClosure.foldDataClosureExecution,
    'data-closure fold',
  ),
});

const LIFECYCLE_RESIZE_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-resize',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.lifecycleResize.createLifecycleResizeHandlerEntries,
    'lifecycle-resize handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.lifecycleResize.foldLifecycleResizeExecution,
    'lifecycle-resize fold',
  ),
});

const LIFECYCLE_DESTROY_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-destroy',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.lifecycleDestroy.createLifecycleDestroyHandlerEntries,
    'lifecycle-destroy handlers',
  )(PATCH_MAP_LIFECYCLE_DESTROY_PRODUCT),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.lifecycleDestroy.foldLifecycleDestroyExecution,
    'lifecycle-destroy fold',
  ),
});

const LIFECYCLE_INTERRUPTION_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'lifecycle-interruption',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.lifecycleInterruption
        .createLifecycleInterruptionHandlerEntries,
    handlerLabel: 'lifecycle-interruption handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.lifecycleInterruption
        .foldLifecycleInterruptionExecution,
    foldLabel: 'lifecycle-interruption fold',
    createRuntime(plan) {
      invariant(
        isLifecycleInterruptionCaseId(plan.id),
        'lifecycle-interruption case identity',
      );
      return createPatchMapLifecycleInterruptionRuntime(plan.id);
    },
    actionTimeoutMs: 60_000,
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

const DETERMINISM_LIFECYCLE_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'determinism-lifecycle',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.determinismLifecycle
        .createDeterminismLifecycleHandlerEntries,
    handlerLabel: 'determinism-lifecycle handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.determinismLifecycle
        .foldDeterminismLifecycleExecution,
    foldLabel: 'determinism-lifecycle fold',
    createRuntime(plan) {
      invariant(
        isDeterminismLifecycleCaseId(plan.id),
        'determinism-lifecycle case identity',
      );
      return createPatchMapDeterminismLifecycleRuntime(plan.id);
    },
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

export const PATCH_MAP_FOUNDATION_LIFECYCLE_DESCRIPTORS = Object.freeze({
  foundation: FOUNDATION_DESCRIPTOR,
  'data-foundation': DATA_FOUNDATION_DESCRIPTOR,
  'data-closure': DATA_CLOSURE_DESCRIPTOR,
  'lifecycle-resize': LIFECYCLE_RESIZE_DESCRIPTOR,
  'lifecycle-destroy': LIFECYCLE_DESTROY_DESCRIPTOR,
  'lifecycle-interruption': LIFECYCLE_INTERRUPTION_DESCRIPTOR,
  'determinism-lifecycle': DETERMINISM_LIFECYCLE_DESCRIPTOR,
}) satisfies Readonly<
  Partial<Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>>
>;

export const PATCH_MAP_REPLACEMENT_RECOVERY_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'replacement-recovery',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.replacementRecovery
        .createReplacementRecoveryHandlerEntries,
    handlerLabel: 'replacement-recovery handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.replacementRecovery
        .foldReplacementRecoveryExecution,
    foldLabel: 'replacement-recovery fold',
    createRuntime(plan) {
      invariant(
        isReplacementRecoveryCaseId(plan.id),
        'replacement-recovery case identity',
      );
      return createPatchMapReplacementRecoveryRuntime(plan.id);
    },
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });
