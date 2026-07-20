import {
  createNotImplementedCoreV2ContractLabBridge,
  type CoreV2ContractLabBridgeV1,
} from './bridge';
import { createCoreV2ExecutableLabBridge } from './executable-bridge';
import { isCoreV2ExecutableCaseId } from './executable-cases';
import { CORE_V2_CONTRACT_PRESENTERS } from './presenters';
import {
  buildCoreV2ContractRoute,
  CORE_V2_CONTRACT_DATASET_SIZES,
  CoreV2ContractRouteError,
  parseCoreV2ContractSeed,
  parseCoreV2ContractRoute,
  type CoreV2ContractRoute,
} from './route';

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_CONTRACT_LAB__?: CoreV2ContractLabBridgeV1;
  }
}

export interface CoreV2ContractLabMount {
  readonly route: CoreV2ContractRoute | null;
  readonly bridge: CoreV2ContractLabBridgeV1 | null;
  readonly routeError: CoreV2ContractRouteError | null;
  destroy(): Promise<void>;
}

interface CoreV2ContractUiRunMetrics {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly maxFrameGapMs: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
}

const REN_005_SPECIMENS = Object.freeze([
  Object.freeze({ id: 'alias', label: 'Alias' }),
  Object.freeze({ id: 'url', label: 'Direct URL' }),
  Object.freeze({ id: 'descriptor', label: 'Descriptor replacement' }),
  Object.freeze({ id: 'data-uri', label: 'Data URI' }),
  Object.freeze({ id: 'transformed', label: 'Transformed shared source' }),
  Object.freeze({ id: 'hidden-image', label: 'Hidden image' }),
  Object.freeze({ id: 'failed-image', label: 'Failed placeholder' }),
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scenarioList(route: CoreV2ContractRoute): string {
  return CORE_V2_CONTRACT_PRESENTERS.map((presenter) => {
    const href = buildCoreV2ContractRoute(presenter.caseId, route.size, route.seed);
    const selected = presenter.caseId === route.scenario;
    const searchText = `${presenter.caseId} ${presenter.title} ${presenter.priority}`.toLowerCase();
    return `<a class="contract-scenario-link${selected ? ' is-selected' : ''}" href="${href}" data-scenario-index="${escapeHtml(searchText)}"${selected ? ' aria-current="page"' : ''}><span>${presenter.caseId}</span><strong>${escapeHtml(presenter.title)}</strong><small>${presenter.priority}</small></a>`;
  }).join('');
}

function actionControls(route: CoreV2ContractRoute, executable: boolean): string {
  return route.presenter.actions.map((action) => {
    const primary = action.primaryTestId === null
      ? ''
      : ` data-testid="${action.primaryTestId}"`;
    const actionStatus = executable ? 'queued' : 'not-implemented';
    return `<div class="contract-case-action" data-testid="${action.actionTestId}" data-action-index="${action.index}" data-action-status="${actionStatus}"><span>${String(action.index + 1).padStart(2, '0')}</span><button type="button"${primary} disabled aria-disabled="true">${escapeHtml(action.label)}</button><code>${escapeHtml(action.handlerId)}</code><output data-action-result>${actionStatus}</output></div>`;
  }).join('');
}

function renderRen005Inspector(route: CoreV2ContractRoute): string {
  if (route.scenario !== 'REN-005') return '';
  const options = REN_005_SPECIMENS.map(({ id, label }) => (
    `<option value="${id}"${id === 'descriptor' ? ' selected' : ''}>${label}</option>`
  )).join('');
  return `<section class="contract-image-inspector" data-testid="ren-005-image-inspector" data-observation-status="queued" aria-labelledby="ren-005-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-005 actual observer</span><h3 id="ren-005-inspector-title">Image source and lifecycle facts</h3></div>
      <label>Specimen<select data-testid="ren-005-specimen-select">${options}</select></label>
    </div>
    <p class="contract-image-observer-note">This chooser changes only the displayed actual facts. It never adds, removes, reorders, or repeats the approved four actions.</p>
    <div class="contract-image-facts" data-testid="ren-005-selected-facts">
      <dl>
        <div><dt>Source</dt><dd data-testid="ren-005-selected-source">not observed</dd></div>
        <div><dt>Source kind</dt><dd data-testid="ren-005-selected-source-kind">not observed</dd></div>
        <div><dt>State</dt><dd data-testid="ren-005-selected-state">not observed</dd></div>
        <div><dt>Role</dt><dd data-testid="ren-005-selected-role">not observed</dd></div>
        <div><dt>World bounds</dt><dd data-testid="ren-005-selected-bounds">not observed</dd></div>
        <div><dt>Initial source</dt><dd data-testid="ren-005-selected-initial-source">not observed</dd></div>
        <div><dt>Initial state</dt><dd data-testid="ren-005-selected-initial-state">not observed</dd></div>
        <div><dt>Stale attach</dt><dd data-testid="ren-005-selected-stale-attach">not observed</dd></div>
        <div><dt>Stale completion</dt><dd data-testid="ren-005-selected-stale-completion">not observed</dd></div>
        <div><dt>Diagnostics</dt><dd data-testid="ren-005-selected-diagnostics">not observed</dd></div>
      </dl>
    </div>
    <div class="contract-image-ledger" aria-label="Image asset counters">
      <dl>
        <div><dt>Requests</dt><dd data-testid="ren-005-request-count">not observed</dd></div>
        <div><dt>Backend</dt><dd data-testid="ren-005-backend-counts">not observed</dd></div>
        <div><dt>Resources</dt><dd data-testid="ren-005-resource-count">not observed</dd></div>
        <div><dt>Leases</dt><dd data-testid="ren-005-lease-count">not observed</dd></div>
        <div><dt>Stale</dt><dd data-testid="ren-005-stale-count">not observed</dd></div>
        <div><dt>Pending release</dt><dd data-testid="ren-005-pending-release-count">not observed</dd></div>
      </dl>
      <div class="contract-request-journal">
        <h4>Request journal</h4>
        <ol data-testid="ren-005-request-journal"><li data-testid="ren-005-request-journal-empty">Run the exact case to inspect requests.</li></ol>
      </div>
    </div>
    <div class="contract-run-observer" data-testid="ren-005-run-observation">
      <div><span class="contract-kicker">Per-run main-thread observation</span><p>FPS and frame gaps use requestAnimationFrame; long tasks use the browser Long Tasks API when available.</p></div>
      <dl>
        <div><dt>Run</dt><dd data-testid="ren-005-run-index">not observed</dd></div>
        <div><dt>FPS</dt><dd data-testid="ren-005-run-fps">not observed</dd></div>
        <div><dt>Frames</dt><dd data-testid="ren-005-run-frame-count">not observed</dd></div>
        <div><dt>Max frame gap</dt><dd data-testid="ren-005-run-max-frame-gap">not observed</dd></div>
        <div><dt>Long tasks</dt><dd data-testid="ren-005-run-long-task-count">not observed</dd></div>
        <div><dt>Duration</dt><dd data-testid="ren-005-run-duration">not observed</dd></div>
      </dl>
      <ol class="contract-performance-journal" data-testid="ren-005-performance-journal"></ol>
    </div>
  </section>`;
}

export function renderCoreV2ContractLab(route: CoreV2ContractRoute): string {
  const presenter = route.presenter;
  const executable = presenter.executionStatus === 'actual-observable';
  const initialStatus = executable ? 'armed' : 'not-implemented';
  const statusLabel = executable ? 'Ready to observe' : 'Not implemented';
  const sizeOptions = CORE_V2_CONTRACT_DATASET_SIZES.map((size) =>
    `<option value="${size}"${size === route.size ? ' selected' : ''}>${size}</option>`,
  ).join('');

  return `<main class="contract-lab-shell" data-testid="${presenter.rootTestId}" data-contract-status="${initialStatus}">
  <header class="contract-lab-header">
    <div><span class="contract-kicker">Core v2 functional contract</span><h1>${presenter.caseId} · ${escapeHtml(presenter.title)}</h1><p>${presenter.caseType} · ${presenter.priority} · selected case only</p></div>
    <strong class="contract-status" data-contract-status-label>${statusLabel}</strong>
  </header>
  <div class="contract-lab-layout">
    <aside class="contract-catalog" aria-label="Approved Core v2 scenarios">
      <label for="core-v2-contract-search">Find scenario</label>
      <input id="core-v2-contract-search" type="search" data-testid="scenario-search" autocomplete="off" placeholder="ID or title">
      <nav data-testid="scenario-list">${scenarioList(route)}</nav>
    </aside>
    <section class="contract-focus">
      <div class="contract-route-controls">
        <label>Dataset size<select data-testid="dataset-size">${sizeOptions}</select></label>
        <label>Seed<input data-testid="seed" inputmode="numeric" value="${route.seed}" pattern="(?:0|[1-9][0-9]*)"></label>
        <button type="button" data-testid="load-dataset"${executable ? '' : ' disabled'}>Run exact case</button>
        <button type="button" data-testid="reset-case" disabled>Reset case</button>
        <button type="button" data-testid="repeat-action" disabled>Repeat action</button>
        <button type="button" data-testid="copy-url">Copy URL</button>
      </div>
      <p class="contract-stub-notice">${executable
        ? 'Actual-only case execution is available on the PixiJS WebGL baseline. The canvas is transient and is removed by executor cleanup; this Lab reports observed or failed facts without an expected comparison.'
        : 'This approved route remains explicitly not implemented. No engine action, semantic observation, or promotion result is produced.'}</p>
      <section class="contract-case-card" aria-labelledby="contract-case-title">
        <span class="contract-kicker">Focused case</span>
        <h2 id="contract-case-title">${escapeHtml(presenter.title)}</h2>
        <p class="contract-instruction">${escapeHtml(presenter.instruction)}</p>
        <div class="contract-canvas" data-testid="canvas-host">
          <div data-testid="${presenter.gestureSurfaceTestId}" data-contract-surface aria-label="Core v2 contract case surface">
            <p data-canvas-lifetime>${executable
              ? 'PixiJS WebGL canvas mounts only while the exact executor owns a live engine.'
              : 'No canvas is allocated for a not-implemented route.'}</p>
          </div>
        </div>
        <div class="contract-actions" aria-label="Selected case action ownership">${actionControls(route, executable)}</div>
        ${renderRen005Inspector(route)}
      </section>
      <section class="contract-result-strip" data-testid="${presenter.resultTestId}" aria-live="polite">
        <dl><div><dt>Actions</dt><dd data-result-actions>${executable ? 'queued' : 'not run'}</dd></div><div><dt>Events</dt><dd data-result-events>not observed</dd></div><div><dt>Cleanup</dt><dd data-result-cleanup>not run</dd></div><div><dt>Observation</dt><dd data-result-observation>${initialStatus}</dd></div></dl>
        <p data-testid="${presenter.firstFailureTestId}">${executable
          ? 'Run the exact ordered case to inspect product, event, semantic, and cleanup facts.'
          : 'Action executor is not implemented; no actual observation exists.'}</p>
        <pre data-testid="${presenter.traceTestId}" hidden>${initialStatus}</pre>
      </section>
    </section>
  </div>
</main>`;
}

export function renderCoreV2ContractRouteError(error: CoreV2ContractRouteError): string {
  return `<main class="contract-lab-shell contract-route-error" data-testid="core-v2-contract-route-error" data-contract-status="invalid-route"><span class="contract-kicker">Core v2 functional contract</span><h1>Route cannot run</h1><p><strong>${error.code}</strong>: ${escapeHtml(error.message)}</p><p>This route is non-passing. Provide exactly scenario, size, and canonical uint32 seed parameters.</p></main>`;
}

function bindShell(
  target: HTMLElement,
  route: CoreV2ContractRoute,
  abortController: AbortController,
  bridge: CoreV2ContractLabBridgeV1,
  executable: boolean,
): void {
  const signal = abortController.signal;
  let navigationRequested = false;
  let uiRunSequence = 0;

  async function navigate(href: string): Promise<void> {
    if (navigationRequested) return;
    navigationRequested = true;
    try {
      await bridge.destroyCase();
    } finally {
      window.location.assign(href);
    }
  }

  const search = target.querySelector<HTMLInputElement>('[data-testid="scenario-search"]');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    for (const link of target.querySelectorAll<HTMLElement>('[data-scenario-index]')) {
      link.hidden = query.length > 0 && !(link.dataset.scenarioIndex ?? '').includes(query);
    }
  }, { signal });

  const copyUrl = target.querySelector<HTMLButtonElement>('[data-testid="copy-url"]');
  copyUrl?.addEventListener('click', () => {
    if (navigator.clipboard) {
      void navigator.clipboard
        .writeText(new URL(route.canonicalUrl, window.location.origin).href)
        .catch(() => undefined);
    }
  }, { signal });

  for (const link of target.querySelectorAll<HTMLAnchorElement>('[data-scenario-index]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void navigate(link.getAttribute('href') ?? link.href);
    }, { signal });
  }

  const size = target.querySelector<HTMLSelectElement>('[data-testid="dataset-size"]');
  size?.addEventListener('change', () => {
    const next = CORE_V2_CONTRACT_DATASET_SIZES.find((candidate) => candidate === size.value);
    if (next) void navigate(buildCoreV2ContractRoute(route.scenario, next, route.seed));
  }, { signal });

  const seed = target.querySelector<HTMLInputElement>('[data-testid="seed"]');
  seed?.addEventListener('change', () => {
    try {
      const nextSeed = parseCoreV2ContractSeed(seed.value);
      seed.setCustomValidity('');
      void navigate(buildCoreV2ContractRoute(route.scenario, route.size, nextSeed));
    } catch {
      seed.setCustomValidity('Use a canonical uint32 decimal seed.');
      seed.reportValidity();
    }
  }, { signal });

  window.addEventListener('pagehide', () => {
    void bridge.destroyCase().catch(() => undefined);
  }, { signal });

  if (!executable) return;
  const run = target.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = target.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = target.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');

  const imageChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  imageChooser?.addEventListener('change', () => {
    refreshRen005Inspector(target, bridge.execution());
  }, { signal });

  async function perform(
    operationKind: 'run' | 'reset' | 'repeat',
    operation: () => Promise<unknown>,
  ): Promise<void> {
    const performanceObservation = operationKind === 'reset' || route.scenario !== 'REN-005'
      ? null
      : startUiRunObservation();
    const pending = operation();
    await refreshBridgeUi(target, route, bridge);
    const operationResult: unknown = await pending.catch(() => null);
    const runMetrics = performanceObservation
      ? await performanceObservation.finish()
      : null;
    if (runMetrics) uiRunSequence += 1;
    if (operationKind === 'reset') {
      uiRunSequence = 0;
      resetRen005Performance(target);
    }
    await refreshBridgeUi(target, route, bridge, runMetrics
      ? {
          runIndex: uiRunSequence,
          runKind: operationKind === 'repeat' ? 'repeat' : 'run',
          metrics: runMetrics,
          runResult: operationResult,
        }
      : null);
  }

  run?.addEventListener('click', () => {
    void perform('run', () => bridge.runCase());
  }, { signal });
  reset?.addEventListener('click', () => {
    void perform('reset', () => bridge.resetCase());
  }, { signal });
  repeat?.addEventListener('click', () => {
    void perform('repeat', () => bridge.repeatCase());
  }, { signal });
  void refreshBridgeUi(target, route, bridge);
}

