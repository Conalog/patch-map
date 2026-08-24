import { deepFreezePatchMapLabValue as deepFreeze } from './runtime-values';

const SHIPPING_PACKAGE_NAME = '@conalog/patch-map';

/**
 * Embedded package evidence is a retained observation, never proof for the
 * currently open source candidate. Keep its recorded result intact while
 * making promotion ineligibility explicit to Lab operators and folds.
 */
export function retainedPatchMapPackageEvidence(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const snapshot = structuredClone(input) as Record<string, unknown>;
  const provenance = isRecord(snapshot.provenance)
    ? snapshot.provenance
    : {};
  const evidencePackageName = typeof snapshot.package === 'string'
    ? snapshot.package
    : null;
  snapshot.provenance = {
    ...provenance,
    promotionEligible: false,
    evidenceClassification: 'retained-historical-package-proof',
    shippingPackageName: SHIPPING_PACKAGE_NAME,
    evidencePackageName,
    packageIdentityMatchesShipping: evidencePackageName === SHIPPING_PACKAGE_NAME,
  };
  return deepFreeze(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
