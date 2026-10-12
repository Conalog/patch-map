import { dependencyClosure, packageNameFromLockPath } from '../../../../verification/dependencies/closure.mjs';

export const NPM_ARTIFACT_AUDIT_ARGS = Object.freeze([
  'audit', '--package-lock-only', '--workspace=packages/javascript',
  '--include-workspace-root=false', '--json', '--audit-level=low',
]);

export function createDependencyLicenseInventory(lock, packagePath = '') {
  const approvedLicenses = Object.freeze([
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'BlueOak-1.0.0',
    'ISC',
    'MIT',
    'Python-2.0',
  ]);
  const approved = new Set(approvedLicenses);
  const { packages: records, directPaths } = dependencyClosure(lock, packagePath);
  const packages = [...records].map(([lockPath, record]) => Object.freeze({
    name: packageNameFromLockPath(lockPath),
    version: typeof record.version === 'string' ? record.version : 'unknown',
    license: typeof record.license === 'string' ? record.license : 'UNKNOWN',
    direct: directPaths.has(lockPath),
  })).sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  const unapproved = packages.filter(({ license }) => !approved.has(license));
  const licenseCounts = {};
  for (const { license } of packages) {
    licenseCounts[license] = (licenseCounts[license] ?? 0) + 1;
  }
  return Object.freeze({
    approvedLicenses,
    packageCount: packages.length,
    unapprovedLicenseCount: unapproved.length,
    unapproved: Object.freeze(unapproved),
    licenseCounts: Object.freeze(licenseCounts),
    packages: Object.freeze(packages),
  });
}
export function createSupplyChainEvidence({
  codeCommit,
  first,
  second,
  dependencyAudit,
  licenseInventory,
}) {
  const builds = Object.freeze([first, second].map((artifact, index) => Object.freeze({
    index,
    sha256: artifact.sha256,
    filename: artifact.filename,
    size: artifact.size,
    unpackedSize: artifact.unpackedSize,
    fileCount: artifact.fileCount,
  })));
  const reproducible =
    first.sha256 === second.sha256
    && first.size === second.size
    && first.unpackedSize === second.unpackedSize
    && first.fileCount === second.fileCount;
  const packageInspection = Object.freeze({
    prohibitedEntryCount: first.prohibitedEntryCount,
    prohibitedEntries: first.prohibitedEntries,
    sourceMapCount: first.sourceMapCount,
    restrictedEvidenceCount: first.restrictedEvidenceCount,
  });
  const audit = Object.freeze({
    status: dependencyAudit.status,
    auditLevel: dependencyAudit.auditLevel,
    knownVulnerabilityCount: dependencyAudit.knownVulnerabilityCount,
    severityCounts: dependencyAudit.severityCounts,
  });
  const licenses = Object.freeze({
    approvedLicenses: licenseInventory.approvedLicenses,
    packageCount: licenseInventory.packageCount,
    unapprovedLicenseCount: licenseInventory.unapprovedLicenseCount,
    licenseCounts: licenseInventory.licenseCounts,
  });
  const sbom = Object.freeze({
    format: 'patch-map-spdx-lite/1',
    packageDigest: first.sha256,
    packageCount: licenseInventory.packageCount,
    packages: licenseInventory.packages,
  });
  return Object.freeze({
    schemaVersion: 1,
    sourceRevision: codeCommit,
    builds,
    reproducible,
    packageInspection,
    audit,
    licenses,
    sbom,
    status: (
      reproducible
      && packageInspection.prohibitedEntryCount === 0
      && (audit.knownVulnerabilityCount === 0 || audit.knownVulnerabilityCount === null)
      && licenses.unapprovedLicenseCount === 0
      && sbom.packageDigest === first.sha256
    )
      ? audit.knownVulnerabilityCount === null
        ? 'pending-external-audit'
        : 'pass'
      : 'fail',
  });
}

export function nonNegativeAuditCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`npm audit count must be a non-negative safe integer, received ${String(value)}`);
  }
  return value;
}
