import { createPatchMapExportExtractionRuntime } from '../../export-extraction-runtime';
import { createPatchMapPackageIntegrationRuntime } from '../../package-integration-runtime';
import { createPatchMapPerformanceRuntime } from '../../performance-runtime';
import {
  isExportExtractionCaseId,
  isPackageIntegrationCaseId,
  isPerformanceCaseId,
  isPixijsIntegrationCaseId,
  type PatchMapExecutableRoute,
} from '../case-routing';
import type {
  PatchMapExecutableCasePlan,
} from '../../executable-cases';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from '../contracts';
import {
  createPatchMapRuntimeDescriptor,
  patchMapExecutableInvariant as invariant,
  requirePatchMapFold as requireFold,
  requirePatchMapHandlerFactory as requireFactory,
  selectPatchMapHandlerEntries as selectHandlerEntries,
} from '../descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from '../script-modules';
import {
  createPatchMapProductRuntimeDescriptor,
} from './runtime-descriptor';

const EXPORT_EXTRACTION_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'export-extraction',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.exportExtraction
        .createExportExtractionHandlerEntries,
    handlerLabel: 'export-extraction handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.exportExtraction.foldExportExtractionExecution,
    foldLabel: 'export-extraction fold',
    createRuntime(plan) {
      invariant(
        isExportExtractionCaseId(plan.id),
        'export-extraction case identity',
      );
      return createPatchMapExportExtractionRuntime(plan.id);
    },
    actionTimeoutMs: 60_000,
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

const PIXIJS_INTEGRATION_DESCRIPTOR = createPixijsIntegrationDescriptor();
const PACKAGE_INTEGRATION_DESCRIPTOR = createPackageIntegrationDescriptor(true);
const PACKAGE_MULTI_INSTANCE_DESCRIPTOR =
  createPackageIntegrationDescriptor(false);
const PERFORMANCE_EVIDENCE_DESCRIPTOR = createPerformanceDescriptor(true);
const PERFORMANCE_PRODUCT_DESCRIPTOR = createPerformanceDescriptor(false);

export const PATCH_MAP_INTEGRATION_DESCRIPTORS = Object.freeze({
  'export-extraction': EXPORT_EXTRACTION_DESCRIPTOR,
  'pixijs-integration': PIXIJS_INTEGRATION_DESCRIPTOR,
  'package-integration': PACKAGE_INTEGRATION_DESCRIPTOR,
  'package-multi-instance': PACKAGE_MULTI_INSTANCE_DESCRIPTOR,
  'performance-evidence': PERFORMANCE_EVIDENCE_DESCRIPTOR,
  'performance-product': PERFORMANCE_PRODUCT_DESCRIPTOR,
}) satisfies Readonly<
  Partial<Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>>
>;

function createPixijsIntegrationDescriptor(): PatchMapExecutableRuntimeDescriptor {
  const fold = requireFold(
    PATCH_MAP_FOLD_MODULES.pixijsIntegration.foldPixijsIntegrationExecution,
    'PixiJS integration fold',
  );
  const createEntries = requireFactory(
    PATCH_MAP_HANDLER_MODULES.pixijsIntegration
      .createPixijsIntegrationHandlerEntries,
    'PixiJS integration handlers',
  );
  const createRun = (plan: PatchMapExecutableCasePlan) => {
    invariant(
      isPixijsIntegrationCaseId(plan.id),
      'PixiJS integration case identity',
    );
    return Object.freeze({
      handlerEntries: selectHandlerEntries(plan, createEntries()),
      engineOptions: Object.freeze({}),
      actionTimeoutMs: 120_000,
    });
  };
  return createPatchMapRuntimeDescriptor({
    key: 'pixijs-integration',
    needsSupplementalWebGLLease: false,
    createRun,
    fold,
  });
}

function createPackageIntegrationDescriptor(
  needsSupplementalWebGLLease: boolean,
): PatchMapExecutableRuntimeDescriptor {
  return createPatchMapProductRuntimeDescriptor({
    key: 'package-integration',
    needsSupplementalWebGLLease,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.packageIntegration
        .createPackageIntegrationHandlerEntries,
    handlerLabel: 'package integration handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.packageIntegration
        .foldPackageIntegrationExecution,
    foldLabel: 'package integration fold',
    createRuntime(plan) {
      invariant(
        isPackageIntegrationCaseId(plan.id),
        'package integration case identity',
      );
      return createPatchMapPackageIntegrationRuntime();
    },
    actionTimeoutMs: 120_000,
  });
}

function createPerformanceDescriptor(
  needsSupplementalWebGLLease: boolean,
): PatchMapExecutableRuntimeDescriptor {
  return createPatchMapProductRuntimeDescriptor({
    key: 'performance',
    needsSupplementalWebGLLease,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.performance
        .createPerformanceHandlerEntries,
    handlerLabel: 'performance handlers',
    fold: PATCH_MAP_FOLD_MODULES.performance.foldPerformanceExecution,
    foldLabel: 'performance fold',
    createRuntime(plan) {
      invariant(isPerformanceCaseId(plan.id), 'performance case identity');
      return createPatchMapPerformanceRuntime(plan.id);
    },
    actionTimeoutMs: 180_000,
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });
}
