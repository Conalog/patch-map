import { compareObservation } from '../core-v2-contract/compare.mjs';
import { inspectPatchMapUpdateConflictActuals } from '../core-v2-contract/update-conflict-actuals.mjs';

import {
  ACCESSIBILITY_TRANCHE_CASES,
  AUTHORING_TRANCHE_CASES,
  CONTROL_CASES,
  DETERMINISM_LIFECYCLE_TRANCHE_CASES,
  EDITOR_WORKFLOW_TRANCHE_CASES,
  GPU_EVIDENCE_CASES,
  MIGRATION_TRANCHE_CASES,
  PERFORMANCE_GPU_CASES,
  PIXIJS_INTEGRATION_TRANCHE_CASES,
  SECURITY_OPERATIONS_TRANCHE_CASES,
} from './catalog.mjs';

export function compareCaseRun(expectedCase, browserRun) {
  return compareObservation({
    expectedCase,
    actual: browserRun.actualObservation,
    fixtures: browserRun.fixtures,
    captures: browserRun.captures,
  });
}

export function assertCaseRun(caseSpec, run, comparison, runLabel) {
  const prefix = `${caseSpec.id} ${runLabel}`;
  const expectedFailures = [
    ...(caseSpec.expectedFailures ?? []),
    ...(caseSpec.expectedDeficits ?? []),
  ];
  const failureActuals = caseSpec.id === 'CSM-010'
    ? {
        longTaskAtLeast100Ms: run.actualObservation?.outcome?.longTaskAtLeast100Ms ?? null,
        rawTimingSamples: run.actualObservation?.outcome?.rawTimingSamples ?? null,
        measurements: run.diagnostics?.longTaskMeasurements ?? null,
      }
    : caseSpec.id === 'HIS-001'
      ? run.actualObservation?.history?.domainMatrix?.rows ?? null
      : caseSpec.id === 'HIS-006'
        ? run.actualObservation?.history?.compoundDomainMatrix?.rows ?? null
        : null;
  invariant(run.runningStatus === 'running', `${prefix} enters running state`);
  invariant(run.terminalStatus === 'observed', `${prefix} observed terminal state`);
  invariant(run.runStatus === 'observed', `${prefix} public bridge run result`);
  invariant(run.executionStatus === 'completed', `${prefix} executor completion`);
  invariant(run.actionStatuses.length > 0, `${prefix} action results are present`);
  invariant(run.actionStatuses.every((status) => status === 'completed'), `${prefix} actions complete`);
  invariant(run.actualMatchesRun === true, `${prefix} actualObservation public accessor parity`);
  invariant(run.cleanupStatus === 'completed', `${prefix} cleanup completion`);
  invariant(run.canvas.initial === 0, `${prefix} starts without a retained canvas`);
  const expectedMaxCanvas = caseSpec.expectedMaxCanvas ?? 1;
  invariant(
    run.canvas.maximumDuringRun === expectedMaxCanvas,
    `${prefix} owns exactly ${expectedMaxCanvas} transient canvas(es) `
      + `(observed ${run.canvas.maximumDuringRun})`,
  );
  invariant(run.canvas.afterCleanup === 0, `${prefix} cleanup releases the transient canvas`);
  invariant(comparison.assertions.length === caseSpec.expectedAssertions, `${prefix} assertion inventory`);
  invariant(
    comparison.passed === caseSpec.expectedAssertions - expectedFailures.length,
    `${prefix} exact assertion pass count (${comparison.passed}/${caseSpec.expectedAssertions}; `
      + `failures=${JSON.stringify(comparisonFailures(comparison))}; `
      + `actuals=${JSON.stringify(failureActuals)})`,
  );
  invariant(
    comparison.failed === expectedFailures.length,
    `${prefix} exact assertion failure count (${comparison.failed}/${expectedFailures.length})`,
  );
  invariant(
    sameJson(comparisonFailures(comparison), expectedFailures),
    `${prefix} only declared immutable conflicts or measured performance deficits`,
  );
  assertImmutableConflictActuals(caseSpec.id, run.actualObservation, runLabel);
  if (ACCESSIBILITY_TRANCHE_CASES.has(caseSpec.id)) {
    assertAccessibilityActuals(caseSpec.id, run.actualObservation, runLabel);
  }
  if (caseSpec.id === 'REN-005') assertRen005FocusedUi(run.ui, runLabel);
  if (caseSpec.id === 'REN-006' || caseSpec.id === 'REN-011') {
    assertTextFocusedUi(caseSpec.id, run.ui, runLabel);
  }
  if (caseSpec.id === 'REN-008' || caseSpec.id === 'REN-010') {
    assertComponentAssetFocusedUi(caseSpec.id, run.ui, runLabel);
  }
  if (CONTROL_CASES.has(caseSpec.id)) {
    assertControlUi(caseSpec.id, run.ui, runLabel);
  }
  if (GPU_EVIDENCE_CASES.has(caseSpec.id)) {
    assertGpuEvidence(caseSpec.id, run.gpu, runLabel, run.actualObservation);
  }
}

function assertControlUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} generic focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual Run/Repeat control`);
  invariant(ui.caseId === caseId, `${caseId} ${runLabel} focused UI case identity`);
  invariant(ui.contractStatus === 'observed', `${caseId} ${runLabel} focused DOM terminal state`);
  invariant(
    Array.isArray(ui.actionStatuses)
      && ui.actionStatuses.length > 0
      && ui.actionStatuses.every((status) => status === 'completed'),
    `${caseId} ${runLabel} focused DOM action rows complete`,
  );
  invariant(ui.controls?.runDisabled === true, `${caseId} ${runLabel} Run control is consumed`);
  invariant(ui.controls?.repeatDisabled === false, `${caseId} ${runLabel} Repeat control is enabled`);
  invariant(ui.controls?.destroyDisabled === false, `${caseId} ${runLabel} Destroy control is enabled`);
}

export function assertDestroyControl(caseId, destroyed, runLabel) {
  if (!CONTROL_CASES.has(caseId)) return;
  invariant(
    destroyed.trigger === 'click:destroy-case',
    `${caseId} ${runLabel} actual Destroy control`,
  );
  invariant(destroyed.rootStatus === 'destroyed', `${caseId} ${runLabel} destroyed DOM state`);
  invariant(
    cleanupStatus(destroyed.cleanup) === 'completed',
    `${caseId} ${runLabel} Destroy control cleanup completion`,
  );
}

function assertImmutableConflictActuals(caseId, actualObservation, runLabel) {
  const mismatches = inspectPatchMapUpdateConflictActuals(caseId, actualObservation);
  invariant(
    mismatches.length === 0,
    `${caseId} ${runLabel} immutable-conflict actuals (${JSON.stringify(mismatches)})`,
  );
}

function assertAccessibilityActuals(caseId, actualObservation, runLabel) {
  const prefix = `${caseId} ${runLabel} Pixi accessibility`;
  const surface = actualObservation?.accessibility?.surface;
  invariant(surface && typeof surface === 'object', `${prefix} surface probe`);
  invariant(surface.active === true, `${prefix} aggregate overlay active`);
  invariant(surface.shadowDomActive === true, `${prefix} shadow DOM active`);
  invariant(surface.overlayNodeCount === 3, `${prefix} logical node count`);
  invariant(
    surface.shadowDomNodeCount === 3,
    `${prefix} shadow DOM node count (${String(surface.shadowDomNodeCount)})`,
  );
  invariant(surface.rootListenerCount === 1, `${prefix} one delegated listener`);
  invariant(surface.entityListenerCount === 0, `${prefix} no entity listener`);
  const focusedId = caseId === 'ACC-002' ? 'rect-b' : 'item-a';
  invariant(surface.focusedId === focusedId, `${prefix} logical focus`);
  invariant(
    surface.shadowDomFocusedId === focusedId,
    `${prefix} shadow DOM focus (${String(surface.shadowDomFocusedId)})`,
  );
}

function assertGpuEvidence(caseId, gpu, runLabel, actualObservation) {
  const prefix = `${caseId} ${runLabel} WebGL evidence`;
  invariant(gpu && typeof gpu === 'object', `${prefix} exists`);
  invariant(gpu.revision === 'core-v2-webgl-browser-probe/1', `${prefix} revision`);
  invariant(gpu.caseId === caseId, `${prefix} case identity`);
  invariant(
    gpu.operation === (runLabel === 'repeat' ? 'repeatCase' : 'runCase'),
    `${prefix} operation identity`,
  );
  invariant(Array.isArray(gpu.errors) && gpu.errors.length === 0, `${prefix} capture errors`);
  invariant(Array.isArray(gpu.contexts) && gpu.contexts.length > 0, `${prefix} context inventory`);
  invariant(
    gpu.contexts.every((context) => context.actualContext === 'webgl2'),
    `${prefix} uses actual WebGL2 contexts (${JSON.stringify(gpu.contexts)})`,
  );
  invariant(
    gpu.contexts.every((context) => context.trackedCanvas === true),
    `${prefix} observes only product-owned canvases (${JSON.stringify(gpu.contexts)})`,
  );
  invariant(Array.isArray(gpu.frames) && gpu.frames.length > 0, `${prefix} visible frame inventory`);
  invariant(
    gpu.frames.every((frame) => frame.trackedCanvas === true),
    `${prefix} tracked canvas frames (${gpuFrameDiagnostic(gpu)})`,
  );
  if (
    AUTHORING_TRANCHE_CASES.has(caseId)
    || EDITOR_WORKFLOW_TRANCHE_CASES.has(caseId)
  ) {
    invariant(
      gpu.frames.some((frame) => frame.draws.length > 0),
      `${prefix} post-authoring draw frame (${gpuFrameDiagnostic(gpu)})`,
    );
    return;
  }
  invariant(
    gpu.frames.every((frame) => frame.draws.length > 0),
    `${prefix} draw frames (${gpuFrameDiagnostic(gpu)})`,
  );
  if (PIXIJS_INTEGRATION_TRANCHE_CASES.has(caseId)) return;
  if (DETERMINISM_LIFECYCLE_TRANCHE_CASES.has(caseId)) return;
  if (SECURITY_OPERATIONS_TRANCHE_CASES.has(caseId)) return;
  if (ACCESSIBILITY_TRANCHE_CASES.has(caseId)) return;
  if (MIGRATION_TRANCHE_CASES.has(caseId)) return;
  if (PERFORMANCE_GPU_CASES.has(caseId)) return;

  if (caseId === 'LAY-003') {
    assertLay003GpuPaintOrder(gpu, prefix, actualObservation);
    return;
  }
  if (caseId === 'UPD-007') {
    assertUpd007GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'UPD-008') {
    assertUpd008GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'UPD-009') {
    assertUpd009GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'LIF-003') {
    assertLif003GpuReplacement(gpu, prefix);
    return;
  }
  if (caseId === 'CSM-037') {
    assertCsm037GpuPresentation(gpu, prefix);
    return;
  }
  assertAnimatedBarGpuProjection(caseId, gpu, prefix);
}

function assertLay003GpuPaintOrder(gpu, prefix, actualObservation) {
  const initial = ['#111111ff', '#222222ff', '#333333ff', '#444444ff'];
  const patched = ['#222222ff', '#333333ff', '#111111ff', '#444444ff'];
  const frameOrders = gpu.frames
    .map((frame) => compressConsecutive(frame.draws
      .map((draw) => draw.centerRgba)
      .filter((rgba) => initial.includes(rgba))))
    .filter((order) => order.length > 0);
  if (containsOrderedRecords(frameOrders, [initial, patched, initial, patched])) return;

  // Pixi may legally batch all four compatible aggregate meshes into one
  // WebGL draw. In that case intermediate occluded colors are not observable
  // as separate draw calls, so require four real frames with the unchanged
  // topmost pixel and correlate them with the public product order actual.
  const topmostFrames = Array.from({ length: 4 }, () => ['#444444ff']);
  invariant(
    containsOrderedRecords(frameOrders, topmostFrames),
    `${prefix} batch-compatible topmost GPU frames (${JSON.stringify(frameOrders)})`,
  );
  const scene = actualObservation?.scene;
  invariant(
    scene
      && sameJson(scene.initial?.renderOrder, [
        'low', 'first', 'second', 'high', 'selection', 'transformer',
      ])
      && sameJson(scene.afterPatch?.renderOrder, [
        'first', 'second', 'low', 'high', 'selection', 'transformer',
      ])
      && sameJson(scene.afterUndo?.renderOrder, [
        'low', 'first', 'second', 'high', 'selection', 'transformer',
      ])
      && sameJson(scene.afterRedo?.renderOrder, [
        'first', 'second', 'low', 'high', 'selection', 'transformer',
      ]),
    `${prefix} batch-compatible GPU frames correlate with public product paint order`,
  );
}

function assertUpd007GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 2);
  invariant(
    publishedSequence !== undefined,
    `${prefix} initial and post-bulk publish both issue WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const postBulkFrame = publishedSequence.at(-1);
  invariant(
    postBulkFrame?.draws.length > 0,
    `${prefix} post-bulk frame contains a real GPU draw (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertUpd008GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 4);
  invariant(
    publishedSequence !== undefined,
    `${prefix} initial/reconcile/hide/show each issue WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const updateFrames = publishedSequence.slice(-3);
  invariant(
    updateFrames.length === 3 && updateFrames.every((frame) => frame.draws.length > 0),
    `${prefix} reconcile/hide/show post-update frames contain real GPU draws (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertUpd009GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 4);
  invariant(
    publishedSequence !== undefined,
    `${prefix} move/group/ungroup/unrecorded-move each publish WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const structuralFrames = publishedSequence.slice(-4);
  invariant(
    structuralFrames.length === 4 && structuralFrames.every((frame) => frame.draws.length > 0),
    `${prefix} structural frames contain real GPU draws (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertLif003GpuReplacement(gpu, prefix) {
  const sequences = [...new Set(gpu.frames.map((frame) => frame.contextIndex))]
    .map((contextIndex) => gpu.frames
      .filter((frame) => frame.contextIndex === contextIndex)
      .map(frameBarHeight)
      .filter((height) => height !== null));
  const visibleReplacement = sequences.some((sequence) => {
    const initial = sequence.findIndex((height) => height >= 9 && height <= 11);
    const animated = sequence.findIndex((height, index) => (
      index > initial && height > 10.1 && height < 29.9
    ));
    return initial >= 0
      && animated > initial
      && sequence.some((height, index) => (
        index > animated && height >= 9 && height <= 11
      ));
  });
  invariant(
    visibleReplacement,
    `${prefix} publishes initial, animated, and replacement bar frames (${JSON.stringify(sequences)})`,
  );
}

function assertCsm037GpuPresentation(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  invariant(
    sequences.some((sequence) => sequence.length >= 3),
    `${prefix} report load, replacement, and fit each publish WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  invariant(
    gpu.frames.some((frame) => frame.draws.some((draw) => (
      draw.centerRgba === '#00aa66ff' || draw.barColumn?.rgba === '#00aa66ff'
    ))),
    `${prefix} includes the report panel presentation color (${gpuFrameDiagnostic(gpu)})`,
  );
}

function webGl2DrawFrameSequences(gpu) {
  return gpu.contexts
    .filter((context) => context.actualContext === 'webgl2' && context.trackedCanvas === true)
    .map((context) => gpu.frames.filter((frame) => (
      frame.contextIndex === context.index
      && frame.trackedCanvas === true
      && Array.isArray(frame.draws)
      && frame.draws.length > 0
    )));
}

function assertAnimatedBarGpuProjection(caseId, gpu, prefix) {
  const byContext = new Map();
  for (const frame of gpu.frames) {
    const height = frameBarHeight(frame);
    if (height === null) continue;
    const sequence = byContext.get(frame.contextIndex) ?? [];
    sequence.push(height);
    byContext.set(frame.contextIndex, sequence);
  }
  const sequences = [...byContext.values()];
  const diagnostic = JSON.stringify(sequences);
  if (caseId === 'REN-009') {
    invariant(
      sequences.some((sequence) => containsHeightBands(sequence, [[9, 11], [35, 38], [39, 41]])),
      `${prefix} visible 10 -> 36.25 -> 40 bar projection (${diagnostic})`,
    );
    return;
  }
  if (caseId === 'ANI-001') {
    invariant(
      sequences.some((sequence) => containsHeightBands(
        sequence,
        [[9, 11], [35, 38], [21, 24], [19, 21]],
      )),
      `${prefix} visible retargeted 10 -> 36.25 -> 22.03125 -> 20 projection (${diagnostic})`,
    );
    return;
  }
  invariant(caseId === 'ANI-002', `${prefix} supported animation case`);
  const matchingSchedules = sequences.filter((sequence) => containsHeightBands(
    sequence,
    [[9, 11], [35, 38], [39, 41]],
  ));
  invariant(
    matchingSchedules.length >= 2,
    `${prefix} both frame-cadence schedules reach the same visible projection (${diagnostic})`,
  );
}

function frameBarHeight(frame) {
  const heights = frame.draws
    .map((draw) => draw.barColumn?.height)
    .filter((height) => Number.isFinite(height) && height > 0);
  return heights.length === 0 ? null : Math.max(...heights);
}

function containsHeightBands(sequence, bands) {
  let cursor = 0;
  for (const value of sequence) {
    const [minimum, maximum] = bands[cursor] ?? [];
    if (minimum === undefined) break;
    if (value >= minimum && value <= maximum) cursor += 1;
  }
  return cursor === bands.length;
}

function containsOrderedRecords(records, expected) {
  let cursor = 0;
  for (const record of records) {
    if (sameJson(record, expected[cursor])) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

function compressConsecutive(values) {
  const compressed = [];
  for (const value of values) {
    if (compressed.at(-1) !== value) compressed.push(value);
  }
  return compressed;
}

function gpuFrameDiagnostic(gpu) {
  return JSON.stringify(gpu.frames.map((frame) => ({
    contextIndex: frame.contextIndex,
    frameIndex: frame.frameIndex,
    drawCount: frame.draws.length,
    center: compressConsecutive(frame.draws.map((draw) => draw.centerRgba)),
    barHeight: frameBarHeight(frame),
  })));
}

function assertRen005FocusedUi(ui, runLabel) {
  invariant(ui && typeof ui === 'object', `REN-005 ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `REN-005 ${runLabel} actual UI control`);
  invariant(
    sameJson(ui.actionStatuses, ['completed', 'completed', 'completed', 'completed']),
    `REN-005 ${runLabel} four completed DOM action rows`,
  );
  invariant(
    sameJson(ui.chooserOptions, [
      'alias',
      'url',
      'descriptor',
      'data-uri',
      'transformed',
      'hidden-image',
      'failed-image',
    ]),
    `REN-005 ${runLabel} seven specimen chooser`,
  );
  invariant(ui.descriptor.source === 'fixture-image', `REN-005 ${runLabel} descriptor source`);
  invariant(ui.descriptor.sourceKind === 'alias', `REN-005 ${runLabel} descriptor source kind`);
  invariant(ui.descriptor.state === 'resolved', `REN-005 ${runLabel} descriptor state`);
  invariant(ui.descriptor.role === 'image', `REN-005 ${runLabel} descriptor role`);
  invariant(ui.descriptor.bounds === '[0,0,32,32]', `REN-005 ${runLabel} descriptor bounds`);
  invariant(
    ui.descriptor.initialSource.includes('https://assets.example.test/image.svg'),
    `REN-005 ${runLabel} descriptor initial source`,
  );
  invariant(ui.descriptor.initialState === 'resolved', `REN-005 ${runLabel} descriptor initial state`);
  invariant(ui.descriptor.staleAttachCount === '0', `REN-005 ${runLabel} descriptor stale attach`);
  invariant(
    ui.descriptor.staleCompletionCount === '1',
    `REN-005 ${runLabel} descriptor stale completion`,
  );
  invariant(ui.failed.source === 'fixture://failed-image.png', `REN-005 ${runLabel} failed source`);
  invariant(ui.failed.state === 'failed', `REN-005 ${runLabel} failed state`);
  invariant(ui.failed.role === 'asset-placeholder', `REN-005 ${runLabel} failed role`);
  invariant(ui.failed.bounds === '[220,40,32,32]', `REN-005 ${runLabel} failed bounds`);
  invariant(ui.failed.diagnosticCount === '1', `REN-005 ${runLabel} failed diagnostic`);
  invariant(ui.counters.requests === '5', `REN-005 ${runLabel} request count`);
  const backendCounts = String(ui.counters.backend).match(/\d+/gu)?.map(Number) ?? [];
  invariant(
    sameJson(backendCounts, [0, 3, 1, 1]),
    `REN-005 ${runLabel} backend counters (${String(ui.counters.backend)})`,
  );
  invariant(ui.counters.resources === '4', `REN-005 ${runLabel} resource count`);
  invariant(Number(ui.counters.leases) > 0, `REN-005 ${runLabel} lease count`);
  invariant(ui.counters.stale === '1', `REN-005 ${runLabel} stale count`);
  invariant(ui.counters.pendingRelease === '0', `REN-005 ${runLabel} pending release count`);
  invariant(ui.requestJournal.count >= 15, `REN-005 ${runLabel} request journal rows`);
  invariant(ui.requestJournal.events.includes('load-rejected'), `REN-005 ${runLabel} rejected journal`);
  invariant(ui.requestJournal.events.includes('load-resolved'), `REN-005 ${runLabel} resolved journal`);
  invariant(ui.requestJournal.kinds.includes('descriptor'), `REN-005 ${runLabel} descriptor journal`);
  invariant(ui.requestJournal.kinds.includes('failed'), `REN-005 ${runLabel} failed journal`);
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `REN-005 ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `REN-005 ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `REN-005 ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `REN-005 ${runLabel} ${label}`);
  }
}

function assertTextFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused text UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const choices = caseId === 'REN-006'
    ? ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
    : [
        'placed',
        'auto',
        'wrap',
        'overflow-visible',
        'overflow-hidden',
        'overflow-ellipsis',
        'upright',
      ];
  const actionCount = caseId === 'REN-006' ? 6 : 4;
  const seededChoice = caseId === 'REN-006' ? 'empty' : 'overflow-hidden';
  invariant(
    sameJson(ui.actionStatuses, Array.from({ length: actionCount }, () => 'completed')),
    `${caseId} ${runLabel} completed canonical DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} actual chooser enabled`);
  invariant(ui.chooser.initialChoice === seededChoice, `${caseId} ${runLabel} seeded initial choice`);
  invariant(ui.chooser.seededChoice === seededChoice, `${caseId} ${runLabel} declared seeded choice`);
  invariant(
    sameJson(ui.chooser.options, choices.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed choice inventory`,
  );
  invariant(
    ui.observedChoiceCount === `${choices.length} / ${choices.length}개 관찰`,
    `${caseId} ${runLabel} actual choice count`,
  );
  invariant(
    ui.displayOnlyNote.includes('표시 전용 탐색')
      && ui.displayOnlyNote.includes('기준 작업 순서'),
    `${caseId} ${runLabel} display-only canonical-trace disclosure`,
  );
  invariant(
    choices.every((choice) => ui.choices[choice] && typeof ui.choices[choice] === 'object'),
    `${caseId} ${runLabel} every actual choice is readable`,
  );

  if (caseId === 'REN-006') assertRen006TextChoices(ui.choices, runLabel);
  else assertRen011TextChoices(ui.choices, runLabel);

  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
  }
}

function assertRen006TextChoices(choices, runLabel) {
  invariant(choices.initial.phase === 'initial', `REN-006 ${runLabel} initial phase`);
  invariant(
    choices.initial.source === JSON.stringify('A\r\n中😀é'),
    `REN-006 ${runLabel} exact initial Unicode source`,
  );
  invariant(choices.initial.lines === '["A","中😀é"]', `REN-006 ${runLabel} initial lines`);
  invariant(choices.initial['layout-bounds'] === '[0,0,40,40]', `REN-006 ${runLabel} initial layout`);
  invariant(choices.empty['visible-text'] === '""', `REN-006 ${runLabel} empty visible text`);
  invariant(choices.empty['layout-bounds'] === '[0,0,0,20]', `REN-006 ${runLabel} empty layout`);
  invariant(choices.long.lines === '["ABCD","EFGH","IJ"]', `REN-006 ${runLabel} long lines`);
  invariant(choices.long['layout-bounds'] === '[0,0,32,60]', `REN-006 ${runLabel} long layout`);
  invariant(
    choices['missing-font']['font-runs'] === '[{"text":"fallback","font":"unifont-base-16.0.04","fallbackReason":"requested-font-unavailable"}]',
    `REN-006 ${runLabel} missing-font fallback run`,
  );
  invariant(
    choices['missing-font']['layout-bounds'] === '[0,0,64,20]',
    `REN-006 ${runLabel} missing-font layout`,
  );
  invariant(choices.rapid['visible-text'] === '"final中"', `REN-006 ${runLabel} rapid final text`);
  invariant(choices.rapid['layout-bounds'] === '[0,0,56,20]', `REN-006 ${runLabel} rapid layout`);
  invariant(
    choices.rapid['intermediate-publication-count'] === '0',
    `REN-006 ${runLabel} no intermediate publication`,
  );
  invariant(choices.rapid['stale-glyph-count'] === '0', `REN-006 ${runLabel} rapid stale glyphs`);
  invariant(
    choices.terminal.source === JSON.stringify('مرحبا world'),
    `REN-006 ${runLabel} terminal source`,
  );
  invariant(choices.terminal.lines === '["مرحبا world"]', `REN-006 ${runLabel} terminal lines`);
  invariant(
    choices.terminal['font-runs'] === '[{"text":"مرحبا world","font":"unifont-base-16.0.04"}]',
    `REN-006 ${runLabel} terminal fallback run`,
  );
  invariant(
    choices.terminal['layout-bounds'] === '{"x":0,"y":0,"width":88,"height":20}',
    `REN-006 ${runLabel} terminal layout`,
  );
  invariant(
    choices.terminal['world-bounds'] === '{"x":4.823619,"y":20,"width":90.177854,"height":42.094592}',
    `REN-006 ${runLabel} terminal world bounds`,
  );
  invariant(
    choices.terminal['hit-bounds'] === choices.terminal['world-bounds'],
    `REN-006 ${runLabel} terminal hit parity`,
  );
  invariant(choices.terminal.publication === 'current', `REN-006 ${runLabel} terminal publication`);
  invariant(choices.terminal['stale-glyph-count'] === '0', `REN-006 ${runLabel} terminal stale glyphs`);
  invariant(choices.terminal['renderer-route'] === 'fallback-text', `REN-006 ${runLabel} text route`);
  invariant(
    choices.terminal.style === '{"fontFamily":"Unifont","fontSize":16,"lineHeight":20,"letterSpacing":0,"fill":"#222222ff"}',
    `REN-006 ${runLabel} terminal style`,
  );
  invariant(
    choices.terminal.geometry === '{"positionWorld":[10,20],"rotationDegrees":15}',
    `REN-006 ${runLabel} terminal transform`,
  );
  invariant(
    ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
      .every((choice) => choices[choice].publication === 'current'),
    `REN-006 ${runLabel} displayed phases share terminal publication fact`,
  );
}

function assertRen011TextChoices(choices, runLabel) {
  invariant(choices.placed.source === '"AB"', `REN-011 ${runLabel} placed source`);
  invariant(choices.placed.placement === 'right-bottom', `REN-011 ${runLabel} placed placement`);
  invariant(choices.placed.margin === '5', `REN-011 ${runLabel} placed margin`);
  invariant(choices.placed.tint === '#ff0000', `REN-011 ${runLabel} placed authored tint`);
  invariant(choices.placed.rgba === '#ff0000ff', `REN-011 ${runLabel} placed projected tint`);
  invariant(choices.placed['local-bounds'] === '[219,135,16,20]', `REN-011 ${runLabel} placed geometry`);
  invariant(choices.placed['paint-tint'] === '#ff0000ff', `REN-011 ${runLabel} placed paint`);
  invariant(choices.auto.source === '"ABCD"', `REN-011 ${runLabel} auto source`);
  invariant(choices.auto.frame === '[32,20]', `REN-011 ${runLabel} auto frame`);
  invariant(
    choices.auto['auto-font'] === '{"min":8,"max":18,"chosen":16}',
    `REN-011 ${runLabel} auto font`,
  );
  invariant(choices.auto['visible-text'] === '"ABCD"', `REN-011 ${runLabel} auto visible text`);
  invariant(choices.auto['layout-bounds'] === '[0,0,32,20]', `REN-011 ${runLabel} auto layout`);
  invariant(choices.wrap.source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} wrap source`);
  invariant(choices.wrap['wrap-width'] === '32', `REN-011 ${runLabel} wrap width`);
  invariant(choices.wrap.lines === '["ABCD","EFGH","IJ"]', `REN-011 ${runLabel} wrap lines`);
  invariant(choices.wrap['layout-bounds'] === '[0,0,32,60]', `REN-011 ${runLabel} wrap layout`);
  for (const [choice, overflow, visibleText, layoutBounds] of [
    ['overflow-visible', 'visible', 'ABCDEFGHIJ', '[0,0,80,20]'],
    ['overflow-hidden', 'hidden', 'ABCD', '[0,0,32,20]'],
    ['overflow-ellipsis', 'ellipsis', 'ABC…', '[0,0,32,20]'],
  ]) {
    invariant(choices[choice].source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} ${choice} source`);
    invariant(choices[choice].frame === '[32,20]', `REN-011 ${runLabel} ${choice} frame`);
    invariant(choices[choice].overflow === overflow, `REN-011 ${runLabel} ${choice} mode`);
    invariant(
      choices[choice]['visible-text'] === JSON.stringify(visibleText),
      `REN-011 ${runLabel} ${choice} visible text`,
    );
    invariant(
      choices[choice]['layout-bounds'] === layoutBounds,
      `REN-011 ${runLabel} ${choice} layout`,
    );
  }
  invariant(choices.upright.source === '"AB"', `REN-011 ${runLabel} upright source`);
  invariant(choices.upright.placement === 'center', `REN-011 ${runLabel} upright placement`);
  invariant(choices.upright['item-angle'] === '37', `REN-011 ${runLabel} upright item angle`);
  invariant(choices.upright.orientation === 'upright', `REN-011 ${runLabel} upright orientation`);
  invariant(choices.upright['screen-angle'] === '37', `REN-011 ${runLabel} readable screen angle`);
  invariant(choices.upright['layout-bounds'] === '[0,0,16,20]', `REN-011 ${runLabel} upright layout`);
  invariant(
    Object.values(choices).every((facts) => facts.publication === 'current'),
    `REN-011 ${runLabel} current publication`,
  );
  invariant(
    Object.values(choices).every((facts) => facts['all-rows-exact'] === 'false'),
    `REN-011 ${runLabel} disclosed immutable matrix conflict`,
  );
}

function assertComponentAssetFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const phases = caseId === 'REN-008'
    ? ['initial', 'image', 'hidden', 'shown']
    : ['initial', 'replacement', 'tint'];
  invariant(
    sameJson(ui.actionStatuses, phases.map(() => 'completed')),
    `${caseId} ${runLabel} completed DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} observed phase chooser enabled`);
  invariant(
    sameJson(ui.chooser.options, phases.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed phase inventory`,
  );
  const observedPhaseCounts =
    String(ui.observedPhaseCount).match(/\d+/gu)?.map(Number) ?? [];
  invariant(
    sameJson(observedPhaseCounts, [phases.length, phases.length]),
    `${caseId} ${runLabel} phase observation count`,
  );

  const phaseFacts = phases.map((phase) => ui.phases[phase]);
  invariant(
    phaseFacts.every((facts) => facts && typeof facts === 'object'),
    `${caseId} ${runLabel} phase facts exist`,
  );
  if (caseId === 'REN-008') {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item', `REN-008 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'bg', `REN-008 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item::background:bg',
        `REN-008 ${runLabel} stable dense entity identity`,
      );
      invariant(
        facts['authored-size'] === '{"width":20,"height":10}',
        `REN-008 ${runLabel} inert authored size`,
      );
      invariant(
        facts['full-bounds'] === '[0,0,100,80]',
        `REN-008 ${runLabel} full item bounds`,
      );
    }
    invariant(ui.phases.initial.phase === 'A0 사각형', `REN-008 ${runLabel} initial phase label`);
    invariant(ui.phases.initial['render-role'] === 'background-geometry', `REN-008 ${runLabel} rect phase`);
    invariant(
      ui.phases.initial['render-object-count'] === '0',
      `REN-008 ${runLabel} aggregate rect has no per-component render object`,
    );
    invariant(ui.phases.initial['stale-count'] === '해당 없음', `REN-008 ${runLabel} rect has no texture`);
    invariant(ui.phases.image.phase === 'A1 이미지', `REN-008 ${runLabel} image phase label`);
    invariant(ui.phases.image.source === 'fixture-image', `REN-008 ${runLabel} image source`);
    invariant(ui.phases.image['resource-state'] === 'resolved', `REN-008 ${runLabel} image resolved`);
    invariant(ui.phases.image['render-role'] === 'background-asset', `REN-008 ${runLabel} image lane`);
    invariant(ui.phases.image['binding-key'] === 'alias:fixture-image', `REN-008 ${runLabel} image binding`);
    invariant(ui.phases.image.generation === '1', `REN-008 ${runLabel} image generation`);
    invariant(ui.phases.image['render-object-count'] === '1', `REN-008 ${runLabel} image object`);
    invariant(ui.phases.image['stale-count'] === '0', `REN-008 ${runLabel} image zero stale attachment`);
    invariant(ui.phases.hidden.phase === 'A2 숨김', `REN-008 ${runLabel} hidden phase label`);
    invariant(ui.phases.hidden['visible-bounds'] === 'null', `REN-008 ${runLabel} hidden bounds`);
    invariant(ui.phases.hidden['render-object-count'] === '0', `REN-008 ${runLabel} hidden renderer object`);
    invariant(ui.phases.hidden.generation === '2', `REN-008 ${runLabel} hidden generation`);
    invariant(ui.phases.hidden['stale-count'] === '0', `REN-008 ${runLabel} hidden zero stale attachment`);
    invariant(ui.phases.shown.phase === 'A3 표시', `REN-008 ${runLabel} shown phase label`);
    invariant(ui.phases.shown.source === 'fixture-image', `REN-008 ${runLabel} shown source`);
    invariant(ui.phases.shown['visible-bounds'] === '[0,0,100,80]', `REN-008 ${runLabel} shown bounds`);
    invariant(ui.phases.shown['render-object-count'] === '1', `REN-008 ${runLabel} shown renderer object`);
    invariant(ui.phases.shown.generation === '3', `REN-008 ${runLabel} shown generation`);
    invariant(ui.phases.shown['stale-count'] === '0', `REN-008 ${runLabel} shown zero stale attachment`);
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-008 ${runLabel} stable logical identity`,
    );
    invariant(ui.captureId === 'bg', `REN-008 ${runLabel} declared capture identity`);
  } else {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item-a', `REN-010 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'icon', `REN-010 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item-a::icon:icon',
        `REN-010 ${runLabel} stable dense entity identity`,
      );
      invariant(facts['content-box'] === '[10,10,80,60]', `REN-010 ${runLabel} content box`);
      invariant(facts['icon-bounds'] === '[47,12,40,15]', `REN-010 ${runLabel} icon bounds`);
      invariant(
        facts['authored-size'] === '{"width":"50%","height":"25%"}',
        `REN-010 ${runLabel} authored percentage size`,
      );
      invariant(facts.placement === 'right-top', `REN-010 ${runLabel} placement`);
      invariant(
        facts.margins === '{"top":2,"right":3,"bottom":0,"left":0}',
        `REN-010 ${runLabel} margins`,
      );
      invariant(facts['render-role'] === 'content-asset', `REN-010 ${runLabel} content asset lane`);
      invariant(facts['render-object-count'] === '1', `REN-010 ${runLabel} one icon object`);
      invariant(facts['stale-count'] === '0', `REN-010 ${runLabel} zero stale attachment`);
    }
    invariant(ui.phases.initial.source === 'fixture-icon', `REN-010 ${runLabel} initial source`);
    invariant(ui.phases.initial['binding-key'] === 'alias:fixture-icon', `REN-010 ${runLabel} initial binding`);
    invariant(ui.phases.initial.generation === '1', `REN-010 ${runLabel} initial generation`);
    invariant(ui.phases.initial.phase === 'A0 초기 별칭', `REN-010 ${runLabel} initial phase label`);
    invariant(ui.phases.replacement.source === 'fixture-icon-2', `REN-010 ${runLabel} replacement source`);
    invariant(ui.phases.replacement['binding-key'] === 'alias:fixture-icon-2', `REN-010 ${runLabel} replacement binding`);
    invariant(ui.phases.replacement.generation === '2', `REN-010 ${runLabel} replacement generation`);
    invariant(ui.phases.replacement.phase === 'A1 교체 별칭', `REN-010 ${runLabel} replacement phase label`);
    invariant(ui.phases.tint.source === 'fixture-icon-2', `REN-010 ${runLabel} tint retains source`);
    invariant(ui.phases.tint.generation === '2', `REN-010 ${runLabel} tint retains generation`);
    invariant(ui.phases.tint.phase === 'A2 색조 부분 갱신', `REN-010 ${runLabel} tint phase label`);
    invariant(ui.phases.tint['semantic-tint'] === '#00ff00ff', `REN-010 ${runLabel} semantic tint`);
    invariant(
      ui.phases.tint['renderer-tint'] === '패킹 0x00ff00ff · RGB 0x00ff00 · 투명도 1.000',
      `REN-010 ${runLabel} renderer tint`,
    );
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-010 ${runLabel} stable logical identity`,
    );
  }

  invariant(ui.resources['canvas-count'] === '1', `${caseId} ${runLabel} live action canvas`);
  invariant(ui.resources['subscription-count'] === '6', `${caseId} ${runLabel} central subscriptions`);
  invariant(ui.resources['pending-work-count'] === '0', `${caseId} ${runLabel} no pending work`);
  invariant(ui.resources['binding-count'] === '1', `${caseId} ${runLabel} one current binding`);
  invariant(ui.resources['resource-count'] === '1', `${caseId} ${runLabel} one current resource`);
  invariant(ui.resources['lease-count'] === '1', `${caseId} ${runLabel} one current lease`);
  invariant(ui.resources['pending-settlement-count'] === '0', `${caseId} ${runLabel} no pending settlement`);
  invariant(ui.resources['pending-release-count'] === '0', `${caseId} ${runLabel} no pending release`);
  invariant(ui.resources['stale-attachment-resource-count'] === '0', `${caseId} ${runLabel} no stale resource`);
  invariant(ui.resources['renderer-object-resource-count'] === '1', `${caseId} ${runLabel} one renderer object`);
  invariant(ui.resources['cleanup-failure-count'] === '0', `${caseId} ${runLabel} no cleanup failure`);
  invariant(ui.resourceJournal.count > 0, `${caseId} ${runLabel} resource journal`);
  const expectedResourceEvents = caseId === 'REN-008'
    ? [
        'fixture-assets-registered',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
        'backend-texture-resolved',
        'component-asset-settled',
      ]
    : [
        'fixture-assets-registered',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
      ];
  invariant(
    sameJson(ui.resourceJournal.events, expectedResourceEvents),
    `${caseId} ${runLabel} deterministic resource journal`,
  );
  invariant(
    ui.resourceJournal.events.includes('backend-texture-resolved'),
    `${caseId} ${runLabel} resolved texture journal`,
  );
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
  }
}


