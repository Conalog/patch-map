import { createPatchMapAccessibilityRuntime } from '../../accessibility-runtime';
import { createPatchMapAssetIngestionRuntime } from '../../asset-ingestion-runtime';
import { createPatchMapSecurityOperationsRuntime } from '../../security-operations-runtime';
import {
  isAccessibilityCaseId,
  isSecurityOperationsCaseId,
  type PatchMapExecutableRoute,
} from '../case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from '../contracts';
import { patchMapExecutableInvariant as invariant } from '../descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from '../script-modules';
import { createPatchMapAstAssetRuntime } from '../ast-asset-product';
import {
  createPatchMapProductRuntimeDescriptor,
} from './runtime-descriptor';

const ASSET_INGESTION_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'asset-ingestion',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.assetIngestion
      .createAssetIngestionHandlerEntries,
  handlerLabel: 'asset-ingestion handlers',
  fold: PATCH_MAP_FOLD_MODULES.assetIngestion.foldAssetIngestionExecution,
  foldLabel: 'asset-ingestion fold',
  createRuntime: () => createPatchMapAssetIngestionRuntime(),
  engineOptions: (runtime) => Object.freeze({
    assetRuntime: runtime.assetRuntime,
    assetPolicy: runtime.assetPolicy,
  }),
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const SECURITY_OPERATIONS_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'security-operations',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.securityOperations
        .createSecurityOperationsHandlerEntries,
    handlerLabel: 'security-operations handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.securityOperations
        .foldSecurityOperationsExecution,
    foldLabel: 'security-operations fold',
    createRuntime(plan) {
      invariant(
        isSecurityOperationsCaseId(plan.id),
        'security-operations case identity',
      );
      return createPatchMapSecurityOperationsRuntime(plan.id);
    },
    actionTimeoutMs: 120_000,
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

const ACCESSIBILITY_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'accessibility',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.accessibility
      .createAccessibilityHandlerEntries,
  handlerLabel: 'accessibility handlers',
  fold: PATCH_MAP_FOLD_MODULES.accessibility.foldAccessibilityExecution,
  foldLabel: 'accessibility fold',
  createRuntime(plan) {
    invariant(isAccessibilityCaseId(plan.id), 'accessibility case identity');
    return createPatchMapAccessibilityRuntime(plan.id);
  },
  actionTimeoutMs: 60_000,
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const ASSET_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'assets',
  needsSupplementalWebGLLease: true,
  handlerFactory: PATCH_MAP_HANDLER_MODULES.assets.createAssetHandlerEntries,
  handlerLabel: 'asset handlers',
  fold: PATCH_MAP_FOLD_MODULES.assets.foldAssetExecution,
  foldLabel: 'asset fold',
  createRuntime: () => createPatchMapAstAssetRuntime(),
  engineOptions: (runtime) => Object.freeze({
    assetRuntime: runtime.assetRuntime,
    assetPolicy: runtime.assetPolicy,
  }),
});

export const PATCH_MAP_ASSET_OPERATION_DESCRIPTORS = Object.freeze({
  'asset-ingestion': ASSET_INGESTION_DESCRIPTOR,
  'security-operations': SECURITY_OPERATIONS_DESCRIPTOR,
  accessibility: ACCESSIBILITY_DESCRIPTOR,
  assets: ASSET_DESCRIPTOR,
}) satisfies Readonly<
  Partial<Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>>
>;
