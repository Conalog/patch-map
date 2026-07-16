import {
  createNotImplementedCoreV2ContractLabBridge,
  type CoreV2ContractLabBridgeV1,
} from './bridge';
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

function actionControls(route: CoreV2ContractRoute): string {
  return route.presenter.actions.map((action) => {
    const primary = action.primaryTestId === null
      ? ''
      : ` data-testid="${action.primaryTestId}"`;
    return `<div class="contract-case-action" data-testid="${action.actionTestId}"><span>${String(action.index + 1).padStart(2, '0')}</span><button type="button"${primary} disabled aria-disabled="true">${escapeHtml(action.label)}</button><code>${escapeHtml(action.handlerId)}</code></div>`;
  }).join('');
}

export function renderCoreV2ContractLab(route: CoreV2ContractRoute): string {
  const presenter = route.presenter;
  const sizeOptions = CORE_V2_CONTRACT_DATASET_SIZES.map((size) =>
    `<option value="${size}"${size === route.size ? ' selected' : ''}>${size}</option>`,
  ).join('');

  return `<main class="contract-lab-shell" data-testid="${presenter.rootTestId}" data-contract-status="not-implemented">
  <header class="contract-lab-header">
    <div><span class="contract-kicker">Core v2 functional contract</span><h1>${presenter.caseId} · ${escapeHtml(presenter.title)}</h1><p>${presenter.caseType} · ${presenter.priority} · selected case only</p></div>
    <strong class="contract-status">Not implemented</strong>
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
        <button type="button" data-testid="load-dataset" disabled>Load dataset</button>
        <button type="button" data-testid="reset-case" disabled>Reset case</button>
        <button type="button" data-testid="repeat-action" disabled>Repeat action</button>
        <button type="button" data-testid="copy-url">Copy URL</button>
      </div>
      <p class="contract-stub-notice">T0 route/presenter shell only. Engine action execution is not implemented, so this route cannot report pass.</p>
      <section class="contract-case-card" aria-labelledby="contract-case-title">
        <span class="contract-kicker">Focused case</span>
        <h2 id="contract-case-title">${escapeHtml(presenter.title)}</h2>
        <p class="contract-instruction">${escapeHtml(presenter.instruction)}</p>
        <div class="contract-canvas" data-testid="canvas-host">
          <div data-testid="${presenter.gestureSurfaceTestId}" aria-label="Gesture surface placeholder">
            PixiJS case surface mounts here after its exact executor is implemented.
          </div>
        </div>
        <div class="contract-actions" aria-label="Selected case action ownership">${actionControls(route)}</div>
      </section>
      <section class="contract-result-strip" data-testid="${presenter.resultTestId}" aria-live="polite">
        <dl><div><dt>Action</dt><dd>not run</dd></div><div><dt>Max frame gap</dt><dd>not measured</dd></div><div><dt>Long tasks</dt><dd>not measured</dd></div><div><dt>Assertions</dt><dd>0 observed</dd></div></dl>
        <p data-testid="${presenter.firstFailureTestId}">Action executor is not implemented; no semantic comparison or pass exists.</p>
        <pre data-testid="${presenter.traceTestId}" hidden>not-implemented</pre>
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
): void {
  const signal = abortController.signal;
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
      void navigator.clipboard.writeText(new URL(route.canonicalUrl, window.location.origin).href);
    }
  }, { signal });

  const size = target.querySelector<HTMLSelectElement>('[data-testid="dataset-size"]');
  size?.addEventListener('change', () => {
    const next = CORE_V2_CONTRACT_DATASET_SIZES.find((candidate) => candidate === size.value);
    if (next) window.location.assign(buildCoreV2ContractRoute(route.scenario, next, route.seed));
  }, { signal });

  const seed = target.querySelector<HTMLInputElement>('[data-testid="seed"]');
  seed?.addEventListener('change', () => {
    try {
      const nextSeed = parseCoreV2ContractSeed(seed.value);
      seed.setCustomValidity('');
      window.location.assign(buildCoreV2ContractRoute(route.scenario, route.size, nextSeed));
    } catch {
      seed.setCustomValidity('Use a canonical uint32 decimal seed.');
      seed.reportValidity();
    }
  }, { signal });
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
  const bridge = createNotImplementedCoreV2ContractLabBridge({
    caseId: route.scenario,
    rootTestId: route.presenter.rootTestId,
    actionCount: route.presenter.actions.length,
  });
  const abortController = new AbortController();
  bindShell(target, route, abortController);
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
