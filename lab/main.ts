import { LAB_CASES, LAB_CASE_BY_ID, LAB_CASE_COUNTS } from './cases/catalog';
import { LAB_FIXTURES } from './cases/fixtures';
import type { LabCase, LabRunStatus } from './cases/types';
import {
  LabRuntime,
  readPath,
  type LabAssertionResult,
  type LabRuntimeError,
  type LabStepResult,
  type ManualObservationRequest,
} from './runtime';

const STORAGE_KEY = 'patch-map:browser-lab:v1';
const CASE_STATUS_KEY = 'patch-map:browser-lab:case-status:v1';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Browser lab element #${id} is missing.`);
  return element as T;
};

const formatJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const compactValue = (value: unknown, length = 96): string => {
  const text = typeof value === 'string' ? value : formatJson(value).replace(/\s+/gu, ' ');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const titleCase = (value: string): string =>
  value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const statusLabel = (status: LabRunStatus): string => status.replace('-', ' ').toUpperCase();

const statusClass = (status: LabRunStatus): string => `status-${status}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const safeParse = (text: string, label: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`${label}: ${message}`);
  }
};

const toAppOwnedError = (error: unknown): LabRuntimeError => {
  const value = error instanceof Error ? error : new Error(String(error));
  const stack = (value.stack ?? `${value.name}: ${value.message}`)
    .split('\n')
    .filter((line, index) => {
      if (index === 0) return true;
      if (/node_modules|\/dist\/|\.map(?::|$)|\.umd\.|\.bundle\./iu.test(line)) return false;
      return /(?:\/lab\/|\/src\/)/u.test(line);
    })
    .join('\n');
  return { name: value.name, message: value.message, stack };
};

const loadStatusMap = (): Map<string, LabRunStatus> => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CASE_STATUS_KEY) ?? '{}');
    if (!isRecord(value)) return new Map();
    return new Map(
      Object.entries(value).filter(
        (entry): entry is [string, LabRunStatus] =>
          ['not-run', 'running', 'pass', 'fail', 'partial', 'pending'].includes(String(entry[1])),
      ),
    );
  } catch {
    return new Map();
  }
};

const patchmapHost = byId<HTMLElement>('patchmap-host');
const runtime = new LabRuntime(patchmapHost);
const caseStatuses = loadStatusMap();
const caseStepResults = new Map<string, Map<number, LabStepResult>>();

let activeCase = LAB_CASES[0] as LabCase;
let activeStepIndex = -1;
let activeResult: LabStepResult | null = null;
let standaloneObservation: Record<string, unknown> | null = null;
let controlError: LabRuntimeError | null = null;
let busy = false;
let telemetryTimer = 0;
let frameTelemetryTimer = 0;
let pendingTelemetryObservation: Record<string, unknown> | null = null;
let telemetryNeedsFreshObservation = false;
let sessionStarted = performance.now();

const elements = {
  caseList: byId<HTMLElement>('case-list'),
  caseSearch: byId<HTMLInputElement>('case-search'),
  categoryFilter: byId<HTMLSelectElement>('category-filter'),
  statusFilter: byId<HTMLSelectElement>('status-filter'),
  riskFilter: byId<HTMLSelectElement>('risk-filter'),
  caseCount: byId<HTMLElement>('case-count'),
  passedCount: byId<HTMLElement>('passed-count'),
  failedCount: byId<HTMLElement>('failed-count'),
  partialCount: byId<HTMLElement>('partial-count'),
  activeCaseCode: byId<HTMLElement>('active-case-code'),
  activeCaseTitle: byId<HTMLElement>('active-case-title'),
  activeCaseStatus: byId<HTMLElement>('active-case-status'),
  stepIndex: byId<HTMLElement>('step-index'),
  stepTitle: byId<HTMLElement>('step-title'),
  stepDescription: byId<HTMLElement>('step-description'),
  stepRail: byId<HTMLElement>('step-rail'),
  stepInput: byId<HTMLElement>('step-input'),
  inputSize: byId<HTMLElement>('input-size'),
  resultLabel: byId<HTMLElement>('result-label'),
  resultStatus: byId<HTMLElement>('result-status'),
  assertionList: byId<HTMLElement>('assertion-list'),
  sceneSnapshot: byId<HTMLElement>('scene-snapshot'),
  snapshotCount: byId<HTMLElement>('snapshot-count'),
  structuralDiff: byId<HTMLElement>('structural-diff'),
  diffCount: byId<HTMLElement>('diff-count'),
  selectedHandle: byId<HTMLElement>('selected-handle'),
  handleId: byId<HTMLElement>('handle-id'),
  targetId: byId<HTMLInputElement>('target-id'),
  eventLog: byId<HTMLElement>('event-log'),
  eventCount: byId<HTMLElement>('event-count'),
  historyState: byId<HTMLElement>('history-state'),
  frameCounter: byId<HTMLElement>('frame-counter'),
  viewportSize: byId<HTMLElement>('viewport-size'),
  viewportZoom: byId<HTMLElement>('viewport-zoom'),
  viewportCenter: byId<HTMLElement>('viewport-center'),
  objectCount: byId<HTMLElement>('object-count'),
  frameReadout: byId<HTMLElement>('frame-readout'),
  stageError: byId<HTMLElement>('stage-error'),
  stageErrorMessage: byId<HTMLElement>('stage-error-message'),
  stageErrorStack: byId<HTMLElement>('stage-error-stack'),
  manualPrompt: byId<HTMLElement>('manual-prompt'),
  manualPromptTitle: byId<HTMLElement>('manual-prompt-title'),
  manualPromptCopy: byId<HTMLElement>('manual-prompt-copy'),
  sandboxJson: byId<HTMLTextAreaElement>('sandbox-json'),
  sandboxPath: byId<HTMLInputElement>('sandbox-path'),
  sandboxStrategy: byId<HTMLSelectElement>('sandbox-strategy'),
  sandboxChanges: byId<HTMLTextAreaElement>('sandbox-changes'),
  canvasStage: byId<HTMLElement>('canvas-stage'),
  canvasBackground: byId<HTMLInputElement>('canvas-background'),
  gridOverlay: byId<HTMLInputElement>('grid-overlay'),
  pauseAnimation: document.querySelector<HTMLElement>('[data-testid="pause-animation"]'),
  sessionClock: byId<HTMLElement>('session-clock'),
};

const persistStatuses = (): void => {
  localStorage.setItem(CASE_STATUS_KEY, JSON.stringify(Object.fromEntries(caseStatuses)));
};

const setStatusChip = (element: HTMLElement, status: LabRunStatus): void => {
  element.className = `status-chip ${statusClass(status)}`;
  element.textContent = statusLabel(status);
};

const deriveCaseStatus = (testCase: LabCase): LabRunStatus => {
  const results = caseStepResults.get(testCase.id);
  if (!results || results.size === 0) return caseStatuses.get(testCase.id) ?? 'not-run';
  const values = [...results.values()];
  if (values.some((result) => result.status === 'fail')) return 'fail';
  if (testCase.evidenceStatus === 'pending') return 'pending';
  if (
    testCase.evidenceStatus === 'partial' ||
    testCase.evidenceStatus === 'manual' ||
    values.some((result) => result.status === 'partial' || result.status === 'pending')
  ) {
    return 'partial';
  }
  return results.size === testCase.steps.length ? 'pass' : 'running';
};

const updateUrl = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('case', activeCase.id);
  if (activeStepIndex >= 0) url.searchParams.set('step', String(activeStepIndex));
  else url.searchParams.delete('step');
  history.replaceState(null, '', url);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ caseId: activeCase.id, step: activeStepIndex }));
};

const filteredCases = (): LabCase[] => {
  const query = elements.caseSearch.value.trim().toLocaleLowerCase();
  const category = elements.categoryFilter.value;
  const status = elements.statusFilter.value;
  const risk = elements.riskFilter.value;
  return LAB_CASES.filter((testCase) => {
    const searchable = [
      testCase.id,
      testCase.title,
      testCase.description,
      testCase.category,
      testCase.risk,
      ...testCase.tags,
      ...(testCase.oracleQuestions ?? []),
    ]
      .join(' ')
      .toLocaleLowerCase();
    const caseStatus = deriveCaseStatus(testCase);
    return (
      (!query || searchable.includes(query)) &&
      (category === 'all' || testCase.category === category) &&
      (status === 'all' || caseStatus === status || (status === 'not-run' && caseStatus === 'running')) &&
      (risk === 'all' || testCase.risk === risk)
    );
  });
};

const renderCatalog = (): void => {
  const cases = filteredCases();
  elements.caseCount.textContent = `${cases.length} / ${LAB_CASE_COUNTS.cases}`;
  const fragment = document.createDocumentFragment();
  let lastCategory = '';
  for (const testCase of cases) {
    if (testCase.category !== lastCategory) {
      const label = document.createElement('div');
      label.className = 'case-group-label';
      label.innerHTML = `<span>${titleCase(testCase.category)}</span><span>${cases.filter((entry) => entry.category === testCase.category).length}</span>`;
      fragment.append(label);
      lastCategory = testCase.category;
    }
    const status = deriveCaseStatus(testCase);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'case-row';
    row.dataset.testid = 'case-row';
    row.dataset.caseId = testCase.id;
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-current', String(testCase.id === activeCase.id));

    const lamp = document.createElement('span');
    lamp.className = `case-status-lamp ${status}`;
    lamp.title = statusLabel(status);

    const copy = document.createElement('span');
    copy.className = 'case-row-copy';
    const title = document.createElement('strong');
    title.textContent = testCase.title;
    const description = document.createElement('span');
    description.textContent = `${testCase.id} · ${testCase.description}`;
    copy.append(title, description);

    const meta = document.createElement('span');
    meta.className = 'case-meta';
    const riskLabel = document.createElement('span');
    riskLabel.className = `risk-${testCase.risk}`;
    riskLabel.textContent = testCase.risk.toUpperCase();
    const evidence = document.createElement('span');
    evidence.className = testCase.evidenceStatus === 'partial' ? 'known-partial' : '';
    evidence.textContent = testCase.evidenceStatus.toUpperCase();
    meta.append(riskLabel, evidence);
    row.append(lamp, copy, meta);
    row.addEventListener('click', () => runUiTask(() => selectCase(testCase)));
    fragment.append(row);
  }
  if (cases.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-log';
    empty.textContent = 'No cases match the active filters.';
    fragment.append(empty);
  }
  elements.caseList.replaceChildren(fragment);

  const statuses = LAB_CASES.map(deriveCaseStatus);
  elements.passedCount.textContent = String(statuses.filter((status) => status === 'pass').length);
  elements.failedCount.textContent = String(statuses.filter((status) => status === 'fail').length);
  elements.partialCount.textContent = String(
    statuses.filter((status) => status === 'partial' || status === 'pending').length,
  );
};

const renderStepRail = (): void => {
  const results = caseStepResults.get(activeCase.id);
  elements.stepRail.replaceChildren(
    ...activeCase.steps.map((step, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'step-dot';
      button.dataset.testid = 'step-button';
      button.dataset.stepId = step.id;
      button.dataset.stepIndex = String(index);
      button.title = `${index + 1}. ${step.title}`;
      button.setAttribute('aria-label', button.title);
      if (index === activeStepIndex) button.classList.add('active');
      const result = results?.get(index);
      if (result?.status === 'fail') button.classList.add('fail');
      else if (result) button.classList.add('complete');
      button.dataset.status = result?.status ?? 'not-run';
      button.addEventListener('click', () => {
        if (!busy && !runtime.hasManualPending) runUiTask(() => replayToStep(index));
      });
      return button;
    }),
  );
};

const renderAssertion = (assertion: LabAssertionResult): HTMLElement => {
  const row = document.createElement('div');
  row.className = `assertion-row${assertion.pass ? '' : ' fail'}${assertion.invariant.normative ? '' : ' informational'}`;
  row.dataset.testid = 'assertion-row';
  row.dataset.assertionId = assertion.invariant.id;
  row.dataset.status = assertion.pass ? 'pass' : 'fail';
  const lamp = document.createElement('i');
  const copy = document.createElement('div');
  const label = document.createElement('strong');
  label.textContent = assertion.invariant.label;
  const detail = document.createElement('code');
  detail.textContent = `${assertion.invariant.path} → ${compactValue(assertion.actual)}`;
  copy.append(label, detail);
  const status = document.createElement('em');
  status.textContent = assertion.invariant.normative
    ? assertion.pass ? 'PASS' : 'FAIL'
    : 'INFO';
  row.append(lamp, copy, status);
  return row;
};

const shallowDiff = (observation: Record<string, unknown>): { text: string; count: number } => {
  const before = readPath(observation, 'before.scene.byId');
  const after = readPath(observation, 'scene.byId');
  if (!isRecord(before) || !isRecord(after)) return { text: 'No structural baseline recorded.', count: 0 };
  const beforeIds = new Set(Object.keys(before));
  const afterIds = new Set(Object.keys(after));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  const changed = [...afterIds].filter((id) => {
    if (!beforeIds.has(id)) return false;
    return formatJson(before[id]) !== formatJson(after[id]);
  });
  const lines = [
    `+ ADDED (${added.length}) ${added.slice(0, 24).join(', ') || '—'}`,
    `- REMOVED (${removed.length}) ${removed.slice(0, 24).join(', ') || '—'}`,
    `~ CHANGED (${changed.length}) ${changed.slice(0, 24).join(', ') || '—'}`,
  ];
  if (added.length + removed.length + changed.length === 0) lines.push('= Public structure unchanged.');
  return { text: lines.join('\n'), count: added.length + removed.length + changed.length };
};

const renderEvents = (): void => {
  const records = runtime.events.slice(-60).reverse();
  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-log';
    empty.textContent = 'No public events captured.';
    elements.eventLog.replaceChildren(empty);
  } else {
    elements.eventLog.replaceChildren(
      ...records.map((record) => {
        const row = document.createElement('div');
        row.className = 'event-row';
        row.dataset.testid = 'event-row';
        row.dataset.eventType = record.type;
        const time = document.createElement('time');
        time.textContent = `+${record.timestamp.toFixed(1)}ms`;
        const type = document.createElement('strong');
        type.textContent = record.type;
        const payload = document.createElement('span');
        payload.textContent = `${record.target ?? '—'} ${compactValue(record.payload, 70)}`;
        payload.title = formatJson(record.payload);
        row.append(time, type, payload);
        return row;
      }),
    );
  }
  elements.eventCount.textContent = `${runtime.events.length} events`;
};

const sceneDiffActionKinds = new Set([
  'draw',
  'draw-inline',
  'draw-invalid',
  'update',
  'history',
  'lifecycle',
  'rotation',
  'flip',
  'transformer',
  'sandbox-draw',
  'sandbox-update',
]);

const renderFrameTelemetry = (): void => {
  elements.frameReadout.textContent = String(runtime.frameCount);
  elements.frameCounter.textContent = `${runtime.renderCount} / ${runtime.frameCount}`;
};

const renderTelemetry = (providedObservation?: Record<string, unknown>): void => {
  const observation = providedObservation ?? runtime.observation();
  const scene = runtime.sceneDisplaySnapshot(observation);
  const selected = runtime.selectedDisplaySnapshot(observation);
  const history = readPath(observation, 'history');
  const viewport = readPath(observation, 'viewport');
  const renderer = readPath(observation, 'renderer.screen');
  const handleCount = readPath(observation, 'scene.handleCount');
  const numericHandleCount = typeof handleCount === 'number' ? handleCount : 0;
  const zoom = isRecord(viewport) && typeof viewport.scale === 'number' ? viewport.scale : null;
  const center = isRecord(viewport) && isRecord(viewport.center) ? viewport.center : null;

  elements.sceneSnapshot.textContent = formatJson(scene);
  elements.snapshotCount.textContent = `${numericHandleCount} nodes`;
  elements.selectedHandle.textContent = formatJson(selected);
  const selectedId = isRecord(selected) && typeof selected.id === 'string' ? selected.id : null;
  elements.handleId.textContent = selectedId ?? 'none';
  if (selectedId && document.activeElement !== elements.targetId) elements.targetId.value = selectedId;
  elements.objectCount.textContent = String(numericHandleCount);
  elements.viewportZoom.textContent = zoom === null ? '—' : `${zoom.toFixed(3)}×`;
  elements.viewportCenter.textContent = center && typeof center.x === 'number' && typeof center.y === 'number'
    ? `${center.x.toFixed(1)}, ${center.y.toFixed(1)}`
    : '—';
  elements.viewportSize.textContent = isRecord(renderer) &&
    typeof renderer.width === 'number' && typeof renderer.height === 'number'
    ? `${Math.round(renderer.width)}×${Math.round(renderer.height)}`
    : '—';
  renderFrameTelemetry();
  const commandCount = isRecord(history) && typeof history.commandCount === 'number'
    ? history.commandCount
    : 0;
  elements.historyState.textContent = isRecord(history)
    ? `UNDO ${history.canUndo ? 1 : 0} / REDO ${history.canRedo ? 1 : 0} · ${commandCount} CMD`
    : 'UNDO 0 / REDO 0';
  renderEvents();

  const diffSource = activeResult?.observation ?? standaloneObservation;
  if (diffSource) {
    const actionKind = activeCase.steps[activeStepIndex]?.action.kind;
    const shouldDiff = standaloneObservation === diffSource ||
      (actionKind !== undefined && sceneDiffActionKinds.has(actionKind));
    const diff = shouldDiff
      ? shallowDiff(diffSource)
      : { text: '= This step does not mutate public scene structure.', count: 0 };
    elements.structuralDiff.textContent = diff.text;
    elements.diffCount.textContent = `${diff.count} Δ`;
  } else {
    elements.structuralDiff.textContent = 'No structural baseline recorded.';
    elements.diffCount.textContent = '0 Δ';
  }
};

const scheduleTelemetry = (observation?: Record<string, unknown>): void => {
  if (observation) {
    pendingTelemetryObservation = observation;
    telemetryNeedsFreshObservation = false;
  } else {
    pendingTelemetryObservation = null;
    telemetryNeedsFreshObservation = true;
  }
  if (telemetryTimer) return;
  telemetryTimer = window.setTimeout(() => {
    telemetryTimer = 0;
    const pending = telemetryNeedsFreshObservation ? undefined : pendingTelemetryObservation ?? undefined;
    pendingTelemetryObservation = null;
    telemetryNeedsFreshObservation = false;
    renderTelemetry(pending);
  }, 100);
};

const scheduleFrameTelemetry = (): void => {
  if (frameTelemetryTimer) return;
  frameTelemetryTimer = window.setTimeout(() => {
    frameTelemetryTimer = 0;
    renderFrameTelemetry();
  }, 250);
};

const renderActive = (): void => {
  const status = deriveCaseStatus(activeCase);
  elements.activeCaseCode.textContent = activeCase.id.toUpperCase();
  elements.activeCaseTitle.textContent = activeCase.title;
  setStatusChip(elements.activeCaseStatus, status);
  const step = activeCase.steps[activeStepIndex];
  elements.stepIndex.textContent = `STEP ${String(Math.max(0, activeStepIndex + 1)).padStart(2, '0')} / ${String(activeCase.steps.length).padStart(2, '0')}`;
  elements.stepTitle.textContent = step?.title ?? 'Ready for isolated reset';
  elements.stepDescription.textContent = step?.description ?? activeCase.description;
  const inputText = formatJson(step?.action ?? { case: activeCase.id, action: 'awaiting step' });
  elements.stepInput.textContent = inputText;
  elements.inputSize.textContent = `${new Blob([inputText]).size} B`;

  const resultStatus = activeResult?.status ?? 'not-run';
  elements.resultLabel.textContent = activeResult
    ? `${activeResult.assertions.filter((assertion) => assertion.pass).length}/${activeResult.assertions.length} invariants · action ${activeResult.timing.actionMs.toFixed(1)}ms · lab ${activeResult.timing.diagnosticsMs.toFixed(1)}ms`
    : 'NOT RUN';
  setStatusChip(elements.resultStatus, resultStatus);
  if (activeResult?.assertions.length) {
    elements.assertionList.replaceChildren(...activeResult.assertions.map(renderAssertion));
  } else {
    const empty = document.createElement('p');
    empty.textContent = 'No public invariants evaluated.';
    elements.assertionList.replaceChildren(empty);
  }

  const error = activeResult?.error ?? controlError;
  elements.stageError.hidden = !error;
  if (error) {
    elements.stageErrorMessage.textContent = `${error.name}: ${error.message}`;
    elements.stageErrorStack.textContent = error.stack;
  }
  renderStepRail();
  renderCatalog();
  scheduleTelemetry(activeResult?.observation ?? standaloneObservation ?? undefined);
};

const setBusy = (value: boolean): void => {
  busy = value;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-testid="reset-case"], [data-testid="draw-case"], [data-testid="prev-step"], [data-testid="next-step"], [data-testid="run-case"], [data-testid="run-category"]',
  )) {
    button.disabled = value;
  }
  document.body.classList.toggle('is-busy', value);
};

const runUiTask = (task: () => void | Promise<void>): void => {
  controlError = null;
  if (!activeResult?.error) elements.stageError.hidden = true;
  void Promise.resolve()
    .then(task)
    .catch((error: unknown) => {
      controlError = toAppOwnedError(error);
      renderActive();
    });
};

const recordStepResult = (index: number, result: LabStepResult): void => {
  const results = caseStepResults.get(activeCase.id) ?? new Map<number, LabStepResult>();
  results.set(index, result);
  caseStepResults.set(activeCase.id, results);
  const status = deriveCaseStatus(activeCase);
  caseStatuses.set(activeCase.id, status);
  persistStatuses();
};

const executeStep = async (index: number): Promise<LabStepResult | null> => {
  const step = activeCase.steps[index];
  if (!step) return null;
  activeStepIndex = index;
  activeResult = await runtime.executeStep(activeCase, step);
  standaloneObservation = null;
  recordStepResult(index, activeResult);
  updateUrl();
  renderActive();
  return activeResult;
};

const resetActiveCase = async (): Promise<void> => {
  if (busy) return;
  setBusy(true);
  try {
    await runtime.reset();
    activeStepIndex = -1;
    activeResult = null;
    standaloneObservation = null;
    caseStepResults.delete(activeCase.id);
    caseStatuses.set(activeCase.id, 'not-run');
    persistStatuses();
    elements.manualPrompt.hidden = true;
    updateUrl();
    renderActive();
  } finally {
    setBusy(false);
  }
};

const replayToStep = async (targetIndex: number): Promise<void> => {
  setBusy(true);
  try {
    activeResult = null;
    standaloneObservation = null;
    activeStepIndex = -1;
    caseStepResults.set(activeCase.id, new Map());
    if (targetIndex < 0 || activeCase.steps[0]?.action.kind !== 'reset') {
      await runtime.reset();
    }
    if (targetIndex >= 0) {
      for (let index = 0; index <= targetIndex; index += 1) {
        await executeStep(index);
        if (runtime.hasManualPending) break;
      }
    } else {
      renderActive();
    }
  } finally {
    setBusy(false);
  }
};

const runCase = async (): Promise<void> => {
  if (busy) return;
  setBusy(true);
  try {
    activeResult = null;
    standaloneObservation = null;
    activeStepIndex = -1;
    caseStepResults.set(activeCase.id, new Map());
    caseStatuses.set(activeCase.id, 'running');
    if (activeCase.steps[0]?.action.kind !== 'reset') await runtime.reset();
    for (let index = 0; index < activeCase.steps.length; index += 1) {
      const result = await executeStep(index);
      if (result?.status === 'fail' || runtime.hasManualPending) break;
    }
    const status = deriveCaseStatus(activeCase);
    caseStatuses.set(activeCase.id, status);
    persistStatuses();
    renderActive();
  } finally {
    setBusy(false);
  }
};

const runCategory = async (): Promise<void> => {
  if (busy) return;
  const category = activeCase.category;
  const categoryCases = LAB_CASES.filter((testCase) => testCase.category === category);
  setBusy(true);
  try {
    for (const testCase of categoryCases) {
      activeCase = testCase;
      activeResult = null;
      standaloneObservation = null;
      activeStepIndex = -1;
      caseStepResults.set(testCase.id, new Map());
      if (testCase.steps[0]?.action.kind !== 'reset') await runtime.reset();
      for (let index = 0; index < testCase.steps.length; index += 1) {
        const result = await executeStep(index);
        if (result?.status === 'fail' || runtime.hasManualPending) break;
      }
      caseStatuses.set(testCase.id, deriveCaseStatus(testCase));
      persistStatuses();
      if (runtime.hasManualPending) return;
    }
    updateUrl();
    renderActive();
  } finally {
    setBusy(false);
  }
};

const drawActiveCase = async (): Promise<void> => {
  const drawIndex = activeCase.steps.findIndex(
    (step) => step.action.kind === 'draw' || step.action.kind === 'draw-inline',
  );
  await replayToStep(drawIndex >= 0 ? drawIndex : 0);
};

const selectCase = async (testCase: LabCase): Promise<void> => {
  if (busy || testCase.id === activeCase.id) return;
  activeCase = testCase;
  activeStepIndex = -1;
  activeResult = null;
  standaloneObservation = null;
  await runtime.reset();
  updateUrl();
  renderActive();
};

const showManualPrompt = (request: ManualObservationRequest): void => {
  elements.manualPromptTitle.textContent = request.title;
  elements.manualPromptCopy.textContent = `${request.instruction} · Completion mode: ${request.completion}. This observation cannot promote an Oracle partial or Windows pending case.`;
  elements.manualPrompt.hidden = false;
};

const copyReport = async (): Promise<void> => {
  const text = formatJson(runtime.report(activeCase, activeResult));
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  const button = byId<HTMLButtonElement>('copy-report');
  const prior = button.textContent;
  button.textContent = 'Copied';
  window.setTimeout(() => { button.textContent = prior; }, 900);
};

const captureCanvas = async (): Promise<void> => {
  const canvas = runtime.patchmap.app?.canvas;
  if (!canvas) return;
  runtime.patchmap.app?.render();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas screenshot could not be encoded.');
  const link = document.createElement('a');
  link.download = `patch-map-${activeCase.id}-step-${Math.max(0, activeStepIndex + 1)}.png`;
  link.href = URL.createObjectURL(blob);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const applyViewportPreset = (button: HTMLButtonElement): void => {
  const [widthText, heightText] = button.dataset.viewport?.split('x') ?? [];
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  runtime.patchmap.app?.renderer.resize(width, height);
  runtime.patchmap.viewport?.resize(width, height);
  for (const candidate of document.querySelectorAll<HTMLButtonElement>('[data-viewport]')) {
    candidate.classList.toggle('is-active', candidate === button);
  }
  scheduleTelemetry();
};

const configureControls = (): void => {
  document.querySelector<HTMLButtonElement>('[data-testid="reset-case"]')?.addEventListener('click', () => runUiTask(resetActiveCase));
  document.querySelector<HTMLButtonElement>('[data-testid="draw-case"]')?.addEventListener('click', () => runUiTask(drawActiveCase));
  document.querySelector<HTMLButtonElement>('[data-testid="prev-step"]')?.addEventListener('click', () => runUiTask(() => replayToStep(Math.max(-1, activeStepIndex - 1))));
  document.querySelector<HTMLButtonElement>('[data-testid="next-step"]')?.addEventListener('click', () => {
    if (busy || runtime.hasManualPending) return;
    const next = Math.min(activeCase.steps.length - 1, activeStepIndex + 1);
    if (next >= 0) runUiTask(() => executeStep(next).then(() => undefined));
  });
  document.querySelector<HTMLButtonElement>('[data-testid="run-case"]')?.addEventListener('click', () => runUiTask(runCase));
  document.querySelector<HTMLButtonElement>('[data-testid="run-category"]')?.addEventListener('click', () => runUiTask(runCategory));
  document.querySelector<HTMLButtonElement>('[data-testid="fit-view"]')?.addEventListener('click', () => runUiTask(() => runtime.fitSelected()));
  document.querySelector<HTMLButtonElement>('[data-testid="focus-view"]')?.addEventListener('click', () => runUiTask(() => runtime.focusSelected()));
  document.querySelector<HTMLButtonElement>('[data-testid="capture-canvas"]')?.addEventListener('click', () => runUiTask(captureCanvas));
  document.querySelector<HTMLButtonElement>('[data-testid="pause-animation"]')?.addEventListener('click', () => runUiTask(() => {
    const paused = runtime.toggleAnimation();
    if (elements.pauseAnimation) elements.pauseAnimation.textContent = paused ? 'Resume animation' : 'Pause animation';
  }));
  byId<HTMLButtonElement>('copy-report').addEventListener('click', () => runUiTask(copyReport));
  byId<HTMLButtonElement>('inspect-target').addEventListener('click', () => runUiTask(() => {
    runtime.selectHandle(elements.targetId.value.trim());
    scheduleTelemetry();
  }));
  byId<HTMLButtonElement>('manual-observed').addEventListener('click', () => {
    const step = activeCase.steps[activeStepIndex];
    if (step && runtime.hasManualPending) {
      activeResult = runtime.completeManualStep(activeCase, step);
      standaloneObservation = null;
      recordStepResult(activeStepIndex, activeResult);
    }
    elements.manualPrompt.hidden = true;
    renderActive();
  });
  byId<HTMLButtonElement>('manual-skip').addEventListener('click', () => {
    runtime.skipManualStep();
    elements.manualPrompt.hidden = true;
    renderActive();
  });

  for (const input of [elements.caseSearch, elements.categoryFilter, elements.statusFilter, elements.riskFilter]) {
    input.addEventListener('input', renderCatalog);
    input.addEventListener('change', renderCatalog);
  }
  elements.gridOverlay.addEventListener('change', () => {
    elements.canvasStage.classList.toggle('grid-visible', elements.gridOverlay.checked);
  });
  elements.canvasBackground.addEventListener('input', () => {
    elements.canvasStage.style.backgroundColor = elements.canvasBackground.value;
    const renderer = runtime.patchmap.app?.renderer as unknown as {
      background?: { color: string };
    } | undefined;
    if (renderer?.background) renderer.background.color = elements.canvasBackground.value;
    runtime.patchmap.app?.render();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-viewport]')) {
    button.addEventListener('click', () => runUiTask(() => applyViewportPreset(button)));
  }

  document.querySelector<HTMLButtonElement>('[data-testid="sandbox-draw"]')?.addEventListener('click', () => {
    runUiTask(async () => {
      const value = safeParse(elements.sandboxJson.value, 'Draw JSON');
      await runtime.reset();
      await runtime.drawSandbox(value);
      activeResult = null;
      standaloneObservation = runtime.observation();
      renderActive();
    });
  });
  byId<HTMLButtonElement>('sandbox-pretty').addEventListener('click', () => runUiTask(() => {
    elements.sandboxJson.value = formatJson(safeParse(elements.sandboxJson.value, 'Draw JSON'));
  }));
  document.querySelector<HTMLButtonElement>('[data-testid="sandbox-update"]')?.addEventListener('click', () => {
    runUiTask(async () => {
      const changes = safeParse(elements.sandboxChanges.value, 'Changes JSON');
      if (!isRecord(changes)) throw new TypeError('Changes JSON must be an object.');
      await runtime.updateSandbox({
        target: { mode: 'path', path: elements.sandboxPath.value },
        changes,
        mergeStrategy: elements.sandboxStrategy.value === 'replace' ? 'replace' : 'merge',
      });
      activeResult = null;
      standaloneObservation = runtime.observation();
      renderActive();
    });
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (event.key === 'Escape') target.blur();
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      elements.caseSearch.focus();
    } else if (event.key.toLocaleLowerCase() === 'r') {
      runUiTask(resetActiveCase);
    } else if (event.key.toLocaleLowerCase() === 'd') {
      runUiTask(drawActiveCase);
    } else if (event.key === 'ArrowRight') {
      if (runtime.hasManualPending) return;
      const next = Math.min(activeCase.steps.length - 1, activeStepIndex + 1);
      if (next >= 0) runUiTask(() => executeStep(next).then(() => undefined));
    } else if (event.key === 'ArrowLeft') {
      runUiTask(() => replayToStep(Math.max(-1, activeStepIndex - 1)));
    }
  });
};

const restoreSelection = (): { testCase: LabCase; step: number } => {
  const url = new URL(window.location.href);
  const requestedCase = url.searchParams.get('case');
  const requestedStep = Number(url.searchParams.get('step') ?? '-1');
  let stored: { caseId?: string; step?: number } = {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (isRecord(value)) {
      stored = {
        ...(typeof value.caseId === 'string' ? { caseId: value.caseId } : {}),
        ...(typeof value.step === 'number' ? { step: value.step } : {}),
      };
    }
  } catch {
    stored = {};
  }
  const testCase = LAB_CASE_BY_ID.get(requestedCase ?? stored.caseId ?? '') ?? LAB_CASES[0] as LabCase;
  const step = Number.isInteger(requestedStep) && requestedStep >= 0
    ? Math.min(requestedStep, testCase.steps.length - 1)
    : -1;
  return { testCase, step };
};

const initialize = async (): Promise<void> => {
  for (const category of Object.keys(LAB_CASE_COUNTS.categories)) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = titleCase(category).toUpperCase();
    elements.categoryFilter.append(option);
  }
  elements.sandboxJson.value = formatJson(LAB_FIXTURES['all-elements'].data);
  elements.sandboxPath.value = '$..children[?(@.id==="element-rect")]';
  runtime.sandboxDrawProvider = () => safeParse(elements.sandboxJson.value, 'Draw JSON');
  runtime.sandboxUpdateProvider = () => {
    const changes = safeParse(elements.sandboxChanges.value, 'Changes JSON');
    if (!isRecord(changes)) throw new TypeError('Changes JSON must be an object.');
    return {
      target: { mode: 'path', path: elements.sandboxPath.value },
      changes,
      mergeStrategy: elements.sandboxStrategy.value === 'replace' ? 'replace' : 'merge',
    };
  };
  runtime.onManual = showManualPrompt;
  runtime.onChange = scheduleTelemetry;
  runtime.onFrame = scheduleFrameTelemetry;
  configureControls();

  const restored = restoreSelection();
  activeCase = restored.testCase;
  await runtime.initialize();
  renderActive();
  if (restored.step >= 0) await replayToStep(restored.step);

  sessionStarted = performance.now();
  window.setInterval(() => {
    const elapsed = performance.now() - sessionStarted;
    const hours = Math.floor(elapsed / 3_600_000);
    const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
    const seconds = Math.floor((elapsed % 60_000) / 1000);
    const milliseconds = Math.floor(elapsed % 1000);
    elements.sessionClock.textContent = [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':') + `.${String(milliseconds).padStart(3, '0')}`;
  }, 100);
};

window.addEventListener('beforeunload', () => {
  runtime.onChange = null;
  runtime.onFrame = null;
  if (telemetryTimer) window.clearTimeout(telemetryTimer);
  if (frameTelemetryTimer) window.clearTimeout(frameTelemetryTimer);
  telemetryTimer = 0;
  frameTelemetryTimer = 0;
  pendingTelemetryObservation = null;
  telemetryNeedsFreshObservation = false;
  runtime.destroy();
});

void initialize().catch((error: unknown) => {
  const value = toAppOwnedError(error);
  elements.stageError.hidden = false;
  elements.stageErrorMessage.textContent = `${value.name}: ${value.message}`;
  elements.stageErrorStack.textContent = value.stack;
  throw error;
});
