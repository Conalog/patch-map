import packageConsumerResultJson from '../../contracts/evidence/qualification/package-consumer.json';
import { deepFreezePatchMapLabValue as deepFreeze } from './runtime-values';
import { retainedPatchMapPackageEvidence } from './package-evidence';

export const PATCH_MAP_PACKAGE_INTEGRATION_RUNTIME_REVISION =
  'patch-map-package-integration-runtime/1' as const;

export const PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS = Object.freeze([
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
] as const);

export type PatchMapPackageIntegrationCaseId =
  (typeof PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS)[number];

export interface PatchMapPackageIntegrationProductAdapter {
  readPackedConsumerEvidence(): Readonly<Record<string, unknown>>;
}

export interface PatchMapPackageIntegrationRuntime {
  readonly product: PatchMapPackageIntegrationProductAdapter;
}

/**
 * Browser-safe transport for the committed packed-consumer proof. The proof is
 * actual-only output from the independently installed package verifier; this
 * runtime deliberately has no normalized expected or comparator dependency.
 */
export function createPatchMapPackageIntegrationRuntime(): PatchMapPackageIntegrationRuntime {
  const committed = retainedPatchMapPackageEvidence(
    packageConsumerResultJson as Readonly<Record<string, unknown>>,
  );
  return Object.freeze({
    product: Object.freeze({
      readPackedConsumerEvidence(): Readonly<Record<string, unknown>> {
        return deepFreeze(structuredClone(committed));
      },
    }),
  });
}