async function refreshBridgeUi(
  target: HTMLElement,
  route: CoreV2ContractRoute,
  bridge: CoreV2ContractLabBridgeV1,
  runObservation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: CoreV2ContractUiRunMetrics;
    readonly runResult: unknown;
  }> | null = null,
): Promise<void> {
  const state = bridge.state();
  const root = target.querySelector<HTMLElement>(`[data-testid="${route.presenter.rootTestId}"]`);
  if (!root) return;
  root.dataset.contractStatus = state.status;
  setText(root.querySelector('[data-contract-status-label]'), statusLabel(state.status));

  const run = root.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = root.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = root.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');
  if (run) run.disabled = state.status === 'running' || state.status === 'observed' || state.status === 'destroyed';
  if (reset) reset.disabled = state.status === 'armed' || state.status === 'running' || state.status === 'destroyed';
  if (repeat) {
    repeat.disabled = state.status === 'armed'
      || state.status === 'running'
      || state.status === 'destroyed';
  }

  const execution = bridge.execution();
  const results = execution && Array.isArray(execution.actionResults)
    ? execution.actionResults as unknown as readonly unknown[]
    : [];
  for (const row of root.querySelectorAll<HTMLElement>('[data-action-index]')) {
    const index = Number(row.dataset.actionIndex);
    const result = Number.isInteger(index) ? results[index] : undefined;
    const resultStatus = isRecord(result) && typeof result.status === 'string'
      ? result.status
      : state.status === 'running'
      ? 'executing-in-order'
      : state.status === 'armed'
        ? 'queued'
        : state.status === 'failed'
          ? 'not-run'
        : state.status;
    row.dataset.actionStatus = resultStatus;
    setText(row.querySelector('[data-action-result]'), actionResultLabel(result, resultStatus));
  }

  const eventCount = execution && Array.isArray(execution.eventJournal)
    ? execution.eventJournal.length
    : 0;
  const completedCount = results.filter((result) => isRecord(result) && result.status === 'completed').length;
  const cleanup = bridge.cleanup();
  setText(root.querySelector('[data-result-actions]'), `${completedCount}/${route.presenter.actions.length} completed`);
  setText(root.querySelector('[data-result-events]'), `${eventCount} public events`);
  setText(
    root.querySelector('[data-result-cleanup]'),
    typeof cleanup?.status === 'string' ? cleanup.status : 'not run',
  );
  setText(root.querySelector('[data-result-observation]'), state.status);

  const resultMessage = root.querySelector<HTMLElement>(
    `[data-testid="${route.presenter.firstFailureTestId}"]`,
  );
  setText(resultMessage, resultMessageFor(state.status, execution));

  const lifetime = root.querySelector<HTMLElement>('[data-canvas-lifetime]');
  setText(lifetime, canvasLifetimeFor(state.status));

  const terminal = state.status === 'observed' || state.status === 'failed' || state.status === 'destroyed';
  const observation = terminal ? await bridge.actualObservation() : null;
  const trace = root.querySelector<HTMLPreElement>(`[data-testid="${route.presenter.traceTestId}"]`);
  if (trace) {
    trace.hidden = !terminal;
    trace.textContent = terminal
      ? JSON.stringify({ state, execution, actualObservation: observation, cleanup }, null, 2)
      : state.status;
  }

  refreshRen005Inspector(root, execution);
  if (runObservation) {
    appendRen005Performance(root, runObservation);
    dispatchCoreV2ContractRunComplete(root, runObservation.runKind, runObservation.runResult);
  }
}

