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
    esm.presentationSet?.changed !== true ||
    esm.presentationSet?.scopeCount !== 1 ||
    esm.presentationSet?.unmatchedCount !== 1 ||
    esm.presentationSnapshot?.layerCount !== 1 ||
    esm.presentationCaptureChanged !== true ||
    esm.presentationClear !== true ||
    esm.presentationClearSnapshot?.layerCount !== 0 ||
    esm.presentationDataStable !== true
  ) failures.push('packed ESM keyed presentation/capture boundary failed');
  if (
    esm.presentationReplaceLifecycle?.failedReplaceRejected !== true ||
    esm.presentationReplaceLifecycle?.failedReplacePreserved !== true ||
    esm.presentationReplaceLifecycle?.sameCapacityCleared?.layerCount !== 0 ||
    esm.presentationReplaceLifecycle?.sameCapacitySet?.scopeCount !== 2 ||
    esm.presentationReplaceLifecycle?.sameCapacityCaptureChanged !== true ||
    esm.presentationReplaceLifecycle?.differentCapacityCleared?.layerCount !== 0 ||
    esm.presentationReplaceLifecycle?.differentCapacitySet?.scopeCount !== 3 ||
    !String(esm.presentationReplaceLifecycle?.differentCapacityCapturePrefix)
      .startsWith('data:image/png') ||
    esm.presentationReplaceLifecycle?.asyncCleared?.layerCount !== 0 ||
    esm.presentationReplaceLifecycle?.asyncSet?.scopeCount !== 1 ||
    !String(esm.presentationReplaceLifecycle?.asyncCapturePrefix)
      .startsWith('data:image/png') ||
    esm.presentationReplaceLifecycle?.callerInputsImmutable !== true ||
    esm.presentationReplaceLifecycle?.firstDestroy !== true ||
    esm.presentationReplaceLifecycle?.secondDestroy !== false ||
    esm.presentationReplaceLifecycle?.canvasCountAfterDestroy !== 0
  ) failures.push('packed presentation replace/reapply lifecycle failed');
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
    esm.directImage?.firstCleanupResourceCount !==
      esm.directImage?.resourceCountBeforeMount ||
    esm.directImage?.firstCleanupInitialResource?.state !== 'absent' ||
    esm.directImage?.firstCleanupInitialResource?.resourceCount !== 0 ||
    esm.directImage?.remountState !== 'resolved' ||
    !(esm.directImage?.remountCaptureLength > 100) ||
    esm.directImage?.remountDestroy !== true ||
    esm.directImage?.finalResourceCount !==
      esm.directImage?.resourceCountBeforeMount ||
    esm.directImage?.finalReplacementResource?.state !== 'absent' ||
    esm.directImage?.finalReplacementResource?.resourceCount !== 0 ||
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
  const builtinSignatures = new Set();
  const builtinOverlaySignatures = new Set();
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
      esm.builtins?.authoredResolved?.[alias] === true &&
      esm.builtins?.overlayResolved?.[alias] === true;
    builtinSignatures.add(authored?.signature);
    builtinOverlaySignatures.add(overlay?.signature);
  }
  if (
    !builtinCaptureValid ||
    builtinSignatures.size !== builtinAliases.length ||
    builtinOverlaySignatures.size !== builtinAliases.length ||
    esm.builtins?.hidden?.pixelCount !== 0 ||
    esm.builtins?.runtimeBeforeDestroy?.resourceCount !==
      esm.builtins?.runtimeBeforeMount?.resourceCount + 1 ||
    esm.builtins?.runtimeBeforeDestroy?.pendingCount !== 0 ||
    esm.builtins?.runtimeBeforeDestroy?.leaseCount !==
      esm.builtins?.runtimeBeforeMount?.leaseCount + 6 ||
    esm.builtins?.runtimeAfterDestroy?.resourceCount !==
      esm.builtins?.runtimeBeforeMount?.resourceCount ||
    esm.builtins?.runtimeAfterDestroy?.leaseCount !==
      esm.builtins?.runtimeBeforeMount?.leaseCount ||
    esm.builtins?.inverter24?.bounds?.width !== 18 ||
    esm.builtins?.inverter24?.bounds?.height !== 18 ||
    esm.builtins?.inverter24?.signature !==
      '11111111/10000001/11111111/10000001/10000001/10000001/10000001/11111111' ||
    esm.builtins?.inverter24Resolved !== true ||
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
    esm.builtins?.injectedCapture?.bounds?.width !== 20 ||
    esm.builtins?.injectedCapture?.bounds?.height !== 20 ||
    esm.builtins?.injectedResolved !== true ||
    esm.builtins?.destroy !== true ||
    esm.builtins?.canvasCountAfterDestroy !== 0
  ) failures.push('packed builtin authored/overlay glyph or asset lifecycle failed');
  const pointer = esm.pointerInteraction;
  const pointerHoverTypes = new Set(pointer?.firstHover?.map(({ type }) => type));
  const concreteHoverObserved = pointer?.firstHover?.some(({ target }) =>
    target?.id === 'pointer-grid.0.0' && target?.componentId === 'status');
  const postViewportHoverObserved = pointer?.firstHover
    ?.slice(pointer?.postViewportHoverStart ?? Number.POSITIVE_INFINITY)
    .some(({ target }) =>
    target?.id === 'pointer-grid.0.0' &&
    target?.componentId === 'status');
  const firstSelection = pointer?.firstSelection ?? [];
  const boxSelection = firstSelection.at(-1)?.selected;
  const remountBoxSelection = pointer?.remountSelection?.at(-1)?.selected;
  const marqueeBounds = pointer?.marqueeDuringBlue?.bounds;
  const marqueeWidthCss = marqueeBounds
    ? (marqueeBounds.maxX - marqueeBounds.minX + 1) / 2
    : null;
  const marqueeHeightCss = marqueeBounds
    ? (marqueeBounds.maxY - marqueeBounds.minY + 1) / 2
    : null;
  if (
    pointerHoverTypes.has('hover') !== true ||
    pointerHoverTypes.has('move') !== true ||
    pointerHoverTypes.has('leave') !== true ||
    concreteHoverObserved !== true ||
    postViewportHoverObserved !== true ||
    JSON.stringify(firstSelection[0]?.selected) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
    ]) ||
    JSON.stringify(firstSelection[1]?.selected) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
    ]) ||
    JSON.stringify(firstSelection[2]?.selected) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
      { id: 'pointer-grid.0.1' },
    ]) ||
    JSON.stringify(firstSelection[3]?.selected) !== JSON.stringify([
      { id: 'pointer-grid.0.1' },
    ]) ||
    JSON.stringify(firstSelection[4]?.selected) !== JSON.stringify([]) ||
    firstSelection.length !== 6 ||
    JSON.stringify(boxSelection) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
      { id: 'pointer-grid.0.1' },
    ]) ||
    JSON.stringify(remountBoxSelection) !== JSON.stringify([
      { id: 'pointer-grid.0.0' },
    ]) ||
    !viewportPanMatches(pointer?.plainPanBefore, pointer?.plainPanAfter, [20, 15]) ||
    !viewportPanMatches(pointer?.lateShiftPanBefore, pointer?.lateShiftPanAfter, [20, 20]) ||
    !viewportPanMatches(pointer?.middlePanBefore, pointer?.middlePanAfter, [10, 10]) ||
    !(pointer?.wheelAfter?.scale > pointer?.wheelBefore?.scale) ||
    JSON.stringify(pointer?.boxViewportBefore) !== JSON.stringify(pointer?.boxViewportAfter) ||
    pointer?.targetDoubleSelectionCount !== 4 ||
    pointer?.blankSingleSelectionCount !== 4 ||
    pointer?.blankDoubleSelectionCount !== 5 ||
    JSON.stringify(pointer?.targetDoubleSelectionIds) !== JSON.stringify([
      'pointer-grid.0.1',
    ]) ||
    JSON.stringify(pointer?.blankSingleSelectionIds) !== JSON.stringify([
      'pointer-grid.0.1',
    ]) ||
    JSON.stringify(pointer?.blankDoubleSelectionIds) !== JSON.stringify([]) ||
    pointer?.plainPanBeforeSelectionCount !== 5 ||
    pointer?.plainPanAfterSelectionCount !== 5 ||
    pointer?.lateShiftPanBeforeSelectionCount !== 5 ||
    pointer?.lateShiftPanAfterSelectionCount !== 5 ||
    pointer?.wheelBeforeSelectionCount !== 5 ||
    pointer?.wheelAfterSelectionCount !== 5 ||
    pointer?.middlePanBeforeSelectionCount !== 5 ||
    pointer?.middlePanAfterSelectionCount !== 5 ||
    pointer?.boxViewportBeforeSelectionCount !== 5 ||
    pointer?.boxViewportAfterSelectionCount !== 6 ||
    pointer?.captureDuring !== true ||
    pointer?.captureAfter !== false ||
    pointer?.remountCaptureDuring !== true ||
    pointer?.remountCaptureAfter !== false ||
    pointer?.firstSubscriptionCount !== 2 ||
    pointer?.remountSubscriptionCount !== 2 ||
    pointer?.firstDestroy !== true ||
    pointer?.remountDestroy !== true ||
    pointer?.firstCanvasCountAfterDestroy !== 0 ||
    pointer?.canvasCountAfterDestroy !== 0 ||
    pointer?.baselineRed?.pixelCount !== 0 ||
    pointer?.clearedRed?.pixelCount !== 0 ||
    JSON.stringify(pointer?.exactCellPointSelectionIds) !== JSON.stringify([
      'selectable-grid.0.0',
    ]) ||
    JSON.stringify(pointer?.exactSelectionChanges?.[0]?.selected) !== JSON.stringify([
      { id: 'selectable-grid.0.0' },
    ]) ||
    JSON.stringify(pointer?.exactSelectableTargets?.[0]) !== JSON.stringify({
      id: 'selectable-grid.0.0',
    }) ||
    pointer?.exactSelectionChanges?.length !== 1 ||
    !(pointer?.exactCellPointRed?.pixelCount > 200) ||
    pointer?.exactCellPointDestroy !== true ||
    pointer?.exactCellPointCanvasCountAfterDestroy !== 0 ||
    JSON.stringify(pointer?.concreteBarClickSelectionIds) !== JSON.stringify([
      'pointer-grid.0.0',
    ]) ||
    !(pointer?.concreteBarClickRed?.pixelCount > 200) ||
    !(pointer?.programmaticRed?.pixelCount > 0) ||
    !(pointer?.clickRed?.pixelCount > 0) ||
    !(pointer?.multiRed?.bounds?.width > pointer?.programmaticRed?.bounds?.width * 1.7) ||
    !(pointer?.programmaticRed?.pixelCount >= 1400) ||
    !(pointer?.programmaticRed?.pixelCount <= 3000) ||
    !(pointer?.marqueeDuringBlue?.pixelCount > 0) ||
    !(pointer?.marqueeDuringRed?.pixelCount > 0) ||
    !marqueeBounds ||
    !(Math.abs(marqueeBounds.minX / 2 - 5) <= 5) ||
    !(Math.abs(marqueeBounds.minY / 2 - 5) <= 5) ||
    !(Math.abs(marqueeBounds.maxX / 2 - 230) <= 5) ||
    !(Math.abs(marqueeBounds.maxY / 2 - 150) <= 5) ||
    !(Math.abs(marqueeWidthCss - 225) <= 4) ||
    !(Math.abs(marqueeHeightCss - 145) <= 4) ||
    pointer?.marqueeAfterBlue?.pixelCount !== 0 ||
    !(pointer?.marqueeAfterRed?.pixelCount > 0) ||
    pointer?.marqueeClearedRed?.pixelCount !== 0 ||
    !(pointer?.remountMarqueeDuringRed?.pixelCount > 0) ||
    pointer?.remountMarqueeDuringBlue?.pixelCount !== 0 ||
    !(pointer?.remountMarqueeAfterRed?.pixelCount > 0) ||
    pointer?.remountMarqueeAfterBlue?.pixelCount !== 0 ||
    pointer?.datasetImmutable !== true ||
    !pointer?.selectableTargets?.some(({ id }) => id === 'pointer-grid.0.2')
  ) failures.push('packed pointer hover/selection/box/capture/remount lifecycle failed');
  const boundsDisplay = esm.selectionBoundsDisplay;
  const elementBounds = boundsDisplay?.['element-only'];
  const groupBounds = boundsDisplay?.['group-only'];
  const allBounds = boundsDisplay?.all;
  const expectedComponentSelection = JSON.stringify([
    'bounds-grid.0.0/bar',
    'bounds-grid.0.2/bar',
  ]);
  if (
    JSON.stringify(elementBounds?.selectionIds) !== expectedComponentSelection ||
    JSON.stringify(groupBounds?.selectionIds) !== expectedComponentSelection ||
    JSON.stringify(allBounds?.selectionIds) !== expectedComponentSelection ||
    elementBounds?.multiple?.outerTopGap !== 0 ||
    !(elementBounds?.multiple?.firstInnerEdge > 0) ||
    !(elementBounds?.multiple?.secondInnerEdge > 0) ||
    elementBounds?.multiple?.gapCenter !== 0 ||
    !(groupBounds?.multiple?.outerTopGap > 0) ||
    groupBounds?.multiple?.firstInnerEdge !== 0 ||
    groupBounds?.multiple?.secondInnerEdge !== 0 ||
    groupBounds?.multiple?.gapCenter !== 0 ||
    !(allBounds?.multiple?.outerTopGap > 0) ||
    !(allBounds?.multiple?.firstInnerEdge > 0) ||
    !(allBounds?.multiple?.secondInnerEdge > 0) ||
    allBounds?.multiple?.gapCenter !== 0 ||
    allBounds?.single?.redPixelCount !== elementBounds?.single?.redPixelCount ||
    elementBounds?.renderCommandCount !== groupBounds?.renderCommandCount ||
    elementBounds?.renderCommandCount !== allBounds?.renderCommandCount ||
    elementBounds?.destroy !== true ||
    groupBounds?.destroy !== true ||
    allBounds?.destroy !== true ||
    boundsDisplay?.canvasCountAfterDestroy !== 0
  ) failures.push('packed selection bounds display raster or lifecycle failed');
  if (esm.backend !== 'webgl') failures.push('packed ESM did not use WebGL');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.assetRuntimeCount !== 5 || esm.assetSessionLeaseCount !== 5) {
    failures.push('packed ESM asset status was inconsistent');
  }
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
    packageMatrix.multipleInstances?.B?.sharedLeaseCount !== 0 ||
    packageMatrix.multipleInstances?.sharedLeaseCountAfterRecreate !== 0 ||
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

function viewportPanMatches(before, after, screenDelta) {
  if (
    !before ||
    !after ||
    !Number.isFinite(before.scale) ||
    before.scale !== after.scale ||
    !Array.isArray(before.centerWorld) ||
    !Array.isArray(after.centerWorld)
  ) {
    return false;
  }
  const epsilon = 1e-6;
  return Math.abs(after.centerWorld[0] - (before.centerWorld[0] - screenDelta[0] / before.scale)) < epsilon &&
    Math.abs(after.centerWorld[1] - (before.centerWorld[1] - screenDelta[1] / before.scale)) < epsilon;
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
