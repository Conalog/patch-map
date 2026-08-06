export function collectPackageFailures({
  cjs,
  errors,
  esm,
  examples,
  hostAdapterAudit,
  journeyBrowser,
  journeyMatrix,
  packageArtifact,
  packageMatrix,
  productionAliasProbe,
  productionBuild,
  supplyChain,
  types,
}) {
  const failures = [];
  if (!esm.immutable) failures.push('packed ESM consumer mutated direct input');
  if (esm.rootCount !== 2 || esm.barTargetCount !== 1) {
    failures.push('packed ESM public data/query boundary failed');
  }
  if (
    esm.updateStatus !== 'committed' ||
    esm.updatedBarHeight !== 64 ||
    JSON.stringify(esm.selection) !== JSON.stringify(['consumer-item']) ||
    esm.transformStatus !== 'committed' ||
    esm.undoStatus !== 'committed' ||
    esm.redoStatus !== 'committed' ||
    esm.transactionStatus !== 'committed'
  ) failures.push('packed ESM public mutation/selection/history boundary failed');
  if (
    esm.serializedMatches !== true ||
    esm.roundtripSemanticHashEqual !== true ||
    esm.legacySourceKind !== 'legacy-generic-item'
  ) failures.push('packed ESM persistence compatibility boundary failed');
  if (
    esm.strictFailure?.code !== 'MISSING_TARGET' ||
    esm.strictFailure?.category !== 'MISSING_TARGET' ||
    esm.strictFailure?.path !== '$[2].links[0].target' ||
    esm.rejectedReplaceAtomic !== true
  ) failures.push('packed ESM strict replacement was not atomic');
  if (!String(esm.capturePrefix).startsWith('data:image/png')) {
    failures.push('packed ESM capture is not PNG data');
  }
  if (!(esm.captureLength > 100)) failures.push('packed ESM capture is unexpectedly empty');
  if (
    esm.directImage?.initialState !== 'resolved' ||
    !(esm.directImage?.initialCaptureLength > 100) ||
    esm.directImage?.replacementRootId !== 'replacement-direct-image' ||
    !(esm.directImage?.replacementSceneRevision > 1) ||
    esm.directImage?.replacementState !== 'resolved' ||
    !(esm.directImage?.replacementCaptureLength > 100) ||
    esm.directImage?.firstDestroy !== true ||
    esm.directImage?.firstCleanupResourceCount !== 0 ||
    esm.directImage?.remountState !== 'resolved' ||
    !(esm.directImage?.remountCaptureLength > 100) ||
    esm.directImage?.remountDestroy !== true ||
    esm.directImage?.finalResourceCount !== 0 ||
    esm.directImage?.canvasCountAfterDestroy !== 0
  ) failures.push('packed direct-image replace/capture/remount lifecycle failed');
  if (
    !(esm.theme?.defaultCapture?.canonicalDefault > 8_000) ||
    esm.theme?.defaultCapture?.legacyPurple !== 0 ||
    !(esm.theme?.customCapture?.custom > 8_000) ||
    !(esm.theme?.isolatedDefaultCapture?.canonicalDefault > 8_000) ||
    esm.theme?.isolatedDefaultCapture?.custom !== 0 ||
    esm.theme?.themeImmutable !== true ||
    esm.theme?.defaultDestroy !== true ||
    esm.theme?.customDestroy !== true ||
    esm.theme?.canvasCountAfterDestroy !== 0
  ) failures.push('packed default/custom theme capture or instance lifecycle failed');
  const builtinAliases = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
  const builtinSignaturesExpected = {
    object: '00111100/11101111/11100111/11111101/10011001/11011011/11111111/00111100',
    inverter: '11111111/10000001/11111111/10000001/10000001/10000001/10000001/11111111',
    combiner: '11011011/11011011/11111111/11111111/11011011/11111111/11011011/11011011',
    device: '11111110/11111110/10001101/10000111/10001111/10000111/11111110/11111110',
    edge: '00011111/00011111/00001110/00000100/11111111/11111111/11111101/11111111',
    loading: '01111100/11100011/10011011/10011001/10011101/11001111/11100110/01111100',
    warning: '01111110/11000111/10000001/11000011/01100101/01100111/00111111/00011111',
    wifi: '01111110/11111111/11011011/01111110/01111110/00011000/00011000/00011000',
  };
  const builtinOverlaySignaturesExpected = {
    ...builtinSignaturesExpected,
    device: '11111110/11111110/10001101/10001111/10001111/10000111/11111110/11111110',
    loading: '01111100/11100011/11011011/10011001/10011101/11001111/11100110/01111100',
    warning: '01111110/11100111/10000011/11000011/01100000/01100111/00111111/00011111',
  };
  const builtinSignatures = new Set();
  let builtinCaptureValid = JSON.stringify(esm.builtins?.aliases) === JSON.stringify(builtinAliases);
  for (const alias of builtinAliases) {
    const authored = esm.builtins?.authored?.[alias];
    const overlay = esm.builtins?.overlay?.[alias];
    builtinCaptureValid &&=
      authored?.pixelCount > 80 &&
      authored?.occupancy < 0.58 &&
      authored?.signature === builtinSignaturesExpected[alias] &&
      overlay?.updateStatus === 'committed' &&
      overlay?.pixelCount > 80 &&
      overlay?.occupancy < 0.58 &&
      overlay?.signature === builtinOverlaySignaturesExpected[alias] &&
      esm.builtins?.authoredResolved?.[alias] === true &&
      esm.builtins?.overlayResolved?.[alias] === true;
    builtinSignatures.add(authored?.signature);
  }
  if (
    !builtinCaptureValid ||
    builtinSignatures.size !== builtinAliases.length ||
    esm.builtins?.hidden?.pixelCount !== 0 ||
    esm.builtins?.runtimeBeforeDestroy?.resourceCount !== 7 ||
    esm.builtins?.runtimeBeforeDestroy?.pendingCount !== 0 ||
    esm.builtins?.runtimeBeforeDestroy?.leaseCount !== 7 ||
    esm.builtins?.runtimeAfterDestroy?.resourceCount !== 0 ||
    esm.builtins?.runtimeAfterDestroy?.leaseCount !== 0 ||
    JSON.stringify(esm.builtins?.injectedAliases) !== JSON.stringify([
      'cloudAlert',
      'inverterFrame',
      'ess',
      'stick',
      'wiringPrimary',
      'wiringSecondary',
      'wiringTertiary',
    ]) ||
    !(esm.builtins?.injectedCapture?.pixelCount > 80) ||
    esm.builtins?.injectedResolved !== true ||
    esm.builtins?.destroy !== true ||
    esm.builtins?.canvasCountAfterDestroy !== 0
  ) failures.push('packed builtin authored/overlay glyph or asset lifecycle failed');
  const pointer = esm.pointerInteraction;
  const pointerHoverTypes = new Set(pointer?.firstHover?.map(({ type }) => type));
  const concreteHoverObserved = pointer?.firstHover?.some(({ target }) =>
    target?.id === 'pointer-grid.0.0' && target?.componentId === 'status');
  const postViewportHoverObserved = pointer?.firstHover?.some(({ target, anchor }) =>
    target?.id === 'pointer-grid.0.0' &&
    target?.componentId === 'status' &&
    Math.abs(anchor?.[0] - 78) <= 2 &&
    Math.abs(anchor?.[1] - 66) <= 2);
  const firstSelection = pointer?.firstSelection ?? [];
  const boxSelection = firstSelection.at(-1)?.selected;
  const remountBoxSelection = pointer?.remountSelection?.at(-1)?.selected;
  if (
    pointerHoverTypes.has('hover') !== true ||
    pointerHoverTypes.has('move') !== true ||
    pointerHoverTypes.has('leave') !== true ||
    concreteHoverObserved !== true ||
    postViewportHoverObserved !== true ||
    JSON.stringify(firstSelection[0]?.selected) !== JSON.stringify([
      { id: 'pointer-grid.0.0', componentId: 'status' },
    ]) ||
    JSON.stringify(boxSelection) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
      { id: 'pointer-grid.0.1' },
    ]) ||
    JSON.stringify(remountBoxSelection) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
    ]) ||
    JSON.stringify(pointer?.firstViewportBefore) !== JSON.stringify(pointer?.boxViewport) ||
    JSON.stringify(pointer?.firstViewportBefore) === JSON.stringify(pointer?.firstViewportAfter) ||
    pointer?.captureDuring !== true ||
    pointer?.captureAfter !== false ||
    pointer?.firstSubscriptionCount !== 2 ||
    pointer?.remountSubscriptionCount !== 2 ||
    pointer?.firstDestroy !== true ||
    pointer?.remountDestroy !== true ||
    pointer?.firstCanvasCountAfterDestroy !== 0 ||
    pointer?.canvasCountAfterDestroy !== 0 ||
    pointer?.datasetImmutable !== true ||
    !pointer?.selectableTargets?.some(({ id }) => id === 'pointer-grid.0.2')
  ) failures.push('packed pointer hover/selection/box/capture/remount lifecycle failed');
  if (esm.backend !== 'webgl') failures.push('packed ESM did not use WebGL');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.assetRuntimeCount !== 0) failures.push('packed ESM asset status was inconsistent');
  if (
    esm.internalExportsAbsent !== true ||
    esm.constructorRejected !== true ||
    esm.instanceInternalsAbsent !== true
  ) failures.push('packed ESM exposed internal runtime symbols');
  if (
    esm.destroyResult !== true ||
    esm.destroyed !== true ||
    esm.canvasCountAfterDestroy !== 0
  ) failures.push('packed ESM lifecycle leaked a canvas or live runtime');
  if (
    cjs.mountType !== 'function' ||
    cjs.compatibilityType !== 'function' ||
    cjs.persistenceType !== 'function' ||
    cjs.rootKind !== 'array' ||
    cjs.id !== 'cjs-rect' ||
    cjs.internalExportsAbsent !== true ||
    cjs.constructorRejected !== true
  ) failures.push('packed CJS public surface failed');

  if (
    packageArtifact.sourceMapCount !== 0 ||
    packageArtifact.restrictedEvidenceCount !== 0
  ) failures.push('packed artifact contains source maps or restricted evidence');
  if (!supplyChain.reproducible) {
    failures.push('packed artifact is not reproducible across two release builds');
  }
  if (supplyChain.packageInspection.prohibitedEntryCount !== 0) {
    failures.push('packed artifact contains prohibited supply-chain entries');
  }
  if (
    supplyChain.audit.knownVulnerabilityCount !== null &&
    supplyChain.audit.knownVulnerabilityCount !== 0
  ) failures.push('packed dependency audit found known vulnerabilities');
  if (supplyChain.licenses.unapprovedLicenseCount !== 0) {
    failures.push('packed dependency inventory contains unapproved licenses');
  }
  if (supplyChain.sbom.packageDigest !== packageArtifact.sha256) {
    failures.push('packed SBOM is not bound to the package digest');
  }
  if (
    packageArtifact.missingDocs.length !== 0 ||
    packageArtifact.missingExamples.length !== 0
  ) failures.push('packed artifact is missing public PatchMap docs or examples');
  if (types.strict !== true || types.exitCode !== 0) {
    failures.push('packed strict TypeScript consumer failed');
  }
  if (
    productionBuild.productionBundler !== 'vite' ||
    productionBuild.sourceMap !== false ||
    productionAliasProbe.sourceImportResolutionCount === 0
  ) failures.push('packed production host harness did not bind imports to the tarball');
  if (
    JSON.stringify(examples.compiledExamples) !==
      JSON.stringify(['minimal', 'dashboard', 'editor', 'report']) ||
    JSON.stringify(examples.executedExamples) !==
      JSON.stringify(['minimal', 'dashboard', 'editor', 'report']) ||
    examples.results?.some((result) => result.status !== 'pass') ||
    examples.remainingCanvasCount !== 0
  ) failures.push('packed public PatchMap examples failed compile/run cleanup');
  if (
    packageMatrix.failure !== null ||
    packageMatrix.remainingCanvasCount !== 0
  ) failures.push(`packed adapter/multi-instance matrix failed: ${JSON.stringify(packageMatrix.failure)}`);
  if (
    JSON.stringify(packageMatrix.hostAdapter?.reachedCapabilities) !==
      JSON.stringify([
        'load',
        'lookup',
        'bulk-update',
        'selection',
        'transform',
        'history',
        'dispose',
        'snapshot',
        'extract',
        'destroy',
      ]) ||
    hostAdapterAudit.originalImportCount !== 0 ||
    hostAdapterAudit.restrictedImportCount !== 0 ||
    hostAdapterAudit.adapterReimplementedEngineBehaviorCount !== 0 ||
    packageMatrix.hostAdapter?.invalidNodeCount !== 0 ||
    packageMatrix.hostAdapter?.staleGestureCount !== 0 ||
    packageMatrix.hostAdapter?.corruptEntryCount !== 0 ||
    packageMatrix.hostAdapter?.leakDelta !== 0
  ) failures.push('packed host adapter capability/audit proof failed');
  if (
    packageMatrix.multipleInstances?.B?.semanticHash !==
      packageMatrix.multipleInstances?.baselineB?.sceneSemanticHash ||
    packageMatrix.multipleInstances?.B?.callbackCountFromA !== 0 ||
    packageMatrix.multipleInstances?.B?.assetLeaseCount !==
      packageMatrix.multipleInstances?.baselineB?.assetLeaseCount ||
    packageMatrix.multipleInstances?.B?.sharedLeaseCount !== 1 ||
    packageMatrix.multipleInstances?.sharedLeaseCountAfterRecreate !== 2 ||
    packageMatrix.multipleInstances?.hostSlots?.A?.canvasCount !== 1 ||
    packageMatrix.multipleInstances?.hostSlots?.B?.canvasCount !== 1 ||
    packageMatrix.multipleInstances?.unclassifiedErrorCount !== 0
  ) failures.push('packed multiple-instance isolation or shared asset lease proof failed');
  if (
    journeyBrowser.remainingCanvasCount !== 0 ||
    journeyMatrix.journeyCount !== 38 ||
    journeyMatrix.passedJourneyCount !== 38 ||
    journeyMatrix.failedJourneyCount !== 0 ||
    journeyMatrix.packageDigestAcrossJourneys !== packageArtifact.sha256 ||
    journeyMatrix.cleanupFailureCount !== 0
  ) failures.push('packed 38-journey production host matrix failed');
  if (errors.console.length || errors.page.length || errors.network.length) {
    failures.push('packed browser consumer emitted errors');
  }
  return failures;
}

function stringDistance(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function createPackageConsumerEvidence({
  browserAliasProbe,
  browserVersion,
  cjs,
  codeCommit,
  dependencyAudit,
  errors,
  esm,
  examples,
  failures,
  generatedAt,
  hostAdapterAudit,
  journeyMatrix,
  licenseInventory,
  packageArtifact,
  packageMatrix,
  productionAliasProbe,
  productionBuild,
  supplyChain,
  types,
}) {
  return {
    schemaVersion: 2,
    generatedAt,
    package: '@conalog/patch-map',
    pixi: '8.19.0',
    provenance: {
      codeCommit,
      packedPackageSha256: packageArtifact.sha256,
      expectedEvidenceBound: true,
    },
    environment: {
      browserVersion,
      contractProfileBound: true,
      strictTypeScript: true,
      offlineInstall: true,
      installMode: 'npm-offline-cache',
      productionBundler: productionBuild.productionBundler,
    },
    artifact: packageArtifact,
    supplyChain,
    dependencyAudit,
    licenseInventory,
    types,
    productionBuild,
    packageBoundary: {
      production: productionAliasProbe,
      browser: browserAliasProbe,
    },
    hostAdapterAudit,
    examples,
    packageMatrix,
    journeyMatrix,
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