function refreshRen005Inspector(
  root: HTMLElement,
  execution: Readonly<Record<string, unknown>> | null,
): void {
  const inspector = root.querySelector<HTMLElement>('[data-testid="ren-005-image-inspector"]');
  if (!inspector) return;
  const product = terminalRen005Product(execution);
  if (!product) {
    inspector.dataset.observationStatus = 'queued';
    for (const field of inspector.querySelectorAll<HTMLElement>('dd[data-testid^="ren-005-selected-"]')) {
      field.textContent = 'not observed';
    }
    for (const field of inspector.querySelectorAll<HTMLElement>(
      '[data-testid="ren-005-request-count"], [data-testid="ren-005-backend-counts"], [data-testid="ren-005-resource-count"], [data-testid="ren-005-lease-count"], [data-testid="ren-005-stale-count"], [data-testid="ren-005-pending-release-count"]',
    )) {
      field.textContent = 'not observed';
    }
    renderRen005RequestJournal(inspector, []);
    return;
  }

  const imageProbe = recordAt(product, 'imageProbe');
  const images = imageProbe ? recordAt(imageProbe, 'images') : null;
  const chooser = inspector.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  const selectedId = chooser?.value ?? 'descriptor';
  const image = images ? recordAt(images, selectedId) : null;
  const geometry = recordAt(product, 'geometry');
  const bounds = geometry ? ren005WorldBounds(geometry, selectedId) : null;
  const initial = image ? recordAt(image, 'initial') : null;
  const requests = recordAt(product, 'requests');
  const backend = requests ? recordAt(requests, 'backend') : null;
  const snapshot = recordAt(product, 'snapshot');
  const resources = snapshot ? recordAt(snapshot, 'resources') : null;
  const assets = resources ? recordAt(resources, 'assets') : null;

  inspector.dataset.observationStatus = image ? 'observed' : 'missing';
  setText(inspector.querySelector('[data-testid="ren-005-selected-source"]'), sourceLabel(image));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-source-kind"]'),
    stringField(image, 'sourceKind'),
  );
  setText(inspector.querySelector('[data-testid="ren-005-selected-state"]'), stringField(image, 'state'));
  setText(inspector.querySelector('[data-testid="ren-005-selected-role"]'), stringField(image, 'role'));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-bounds"]'),
    bounds ? JSON.stringify(bounds) : 'unavailable',
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-source"]'),
    sourceLabel(initial),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-state"]'),
    stringField(initial, 'state'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-attach"]'),
    numberField(image, 'staleAttachCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-completion"]'),
    numberField(image, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-diagnostics"]'),
    numberField(image, 'diagnosticCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-request-count"]'),
    numberField(backend, 'requestCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-backend-counts"]'),
    backendCountsLabel(backend),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-resource-count"]'),
    numberField(imageProbe, 'bindingCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-lease-count"]'),
    numberField(assets, 'leaseCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-stale-count"]'),
    numberField(imageProbe, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-pending-release-count"]'),
    numberField(imageProbe, 'pendingReleaseCount'),
  );
  renderRen005RequestJournal(
    inspector,
    backend && Array.isArray(backend.journal) ? backend.journal : [],
  );
}

function terminalRen005Product(
  execution: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  if (!execution || !Array.isArray(execution.actionResults)) return null;
  const actionResults = execution.actionResults as readonly unknown[];
  for (let index = actionResults.length - 1; index >= 0; index -= 1) {
    const result: unknown = actionResults[index];
    if (!isRecord(result)) continue;
    const delta = recordAt(result, 'delta');
    const actual = delta ? recordAt(delta, 'actual') : null;
    const product = actual ? recordAt(actual, 'product') : null;
    if (product) return product;
  }
  return null;
}

function ren005WorldBounds(
  geometry: Readonly<Record<string, unknown>>,
  entityId: string,
): readonly number[] | null {
  if (!Array.isArray(geometry.entities)) return null;
  const entities = geometry.entities as readonly unknown[];
  const entity: unknown = entities.find((candidate) => (
    isRecord(candidate) && candidate.id === entityId
  ));
  if (!isRecord(entity) || !Array.isArray(entity.worldBounds)) return null;
  const bounds = entity.worldBounds.filter((value): value is number => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  return bounds.length === 4 ? bounds : null;
}

function sourceLabel(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return 'unavailable';
  if (typeof value.authoredSource === 'string') return value.authoredSource;
  if (isRecord(value.authoredSource)) return JSON.stringify(value.authoredSource);
  if (typeof value.authoredSourceKind === 'string') return `[${value.authoredSourceKind} payload]`;
  return 'unavailable';
}

function stringField(value: Readonly<Record<string, unknown>> | null, key: string): string {
  return value && typeof value[key] === 'string' ? value[key] : 'unavailable';
}

function numberField(value: Readonly<Record<string, unknown>> | null, key: string): string {
  return value && typeof value[key] === 'number' && Number.isFinite(value[key])
    ? String(value[key])
    : 'unavailable';
}

function backendCountsLabel(value: Readonly<Record<string, unknown>> | null): string {
  return ['pending', 'resolved', 'rejected', 'unloaded'].map((label) => (
    `${label} ${numberField(value, `${label}Count`)}`
  )).join(' · ');
}

function renderRen005RequestJournal(
  inspector: HTMLElement,
  journal: readonly unknown[],
): void {
  const list = inspector.querySelector<HTMLOListElement>('[data-testid="ren-005-request-journal"]');
  if (!list) return;
  if (journal.length === 0) {
    list.innerHTML = '<li data-testid="ren-005-request-journal-empty">Run the exact case to inspect requests.</li>';
    return;
  }
  list.innerHTML = journal.map((entry) => {
    const record = isRecord(entry) ? entry : null;
    const sequence = numberField(record, 'sequence');
    const event = stringField(record, 'event');
    const kind = stringField(record, 'kind');
    const state = stringField(record, 'state');
    const token = stringField(record, 'requestToken');
    return `<li data-testid="ren-005-request-journal-row" data-request-event="${escapeHtml(event)}" data-request-kind="${escapeHtml(kind)}"><span>${escapeHtml(sequence)}</span><code>${escapeHtml(token)}</code><strong>${escapeHtml(kind)}</strong><span>${escapeHtml(event)}</span><small>${escapeHtml(state)}</small></li>`;
  }).join('');
}

function appendRen005Performance(
  root: HTMLElement,
  observation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: CoreV2ContractUiRunMetrics;
    readonly runResult: unknown;
  }>,
): void {
  const observer = root.querySelector<HTMLElement>('[data-testid="ren-005-run-observation"]');
  if (!observer) return;
  const { metrics } = observation;
  setText(observer.querySelector('[data-testid="ren-005-run-index"]'), String(observation.runIndex));
  setText(observer.querySelector('[data-testid="ren-005-run-fps"]'), metrics.framesPerSecond.toFixed(1));
  setText(observer.querySelector('[data-testid="ren-005-run-frame-count"]'), String(metrics.frameCount));
  setText(
    observer.querySelector('[data-testid="ren-005-run-max-frame-gap"]'),
    `${metrics.maxFrameGapMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector('[data-testid="ren-005-run-long-task-count"]'),
    `${metrics.longTaskCount} / ${metrics.longTaskTotalMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector('[data-testid="ren-005-run-duration"]'),
    `${metrics.durationMs.toFixed(1)} ms`,
  );
  const journal = observer.querySelector<HTMLOListElement>(
    '[data-testid="ren-005-performance-journal"]',
  );
  if (!journal) return;
  const row = document.createElement('li');
  row.dataset.testid = 'ren-005-performance-journal-row';
  row.dataset.runIndex = String(observation.runIndex);
  row.dataset.runKind = observation.runKind;
  row.dataset.fps = metrics.framesPerSecond.toFixed(3);
  row.dataset.frameCount = String(metrics.frameCount);
  row.dataset.longTaskCount = String(metrics.longTaskCount);
  row.dataset.longTaskTotalMs = metrics.longTaskTotalMs.toFixed(3);
  row.dataset.maxFrameGapMs = metrics.maxFrameGapMs.toFixed(3);
  row.dataset.durationMs = metrics.durationMs.toFixed(3);
  row.textContent = `${observation.runKind} ${observation.runIndex}: ${metrics.framesPerSecond.toFixed(1)} FPS · ${metrics.longTaskCount} long tasks · ${metrics.maxFrameGapMs.toFixed(1)} ms max gap`;
  journal.append(row);
}

function resetRen005Performance(root: HTMLElement): void {
  const observer = root.querySelector<HTMLElement>('[data-testid="ren-005-run-observation"]');
  if (!observer) return;
  for (const testId of [
    'ren-005-run-index',
    'ren-005-run-fps',
    'ren-005-run-frame-count',
    'ren-005-run-max-frame-gap',
    'ren-005-run-long-task-count',
    'ren-005-run-duration',
  ]) {
    setText(observer.querySelector(`[data-testid="${testId}"]`), 'not observed');
  }
  observer.querySelector('[data-testid="ren-005-performance-journal"]')?.replaceChildren();
}

function dispatchCoreV2ContractRunComplete(
  root: HTMLElement,
  runKind: 'run' | 'repeat',
  runResult: unknown,
): void {
  root.dispatchEvent(new CustomEvent('core-v2-contract-run-complete', {
    bubbles: true,
    detail: Object.freeze({
      operation: runKind === 'repeat' ? 'repeatCase' : 'runCase',
      run: runResult,
    }),
  }));
}

function startUiRunObservation(): Readonly<{
  finish(): Promise<CoreV2ContractUiRunMetrics>;
}> {
  const startedAt = performance.now();
  const frameTimes: number[] = [];
  const longTasks: PerformanceEntry[] = [];
  let observer: PerformanceObserver | null = null;
  let active = true;
  let frameRequest = 0;
  let finishPromise: Promise<CoreV2ContractUiRunMetrics> | null = null;
  let finishRun: ((metrics: CoreV2ContractUiRunMetrics) => void) | null = null;

  const sampleFrame = (_time: number): void => {
    frameRequest = 0;
    // Callback arrival, rather than the compositor timestamp argument, captures
    // main-thread stalls that delay requestAnimationFrame delivery.
    frameTimes.push(performance.now());
    if (active) {
      frameRequest = window.requestAnimationFrame(sampleFrame);
      return;
    }
    if (observer) {
      longTasks.push(...observer.takeRecords());
      observer.disconnect();
    }
    const finishedAt = performance.now();
    const durationMs = Math.max(0, finishedAt - startedAt);
    let maxFrameGapMs = 0;
    let previous = startedAt;
    for (const frameTime of frameTimes) {
      maxFrameGapMs = Math.max(maxFrameGapMs, Math.max(0, frameTime - previous));
      previous = frameTime;
    }
    const framesPerSecond = durationMs > 0
      ? frameTimes.length * 1_000 / durationMs
      : 0;
    finishRun?.(Object.freeze({
      durationMs,
      frameCount: frameTimes.length,
      framesPerSecond,
      maxFrameGapMs,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
    }));
    finishRun = null;
  };
  frameRequest = window.requestAnimationFrame(sampleFrame);
  if (
    typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    observer = new PerformanceObserver((entries) => longTasks.push(...entries.getEntries()));
    observer.observe({ entryTypes: ['longtask'] });
  }

  return Object.freeze({
    finish(): Promise<CoreV2ContractUiRunMetrics> {
      finishPromise ??= new Promise((resolve) => {
        finishRun = resolve;
        active = false;
        if (frameRequest === 0) frameRequest = window.requestAnimationFrame(sampleFrame);
      });
      return finishPromise;
    },
  });
}

function actionResultLabel(result: unknown, fallback: string): string {
  if (!isRecord(result)) return fallback;
  const actual = isRecord(result.delta) && isRecord(result.delta.actual)
    ? result.delta.actual
    : null;
  const error = actual && isRecord(actual.error) ? actual.error : null;
  if (typeof error?.code === 'string') return `failed · ${error.code}`;
  return typeof result.status === 'string' ? result.status : fallback;
}

function resultMessageFor(
  status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status'],
  execution: Readonly<Record<string, unknown>> | null,
): string {
  if (status === 'observed') {
    return 'Actual observation captured from product execution. Expected comparison and promotion are intentionally outside this focused Lab run.';
  }
  if (status === 'failed') {
    const error = execution && isRecord(execution.error) ? execution.error : null;
    return `Execution failed and its cleanup trace was retained${typeof error?.message === 'string' ? `: ${error.message}` : '.'}`;
  }
  if (status === 'running') return 'Executing the approved actions in exact order with a transient PixiJS WebGL surface.';
  if (status === 'destroyed') return 'The route bridge is destroyed; the last actual and cleanup trace remain inspectable.';
  return 'Run the exact ordered case to inspect product, event, semantic, and cleanup facts.';
}

function canvasLifetimeFor(status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status']): string {
  if (status === 'running') return 'Transient PixiJS WebGL canvas is owned by the active executor generation.';
  if (status === 'observed') return 'Canvas removed by executor cleanup; semantic, event, and resource facts remain in the trace.';
  if (status === 'failed') return 'Execution failed; the executor cleanup boundary removed every tracked canvas.';
  return 'PixiJS WebGL canvas mounts only while the exact executor owns a live engine.';
}

function statusLabel(status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status']): string {
  const labels = {
    loading: 'Loading',
    ready: 'Ready',
    armed: 'Ready to observe',
    running: 'Running',
    observed: 'Observed',
    'not-implemented': 'Not implemented',
    failed: 'Failed',
    destroyed: 'Destroyed',
  } as const;
  return labels[status];
}

function setText(target: Element | null, value: string): void {
  if (target) target.textContent = value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

export function mountCoreV2ContractLab(
  target: HTMLElement,
  input: string | URL = window.location.href,
): CoreV2ContractLabMount {
  let route: CoreV2ContractRoute;
  try {
    route = parseCoreV2ContractRoute(input);
  } catch (error) {
    const routeError = error instanceof CoreV2ContractRouteError
      ? error
      : new CoreV2ContractRouteError('INVALID_QUERY', String(error));
    target.innerHTML = renderCoreV2ContractRouteError(routeError);
    return Object.freeze({
      route: null,
      bridge: null,
      routeError,
      destroy(): Promise<void> {
        target.replaceChildren();
        return Promise.resolve();
      },
    });
  }

  target.innerHTML = renderCoreV2ContractLab(route);
  const surfaceHost = target.querySelector<HTMLElement>('[data-contract-surface]');
  if (!surfaceHost) throw new Error(`Core v2 contract Lab surface is missing: ${route.scenario}`);
  let executable = false;
  let bridge: CoreV2ContractLabBridgeV1;
  if (isCoreV2ExecutableCaseId(route.scenario)) {
    if (route.presenter.executionStatus !== 'actual-observable') {
      throw new Error(`Core v2 contract Lab execution-status drift: ${route.scenario}`);
    }
    executable = true;
    bridge = createCoreV2ExecutableLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        size: route.size,
        seed: route.seed,
        surfaceHost,
      });
  } else {
    if (route.presenter.executionStatus !== 'not-implemented') {
      throw new Error(`Core v2 contract Lab stub-status drift: ${route.scenario}`);
    }
    bridge = createNotImplementedCoreV2ContractLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        actionCount: route.presenter.actions.length,
      });
  }
  const abortController = new AbortController();
  bindShell(target, route, abortController, bridge, executable);
  window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__ = bridge;

  return Object.freeze({
    route,
    bridge,
    routeError: null,
    async destroy(): Promise<void> {
      abortController.abort();
      await bridge.destroyCase();
      if (window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__ === bridge) {
        delete window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__;
      }
      target.replaceChildren();
    },
  });
}

if (typeof document !== 'undefined') {
  const host = document.querySelector<HTMLElement>('[data-core-v2-contract-lab]');
  if (host) mountCoreV2ContractLab(host);
}
