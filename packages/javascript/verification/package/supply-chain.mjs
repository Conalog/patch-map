import { posix } from 'node:path';

export function createDependencyLicenseInventory(lock, packagePath = '') {
  const rootRecord = lock.packages?.[packagePath];
  if (!rootRecord) throw new Error(`missing workspace lock record: ${packagePath}`);
  const directNames = new Set([
    ...Object.keys(rootRecord.dependencies ?? {}),
    ...Object.keys(rootRecord.devDependencies ?? {}),
    ...Object.keys(rootRecord.peerDependencies ?? {}),
  ]);
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
  // The workspace lock also contains private verification tools. Inventory
  // this package's build/runtime dependency closure, not every workspace record.
  const visited = new Set();
  const directPaths = new Set();
  const records = lock.packages;
  function locate(name, issuer, optional) {
    let directory = issuer;
    while (true) {
      const candidate = posix.join(directory, 'node_modules', name);
      if (records[candidate]) return candidate;
      if (!directory) break;
      const parent = posix.dirname(directory);
      directory = parent === '.' ? '' : parent;
    }
    if (!optional) throw new Error(`unresolved dependency ${name} from ${issuer}`);
    return undefined;
  }
  function visit(lockPath) {
    if (visited.has(lockPath)) return;
    visited.add(lockPath);
    const entry = records[lockPath];
    if (entry.link) throw new Error(`published package must not depend on a workspace link: ${lockPath}`);
    const dependencies = { ...entry.dependencies, ...entry.peerDependencies, ...entry.optionalDependencies };
    for (const name of Object.keys(dependencies)) {
      const optional = Object.hasOwn(entry.optionalDependencies ?? {}, name) || entry.peerDependenciesMeta?.[name]?.optional === true;
      const dependency = locate(name, lockPath, optional);
      if (dependency) visit(dependency);
    }
  }
  for (const name of new Set([...directNames, ...Object.keys(rootRecord.optionalDependencies ?? {})])) {
    const optional = Object.hasOwn(rootRecord.optionalDependencies ?? {}, name) || rootRecord.peerDependenciesMeta?.[name]?.optional === true;
    const dependency = locate(name, packagePath, optional);
    if (dependency) { directPaths.add(dependency); visit(dependency); }
  }
  const packages = [...visited].map((lockPath) => {
    const record = records[lockPath];
    return Object.freeze({
      name: packageNameFromLockPath(lockPath),
      version: typeof record.version === 'string' ? record.version : 'unknown',
      license: typeof record.license === 'string' ? record.license : 'UNKNOWN',
      direct: directPaths.has(lockPath),
    });
  }).sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
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

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? lockPath : lockPath.slice(index + marker.length);
}

export function nonNegativeAuditCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`npm audit count must be a non-negative safe integer, received ${String(value)}`);
  }
  return value;
}
