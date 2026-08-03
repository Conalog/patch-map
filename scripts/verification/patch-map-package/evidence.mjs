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
  if (!esm.hierarchyImmutable) failures.push('packed ESM hierarchy transaction mutated direct input');
  if (esm.parsedEntities !== esm.loadedEntities || esm.loadedEntities < 3) failures.push('packed ESM entity counts disagree');
  if (!String(esm.capturePrefix).startsWith('data:image/png')) failures.push('packed ESM capture is not PNG data');
  if (!(esm.captureLength > 100)) failures.push('packed ESM capture is unexpectedly empty');
  if (esm.backend !== 'webgl') failures.push('packed ESM did not use the selected WebGL runtime');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.canvasCountAfterDestroy !== 0 || !esm.destroyed) failures.push('packed ESM lifecycle leaked a canvas or live runtime');
  if (
    esm.frameLoopPackage?.exportType !== 'function' ||
    esm.frameLoopPackage?.factoryType !== 'function' ||
    !(esm.frameLoopPackage?.frameCount > 0) ||
    esm.frameLoopPackage?.pendingBeforeDestroy !== false ||
    esm.frameLoopPackage?.destroyedAfterEngine !== true
  ) failures.push('packed ESM frame-loop export or lifecycle ownership failed');
  if (esm.transactionRevision !== 'core-v2-mutation-transaction/1') failures.push('packed ESM transaction revision export failed');
  if (
    esm.authoringRevision !== 'core-v2-authoring/1' ||
    esm.authoringPackage?.plannerType !== 'function' ||
    esm.authoringPackage?.engineMethodType !== 'function' ||
    esm.authoringPackage?.status !== 'committed' ||
    esm.authoringPackage?.createdId !== 'packed-author-rect' ||
    esm.authoringPackage?.recordId !== 'packed-author-rect'
  ) failures.push('packed ESM authoring boundary failed');
  if (esm.commandTargetRevision !== 'core-v2-command-target/1') failures.push('packed ESM command target revision export failed');
  if (esm.editorMountRevision !== 'core-v2-editor-mount/1') failures.push('packed ESM editor mount revision export failed');
  if (esm.pointerRevision !== 'core-v2-pointer-gesture/1') failures.push('packed ESM pointer revision export failed');
  if (esm.pageLifecycleRevision !== 'core-v2-page-lifecycle/1') failures.push('packed ESM page lifecycle revision export failed');
  if (esm.hostInteractionRevision !== 'core-v2-host-interaction/1') failures.push('packed ESM host interaction revision export failed');
  if (esm.hostTooltipRevision !== 'core-v2-host-tooltip/1') failures.push('packed ESM host tooltip revision export failed');
  if (
    esm.migrationRevision !== 'core-v2-migration/1' ||
    esm.migrationPackage?.compatibilitySourceKind !== 'canonical-array' ||
    esm.migrationPackage?.legacySourceKind !== 'legacy-generic-item' ||
    esm.migrationPackage?.legacyId !== 'legacy-packed' ||
    esm.migrationPackage?.roundtripSemanticHashEqual !== true ||
    esm.migrationPackage?.exportRootKind !== 'array' ||
    esm.migrationPackage?.nonserializable?.code !== 'NON_SERIALIZABLE_VALUE' ||
    esm.migrationPackage?.nonserializable?.path !== '$[0].attrs.bad' ||
    esm.migrationPackage?.authoritativeEffectPublished !== true ||
    esm.migrationPackage?.shadowEffectPublished !== false ||
    esm.migrationPackage?.shadowEffectCount !== 0 ||
    esm.migrationPackage?.activeCanvasesPerHostSlot !== 1 ||
    JSON.stringify(esm.migrationPackage?.completedCohorts) !==
      JSON.stringify([1, 10, 50, 100]) ||
    esm.migrationPackage?.rollbackActiveBeforeRemount !== 'core-v2' ||
    esm.migrationPackage?.rollbackDesiredBeforeRemount !== 'previous' ||
    esm.migrationPackage?.rollbackActiveAfterRemount !== 'previous' ||
    esm.migrationPackage?.canaryDestroyed !== true ||
    esm.migrationPackage?.rollbackDestroyed !== true
  ) failures.push('packed ESM migration boundary failed');
  if (esm.selectionTransformerRevision !== 'core-v2-selection-transformer/1') failures.push('packed ESM selection transformer revision export failed');
  if (
    esm.strictReferenceValidation?.validatorType !== 'function' ||
    esm.strictReferenceValidation?.diagnostic?.code !== 'MISSING_TARGET' ||
    esm.strictReferenceValidation?.diagnostic?.category !== 'MISSING_TARGET' ||
    esm.strictReferenceValidation?.diagnostic?.datasetPath !==
      '$[1].links[0].target' ||
    esm.strictReferenceValidation?.sceneRevisionUnchanged !== true ||
    esm.strictReferenceValidation?.semanticHashUnchanged !== true ||
    esm.strictReferenceValidation?.datasetRefUnchanged !== true
  ) failures.push('packed ESM strict reference validation failed');
  if (
    JSON.stringify(esm.pointerPackage?.eventTypes) !== JSON.stringify(['up', 'click']) ||
    esm.pointerPackage?.clickTarget !== 'consumer-item' ||
    JSON.stringify(esm.pointerPackage?.boxTargets) !== JSON.stringify(['consumer-item']) ||
    JSON.stringify(esm.pointerPackage?.paintTargets) !== JSON.stringify(['consumer-item']) ||
    esm.pointerPackage?.destroyed !== true
  ) failures.push('packed ESM pointer/selection exports failed');
  if (
    esm.pageLifecyclePackage?.authorityType !== 'function' ||
    esm.pageLifecyclePackage?.hiddenState !== 'hidden' ||
    esm.pageLifecyclePackage?.hiddenCancelledAssetCount !== 1 ||
    esm.pageLifecyclePackage?.hiddenCancelledExtractionCount !== 1 ||
    esm.pageLifecyclePackage?.obsoleteStatus !== 'obsolete' ||
    esm.pageLifecyclePackage?.rejectedStatus !== 'rejected' ||
    esm.pageLifecyclePackage?.visibleState !== 'visible' ||
    esm.pageLifecyclePackage?.resumeFramePendingBeforePublication !== true ||
    esm.pageLifecyclePackage?.resumeFramePendingAfterPublication !== false ||
    esm.pageLifecyclePackage?.resumePublishedFrameCount !== 1
  ) failures.push('packed ESM page lifecycle boundary failed');
  if (
    esm.hostInteractionPackage?.authorityType !== 'function' ||
    JSON.stringify(esm.hostInteractionPackage?.bindingDeliveries) !==
      JSON.stringify(['consumer-item']) ||
    esm.hostInteractionPackage?.eventCount !== 1 ||
    esm.hostInteractionPackage?.hostPublicationCount !== 1 ||
    JSON.stringify(esm.hostInteractionPackage?.missingIds) !==
      JSON.stringify(['missing']) ||
    esm.hostInteractionPackage?.propagationTarget !==
      'component:consumer-item/label' ||
    JSON.stringify(esm.hostInteractionPackage?.propagationPhases) !==
      JSON.stringify([
        'capture:surface',
        'capture:consumer-item',
        'target:component:consumer-item/label',
        'bubble:consumer-item',
        'bubble:surface',
      ]) ||
    esm.hostInteractionPackage?.activeState !== 'select' ||
    esm.hostInteractionPackage?.liveResources?.bindings !== 0 ||
    esm.hostInteractionPackage?.liveResources?.subscriptions !== 0 ||
    esm.hostInteractionPackage?.liveResources?.selectionHosts !== 0 ||
    esm.hostInteractionPackage?.liveResources?.tooltipHosts !== 1 ||
    esm.hostInteractionPackage?.destroyed !== true ||
    esm.hostInteractionPackage?.destroyedOwnerCount !== 0 ||
    esm.hostInteractionPackage?.destroyedTooltipHosts !== 0
  ) failures.push('packed ESM host interaction exports failed');
  if (
    esm.editorMountPackage?.resolverType !== 'function' ||
    esm.editorMountPackage?.allowed?.status !== 'allowed' ||
    esm.editorMountPackage?.allowed?.createsEngine !== true ||
    esm.editorMountPackage?.allowed?.canvasBudget !== 1 ||
    esm.editorMountPackage?.blocked?.status !== 'blocked' ||
    esm.editorMountPackage?.blocked?.createsEngine !== false ||
    esm.editorMountPackage?.blocked?.canvasBudget !== 0
  ) failures.push('packed ESM editor mount preflight export failed');
  if (
    esm.hostTooltipPackage?.hoverTarget !== 'consumer-item' ||
    JSON.stringify(esm.hostTooltipPackage?.hoverAnchor) !== JSON.stringify([20, 30]) ||
    esm.hostTooltipPackage?.pinned !== true ||
    JSON.stringify(esm.hostTooltipPackage?.publicationReasons) !==
      JSON.stringify([
        'hover',
        'pin',
        'redraw',
        'drag',
        'drag',
        'redraw',
        'destroy',
      ]) ||
    esm.hostTooltipPackage?.finalTarget !== null ||
    JSON.stringify(esm.hostTooltipPackage?.clearTrace) !==
      JSON.stringify(['redraw', 'drag', 'drag', 'redraw', 'destroy']) ||
    esm.hostTooltipPackage?.disposeAfterDestroy !== 'disposed'
  ) failures.push(
    `packed ESM host tooltip lifecycle failed: ${JSON.stringify(esm.hostTooltipPackage)}`,
  );
  if (
    esm.commandTargetPackage?.factoryType !== 'function' ||
    JSON.stringify(esm.commandTargetPackage?.componentAliasSelection) !==
      JSON.stringify(['consumer-item/bar']) ||
    JSON.stringify(esm.commandTargetPackage?.openedTargets) !==
      JSON.stringify(['consumer-item/bar']) ||
    esm.commandTargetPackage?.releasedStatus !== 'released' ||
    JSON.stringify(esm.commandTargetPackage?.statusTrace) !==
      JSON.stringify(['pending', 'active', 'released'])
  ) failures.push('packed ESM command target and component alias exports failed');
  if (
    esm.selectionTransformerPackage?.authorityType !== 'function' ||
    JSON.stringify(esm.selectionTransformerPackage?.subsetIndicator) !==
      JSON.stringify({ selected: 1, transformable: 1, resizable: 1 }) ||
    esm.selectionTransformerPackage?.activeResizeHandles !== true ||
    esm.selectionTransformerPackage?.overlayCount !== 1 ||
    JSON.stringify(esm.selectionTransformerPackage?.visibleCorners) !==
      JSON.stringify(['nw', 'ne', 'sw', 'se']) ||
    esm.selectionTransformerPackage?.selectionRoute?.owner !== 'transformer' ||
    esm.selectionTransformerPackage?.selectionRoute?.deliveryCount !== 0 ||
    esm.selectionTransformerPackage?.transformRoute?.owner !== 'transformer' ||
    esm.selectionTransformerPackage?.transformRoute?.deliveryCount !== 1 ||
    esm.selectionTransformerPackage?.completed !== true ||
    esm.selectionTransformerPackage?.settledActiveGestureCount !== 0 ||
    esm.selectionTransformerPackage?.destroyed !== true ||
    esm.selectionTransformerPackage?.destroyedActiveGestureCount !== 0
  ) failures.push('packed ESM selection transformer exports failed');
  if (
    esm.transformerEditRevision !== 'core-v2-transformer-edit/1' ||
    esm.transformerEditPackage?.plannerType !== 'function' ||
    esm.transformerEditPackage?.snapType !== 'function' ||
    esm.transformerEditPackage?.planStatus !== 'planned' ||
    JSON.stringify(esm.transformerEditPackage?.plannedSize) !==
      JSON.stringify([50, 40]) ||
    esm.transformerEditPackage?.snapAppliedDegrees !== 0 ||
    esm.transformerEditPackage?.sessionActiveCount !== 1 ||
    esm.transformerEditPackage?.previewStatus !== 'previewed' ||
    esm.transformerEditPackage?.cancelStatus !== 'cancelled' ||
    esm.transformerEditPackage?.settledActiveCount !== 0 ||
    esm.transformerEditPackage?.settledOverlayCount !== 0 ||
    esm.transformerEditPackage?.settledCaptureCount !== 0
  ) failures.push('packed ESM transformer edit exports failed');
  if (esm.presentationRevision !== 'core-v2-presentation-policy/1') failures.push('packed ESM presentation revision export failed');
  if (esm.emptyBulkStatus !== 'unchanged' || esm.emptyBulkSceneRevision !== 1) failures.push('packed ESM empty bulk target-set semantics failed');
  if (esm.transactionStatus !== 'committed' || esm.transactionSceneRevision !== 2 || esm.transactionBarHeight !== 30) failures.push('packed ESM engine transaction failed');
  if (
    esm.presentation?.setChanged !== true ||
    esm.presentation.status !== 'active' ||
    esm.presentation.itemEmphasis !== 1 ||
    esm.presentation.clearChanged !== true ||
    esm.presentation.clearedStatus !== 'normal'
  ) failures.push('packed ESM presentation policy boundary failed');
  if (
    esm.liveOverlay?.status !== 'accepted' ||
    esm.liveOverlay.latestAcceptedRevision !== 2 ||
    esm.liveOverlay.latestPublishedRevision !== 2 ||
    esm.liveOverlay.pendingPublicationCount !== 0 ||
    esm.liveOverlay.historyUnchanged !== true
  ) failures.push('packed ESM live overlay boundary failed');
  if (
    esm.semanticRefresh?.dependencyChanged !== true ||
    esm.semanticRefresh.status !== 'committed' ||
    JSON.stringify(esm.semanticRefresh.recomputedTargets) !==
      JSON.stringify(['consumer-item/label']) ||
    esm.semanticRefresh.dataDiffCount !== 0 ||
    esm.semanticRefresh.revisionDelta !== 1 ||
    esm.semanticRefresh.representedSceneRevision !== 4
  ) failures.push('packed ESM semantic refresh boundary failed');
  if (
    esm.hierarchy?.moveStatus !== 'committed' ||
    esm.hierarchy?.groupStatus !== 'committed' ||
    esm.hierarchy?.ungroupStatus !== 'committed' ||
    esm.hierarchy?.unrecordedStatus !== 'committed' ||
    esm.hierarchy?.cycleStatus !== 'rejected' ||
    esm.hierarchy?.cycleCode !== 'CONFLICT' ||
    esm.hierarchy?.cycleRevisionDelta !== 0 ||
    esm.hierarchy?.rectParentId !== 'group-b' ||
    JSON.stringify(esm.hierarchy?.rectLocalPosition) !== JSON.stringify([-80, 40]) ||
    JSON.stringify(esm.hierarchy?.selectionIds) !== JSON.stringify(['rect-b']) ||
    esm.hierarchy?.historyDepth !== 3 ||
    esm.hierarchy?.relationRevisionLag !== 0
  ) failures.push('packed ESM hierarchy transaction contract failed');
  if (
    JSON.stringify(esm.engineExtraction?.capturedTuple) !==
      JSON.stringify(esm.engineExtraction?.requestedTuple) ||
    JSON.stringify(esm.engineExtraction?.cssSize) !== JSON.stringify([640, 360]) ||
    !Array.isArray(esm.engineExtraction?.backingSize) ||
    !esm.engineExtraction.backingSize.every((value) => Number.isFinite(value) && value > 0) ||
    esm.engineExtraction?.mime !== 'image/png' ||
    !String(esm.engineExtraction?.dataUrlPrefix).startsWith('data:image/png') ||
    !(esm.engineExtraction?.dataUrlLength > 100) ||
    esm.engineExtraction?.canvasIdentity !== 'initial-canvas' ||
    esm.engineExtraction?.sameCanvasObject !== true ||
    esm.engineExtraction?.authoritativeCanvasRetained !== true ||
    esm.engineExtraction?.temporaryImageCount !== 0 ||
    esm.engineExtraction?.renderTextureCount !== 0 ||
    esm.engineExtraction?.pendingWorkAfter !== 0
  ) failures.push('packed ESM exact published-scene extraction failed');
  if (
    esm.interactionOwnership?.rootBindingCount !== 6 ||
    esm.interactionOwnership?.rootListenerCount !== 8 ||
    esm.interactionOwnership?.entityCallbackCount !== 0
  ) failures.push('packed ESM interaction ownership probe failed');
  if (
    esm.historyPackage?.companionBefore?.mode !== 'select' ||
    JSON.stringify(esm.historyPackage?.companionBefore?.selectionIds) !==
      JSON.stringify(['rect-b']) ||
    esm.historyPackage?.transactionStatus !== 'committed' ||
    esm.historyPackage?.transactionActionId !== 'packed-history' ||
    esm.historyPackage?.inspectedDepth !== 4 ||
    esm.historyPackage?.inspectedLastActionId !== 'packed-history' ||
    esm.historyPackage?.inspectedLastRecordCount !== 1 ||
    esm.historyPackage?.undoStatus !== 'committed' ||
    esm.historyPackage?.undoDirection !== 'undo' ||
    esm.historyPackage?.undoActionId !== 'packed-history' ||
    esm.historyPackage?.companionAfterUndo?.mode !== 'select' ||
    esm.historyPackage?.addedPresentAfterUndo !== false ||
    esm.historyPackage?.redoStatus !== 'committed' ||
    esm.historyPackage?.redoDirection !== 'redo' ||
    esm.historyPackage?.redoActionId !== 'packed-history' ||
    esm.historyPackage?.companionAfterRedo?.mode !== 'transform' ||
    esm.historyPackage?.addedTypeAfterRedo !== 'rect' ||
    esm.historyPackage?.invalidCapacityStatus !== 'rejected' ||
    esm.historyPackage?.invalidCapacityCode !== 'INVALID_VALUE' ||
    esm.historyPackage?.protectedShortcut?.handled !== false ||
    esm.historyPackage?.protectedShortcut?.preventDefault !== false ||
    esm.historyPackage?.clearChanged !== true ||
    esm.historyPackage?.clearReason !== 'host' ||
    esm.historyPackage?.clearedDepth !== 0
  ) failures.push('packed ESM history transaction contract failed');
  if (esm.engineDestroyResult !== true) failures.push('packed ESM raw Engine destroy did not own cleanup');
  if (
    esm.engineAfterDestroy?.lifecycle !== 'destroyed' ||
    esm.engineAfterDestroy.canvasCount !== 0 ||
    esm.engineAfterDestroy.subscriptions?.active !== 0 ||
    esm.engineAfterDestroy.subscriptions?.duplicates !== 0 ||
    esm.engineAfterDestroy.pendingWork !== 0 ||
    esm.engineAfterDestroy.historyDepth !== 0 ||
    esm.engineAfterDestroy.rootIds?.length !== 0 ||
    esm.engineAfterDestroy.datasetRef !== null ||
    esm.engineAfterDestroy.semanticHash !== null ||
    esm.engineAfterDestroy.renderer !== null ||
    esm.engineAfterDestroy.assets !== null
  ) failures.push('packed ESM raw Engine retained lifecycle resources after destroy');
  if (cjs.entities !== 1 || cjs.id !== 'cjs-rect') failures.push('packed CJS parser subpath failed');
  if (
    cjs.authoringRevision !== 'core-v2-authoring/1' ||
    cjs.authoringPlannerType !== 'function' ||
    cjs.authoringEngineMethodType !== 'function' ||
    cjs.frameLoopType !== 'function' ||
    cjs.frameLoopFactoryType !== 'function' ||
    cjs.transactionRevision !== 'core-v2-mutation-transaction/1' ||
    cjs.commandTargetRevision !== 'core-v2-command-target/1' ||
    cjs.commandTargetFactoryType !== 'function' ||
    cjs.commandTargetSnapshotType !== 'function' ||
    cjs.commandTargetStatusType !== 'function' ||
    cjs.editorMountRevision !== 'core-v2-editor-mount/1' ||
    cjs.editorMountResolverType !== 'function' ||
    cjs.tooltipRevision !== 'core-v2-host-tooltip/1' ||
    cjs.migrationRevision !== 'core-v2-migration/1' ||
    cjs.migrationAuthorityType !== 'function' ||
    cjs.migrationCompatibilityType !== 'function' ||
    cjs.migrationPersistenceType !== 'function' ||
    cjs.tooltipBindingType !== 'function' ||
    cjs.tooltipHoverType !== 'function' ||
    cjs.tooltipPinType !== 'function' ||
    cjs.tooltipClearType !== 'function' ||
    cjs.pointerRevision !== 'core-v2-pointer-gesture/1' ||
    cjs.pointerAuthorityType !== 'function' ||
    cjs.pageLifecycleRevision !== 'core-v2-page-lifecycle/1' ||
    cjs.pageLifecycleAuthorityType !== 'function' ||
    cjs.pageLifecycleVisibilityType !== 'function' ||
    cjs.pageLifecycleProbeType !== 'function' ||
    cjs.hostInteractionRevision !== 'core-v2-host-interaction/1' ||
    cjs.hostInteractionAuthorityType !== 'function' ||
    cjs.selectionTransformerRevision !== 'core-v2-selection-transformer/1' ||
    cjs.selectionTransformerAuthorityType !== 'function' ||
    cjs.transformerEditRevision !== 'core-v2-transformer-edit/1' ||
    cjs.transformerEditPlannerType !== 'function' ||
    cjs.transformerSnapType !== 'function' ||
    cjs.transformerSessionType !== 'function' ||
    cjs.presentationRevision !== 'core-v2-presentation-policy/1' ||
    cjs.plannerType !== 'function' ||
    cjs.historyEngineType !== 'function' ||
    cjs.historyInspectionType !== 'function' ||
    cjs.historyCompanionType !== 'function' ||
    cjs.historyCapacityType !== 'function' ||
    cjs.historyShortcutType !== 'function' ||
    cjs.historyClearType !== 'function' ||
    cjs.extractionType !== 'function' ||
    cjs.strictReferenceValidatorType !== 'function'
  ) failures.push('packed CJS transaction/presentation exports failed');
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
    supplyChain.audit.knownVulnerabilityCount !== null
    && supplyChain.audit.knownVulnerabilityCount !== 0
  ) {
    failures.push('packed dependency audit found known vulnerabilities');
  }
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
  ) failures.push('packed production host harness did not bind source product imports to the tarball');
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
  ) failures.push('packed redesigned host adapter capability/audit proof failed');
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
  if (errors.console.length || errors.page.length || errors.network.length) failures.push('packed browser consumer emitted errors');
  return failures;
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
