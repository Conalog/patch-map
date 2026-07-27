import packageConsumerResultJson from '../../../performance/core-v2/results/package-consumer.json';

export const CORE_V2_PACKAGE_INTEGRATION_RUNTIME_REVISION =
  'core-v2-package-integration-runtime/1' as const;

export const CORE_V2_PACKAGE_INTEGRATION_CASE_IDS = Object.freeze([
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
] as const);

export type CoreV2PackageIntegrationCaseId =
  (typeof CORE_V2_PACKAGE_INTEGRATION_CASE_IDS)[number];

export interface CoreV2PackageIntegrationProductAdapter {
  readPackedConsumerEvidence(): Readonly<Record<string, unknown>>;
}

export interface CoreV2PackageIntegrationRuntime {
  readonly product: CoreV2PackageIntegrationProductAdapter;
}

/**
 * Browser-safe transport for the committed packed-consumer proof. The proof is
 * actual-only output from the independently installed package verifier; this
 * runtime deliberately has no normalized expected or comparator dependency.
 */
export function createCoreV2PackageIntegrationRuntime(): CoreV2PackageIntegrationRuntime {
  const committed = deepFreeze(
    structuredClone(packageConsumerResultJson) as Readonly<Record<string, unknown>>,
  );
  return Object.freeze({
    product: Object.freeze({
      readPackedConsumerEvidence(): Readonly<Record<string, unknown>> {
        return deepFreeze(structuredClone(committed));
      },
    }),
  });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