export function summarizeComparison(comparison) {
  return {
    assertionCount: comparison.assertions.length,
    passed: comparison.passed,
    failed: comparison.failed,
    firstFailure: comparison.firstFailure,
    failures: comparisonFailures(comparison),
  };
}

function comparisonFailures(comparison) {
  return comparison.assertions
    .filter((assertion) => !assertion.passed)
    .map((assertion) => ({
      path: assertion.path,
      code: assertion.failure?.code ?? null,
      failurePath: assertion.failure?.path ?? null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function firstJsonDifference(left, right, pointer) {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${pointer}/length`;
    for (let index = 0; index < left.length; index += 1) {
      const nested = firstJsonDifference(left[index], right[index], `${pointer}/${index}`);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (
    left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
    && !Array.isArray(left)
    && !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!sameJson(leftKeys, rightKeys)) return `${pointer}/keys`;
    for (const key of leftKeys) {
      const nested = firstJsonDifference(
        left[key],
        right[key],
        `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
      );
      if (nested !== null) return nested;
    }
    return null;
  }
  return pointer || '/';
}

export function cleanupStatus(cleanup) {
  return cleanup && typeof cleanup === 'object' && typeof cleanup.status === 'string'
    ? cleanup.status
    : null;
}

export function invariant(condition, message) {
  if (!condition) throw new Error(`Core v2 render browser checkpoint failed: ${message}`);
}
