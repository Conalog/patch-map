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

  async function perform(operation: () => Promise<unknown>): Promise<void> {
    const pending = operation();
    await refreshBridgeUi(target, route, bridge);
    await pending.catch(() => undefined);
    await refreshBridgeUi(target, route, bridge);
  }

  run?.addEventListener('click', () => {
    void perform(() => bridge.runCase());
  }, { signal });
  reset?.addEventListener('click', () => {
    void perform(() => bridge.resetCase());
  }, { signal });
  repeat?.addEventListener('click', () => {
    void perform(() => bridge.repeatCase());
  }, { signal });
  void refreshBridgeUi(target, route, bridge);
}

async function refreshBridgeUi(
  target: HTMLElement,
  route: CoreV2ContractRoute,
  bridge: CoreV2ContractLabBridgeV1,
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
