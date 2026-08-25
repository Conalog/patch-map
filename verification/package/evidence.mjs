export function collectPackagePublicationFailures(packageArtifact) {
  const failures = [];
  if (
    packageArtifact.missingDocs.length !== 0
    || packageArtifact.missingExamples.length !== 0
  ) failures.push('packed artifact is missing public PatchMap docs or examples');
  if (packageArtifact.unexpectedDocs.length !== 0) {
    failures.push('packed artifact contains unexpected public documentation');
  }
  return failures;
}

export function collectPackageFailures({
  cjs,
  errors,
  esm,
  examples,
  packageArtifact,
  productionAliasProbe,
  productionBuild,
  supplyChain,
  types,
}) {
  const failures = [];
  if (!esm.immutable || esm.barTargetCount !== 1) {
    failures.push('packed ESM public data/query boundary failed');
  }
  if (
    esm.presentationChanged !== true
    || esm.presentationCleared !== true
    || esm.updateStatus !== 'committed'
    || esm.updatedBarHeight !== 64
    || JSON.stringify(esm.selection) !== JSON.stringify(['consumer-item'])
    || esm.transformStatus !== 'committed'
    || esm.undoStatus !== 'committed'
    || esm.redoStatus !== 'committed'
    || esm.transactionStatus !== 'committed'
  ) failures.push('packed ESM public workflow failed');
  if (esm.serializedRootCount !== 2 || esm.serializedAddedId !== 'packed-added') {
    failures.push('packed ESM persistence boundary failed');
  }
  if (
    !String(esm.capturePrefix).startsWith('data:image/png')
    || !(esm.captureLength > 100)
  ) failures.push('packed ESM capture failed');
  if (esm.backend !== 'webgl' || !(esm.renderObjects > 0)) {
    failures.push('packed ESM rendered no WebGL content');
  }
  if (
    esm.internalExportsAbsent !== true
    || esm.constructorRejected !== true
    || esm.destroyResult !== true
    || esm.destroyed !== true
    || esm.canvasCountAfterDestroy !== 0
  ) failures.push('packed ESM public surface or lifecycle failed');
  if (
    cjs.mountType !== 'function'
    || cjs.internalExportsAbsent !== true
    || cjs.constructorRejected !== true
  ) failures.push('packed CJS public surface failed');

  if (
    packageArtifact.sourceMapCount !== 0
    || packageArtifact.restrictedEvidenceCount !== 0
  ) failures.push('packed artifact contains source maps or restricted evidence');
  if (!supplyChain.reproducible) {
    failures.push('packed artifact is not reproducible across two release builds');
  }
  if (supplyChain.packageInspection.prohibitedEntryCount !== 0) {
    failures.push('packed artifact contains prohibited supply-chain entries');
  }
  if (
    supplyChain.audit.knownVulnerabilityCount !== null
    && supplyChain.audit.knownVulnerabilityCount !== 0
  ) failures.push('packed dependency audit found known vulnerabilities');
  if (supplyChain.licenses.unapprovedLicenseCount !== 0) {
    failures.push('packed dependency inventory contains unapproved licenses');
  }
  failures.push(...collectPackagePublicationFailures(packageArtifact));
  if (types.strict !== true || types.exitCode !== 0) {
    failures.push('packed strict TypeScript consumer failed');
  }
  if (
    productionBuild.productionBundler !== 'vite'
    || productionBuild.sourceMap !== false
    || productionAliasProbe.packageImportResolutionCount === 0
    || productionAliasProbe.sourceImportResolutionCount !== 0
  ) failures.push('packed production build did not use the tarball product');
  if (
    JSON.stringify(examples.compiledExamples)
      !== JSON.stringify(['minimal', 'dashboard', 'editor', 'report'])
    || JSON.stringify(examples.executedExamples)
      !== JSON.stringify(['minimal', 'dashboard', 'editor', 'report'])
    || examples.results?.some((result) => result.status !== 'pass')
    || examples.remainingCanvasCount !== 0
  ) failures.push('packed public PatchMap examples failed');
  if (errors.console.length || errors.page.length || errors.network.length) {
    failures.push('packed browser consumer emitted errors');
  }
  return failures;
}

export function createPackageConsumerEvidence({
  browserAliasProbe,
  browserVersion,
  cjs,
  codeCommit,
  errors,
  esm,
  examples,
  failures,
  generatedAt,
  packageArtifact,
  productionAliasProbe,
  productionBuild,
  supplyChain,
  types,
}) {
  return {
    schemaVersion: 4,
    generatedAt,
    package: '@conalog/patch-map',
    pixi: '8.19.0',
    provenance: {
      codeCommit,
      packedPackageSha256: packageArtifact.sha256,
    },
    environment: {
      browserVersion,
      strictTypeScript: true,
      offlineInstall: true,
      installMode: 'npm-offline-cache',
      productionBundler: productionBuild.productionBundler,
    },
    artifact: packageArtifact,
    supplyChain,
    types,
    productionBuild,
    packageBoundary: {
      production: productionAliasProbe,
      browser: browserAliasProbe,
    },
    examples,
    esm,
    cjs,
    errors,
    status: failures.length > 0
      ? 'fail'
      : supplyChain.status === 'pass'
        ? 'pass'
        : 'pending-external-audit',
    failures,
  };
}
