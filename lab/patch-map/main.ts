import productionFixture from '../fixtures/production-like.json';
import {
  PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
  PATCH_MAP_SYNTHETIC_ASSET_DATA_URL,
  createSyntheticPatchMap,
} from '../../performance/core-v2/workloads';
import {
  type PatchMapRuntime,
  type PatchMapBackendPreference,
  type PatchMapFrameLoop,
  type PatchMapLoadResult,
  type PatchMapRendererStrategy,
  createPatchMapRuntime,
} from '../../src/patch-map/index';
import { PATCH_MAP_PERFORMANCE_LAB_ZOOM_LIMITS } from './lab-settings';

type DatasetKey =
  | '100'
  | '500'
  | '1000'
  | '2000'
  | '5000'
  | '10000'
  | 'production';
type LabStatus = 'booting' | 'busy' | 'ready' | 'offline' | 'failed';

interface PatchMapLabState {
  readonly status: LabStatus;
  readonly generation: number;
  readonly dataset: DatasetKey;
  readonly selectedStrategy: PatchMapRendererStrategy;
  readonly selectedBackend: PatchMapBackendPreference;
  readonly activeStrategy: PatchMapRendererStrategy | null;
  readonly activeBackend: string | null;
  readonly loaded: boolean;
  readonly destroyed: boolean;
  readonly entityCount: number;
  readonly frame: number;
  readonly lastAction: string;
  readonly lastActionMs: number | null;
  readonly error: string | null;
}

interface PatchMapLabBridge {
  readonly state: PatchMapLabState;
  getRuntime(): PatchMapRuntime | null;
  reinitialize(): Promise<PatchMapRuntime>;
  loadProduction(): Promise<PatchMapLoadResult>;
}

declare global {
  interface Window {
    __PATCH_MAP_LAB__: PatchMapLabBridge;
  }
}

const datasetSelect = required<HTMLSelectElement>('[data-testid="dataset-select"]');
const strategySelect = required<HTMLSelectElement>('[data-testid="strategy-select"]');
const backendSelect = required<HTMLSelectElement>('[data-testid="backend-select"]');
const canvasHost = required<HTMLElement>('[data-testid="canvas-host"]');
const canvasFrame = required<HTMLElement>('[data-testid="canvas-frame"]');
const captureImage = required<HTMLImageElement>('[data-testid="capture-image"]');
const capturePreview = required<HTMLElement>('[data-testid="capture-preview"]');

let runtime: PatchMapRuntime | null = null;
let generation = 0;
let status: LabStatus = 'booting';
let loaded = false;
let busy = true;
let lastAction = 'boot';
let lastActionMs: number | null = null;
let lastNormalizeMs: number | null = null;
let lastStoreMs: number | null = null;
let lastPrepareMs: number | null = null;
let lastError: string | null = null;
let currentInput: unknown = null;
let currentInputFingerprint: string | null = null;
let inputImmutable: boolean | null = null;
let datasetSummary = 'No JSON loaded';
let diagnosticCount = 0;
let refreshFrame = 0;
let resizeFrame = 0;
let barAnimationSequence = 0;
let lastFrameReadoutMs = 0;
let frameLoop: PatchMapFrameLoop | null = null;

applyUrlSelection();
datasetSelect.addEventListener('change', () => {
  persistSelection();
  message(`Selected ${datasetLabel(datasetValue())}. Run Load JSON to replace authoritative state.`);
  renderReadout();
});
strategySelect.addEventListener('change', () => {
  persistSelection();
  message(`Selected ${strategyValue()} spike. Run Re-init to apply it.`);
  renderReadout();
});
backendSelect.addEventListener('change', () => {
  persistSelection();
  message(
    backendValue() === 'webgpu'
      ? 'WebGPU selected as an experimental backend. Run Re-init to apply it.'
      : 'WebGL selected as the production baseline. Run Re-init to apply it.',
  );
  renderReadout();
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', () => {
    void runAction(button.dataset.action ?? '');
  });
}

// PatchMap owns pointer activity and frame invalidation. The Lab observes only
// to refresh detached readouts after the package has handled the event.
for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'] as const) {
  canvasHost.addEventListener(eventName, queueReadout, { passive: true });
}

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const core = liveRuntime();
    if (!core || busy) return;
    const size = surfaceSize();
    core.resize(size.width, size.height, window.devicePixelRatio || 1);
    frameLoop?.publishNow();
    queueReadout();
  });
});
resizeObserver.observe(canvasFrame);

window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect();
  cancelAnimationFrame(refreshFrame);
  frameLoop?.destroy();
  frameLoop = null;
  const core = liveRuntime();
  if (core) void core.destroy();
});

window.__PATCH_MAP_LAB__ = {
  get state() {
    return stateSnapshot();
  },
  getRuntime: () => liveRuntime(),
  reinitialize,
  loadProduction: () => {
    setBusy(true);
    setStatus('busy');
    datasetSelect.value = 'production';
    persistSelection();
    try {
      const result = loadDataset('production');
      setStatus('ready');
      return Promise.resolve(result);
    } catch (error) {
      fail(error);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setBusy(false);
      renderReadout();
    }
  },
};

void boot();

async function boot(): Promise<void> {
  setStatus('booting');
  try {
    await reinitialize();
    loadDataset(datasetValue());
    const core = requireRuntime();
    core.fit();
    core.flush('lab-initial-fit');
    message('Ready. Drag empty canvas to pan, wheel to zoom, or run an explicit action.');
    setStatus('ready');
    document.body.dataset.labReady = 'true';
  } catch (error) {
    fail(error);
  } finally {
    setBusy(false);
    renderReadout();
  }
}

async function runAction(action: string): Promise<void> {
  if (busy) return;
  setBusy(true);
  setStatus('busy');
  lastError = null;
  const started = performance.now();
  try {
    switch (action) {
      case 'load':
        loadDataset(datasetValue());
        break;
      case 'prepare': {
        assertLoaded();
        const result = await requireRuntime().prepare();
        lastPrepareMs = result.gpuPrepareMs;
        requireRuntime().flush('lab-first-visible-frame');
        message(`Prepared GPU resources in ${formatMs(result.gpuPrepareMs)} and published a visible frame.`);
        break;
      }
      case 'animate-all':
        assertLoaded();
        barAnimationSequence += 1;
        requireRuntime().animateBarHeights({
          fraction: 1,
          durationMs: 420,
          seed: (0xa11ba7 + barAnimationSequence) >>> 0,
          minPercent: 0,
          maxPercent: 100,
        });
        message('Animating every bar to an independent random height between 0% and 100%.');
        break;
      case 'animate-partial':
        assertLoaded();
        requireRuntime().animateBarHeights({ fraction: 0.1, durationMs: 420, seed: 0x10ba7 });
        message('Animating a seeded 10% bar subset; only the renderer dirty range is committed.');
        break;
      case 'random-text':
        assertLoaded();
        requireRuntime().randomizeTexts(0x7e57c0de, 0.25);
        requireRuntime().flush('lab-random-text');
        message('Changed a seeded 25% text subset and rendered the new values.');
        break;
      case 'asset-load':
        await requireRuntime().loadAsset(
          PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
          PATCH_MAP_SYNTHETIC_ASSET_DATA_URL,
        );
        requireRuntime().flush('lab-asset-load');
        message(`Loaded local atlas candidate “${PATCH_MAP_SYNTHETIC_ASSET_ALIAS}”.`);
        break;
      case 'asset-unload': {
        const unloaded = await requireRuntime().unloadAsset(PATCH_MAP_SYNTHETIC_ASSET_ALIAS);
        requireRuntime().flush('lab-asset-unload');
        message(unloaded ? 'Unloaded the local icon asset and released its texture.' : 'The local icon asset was already unloaded.');
        break;
      }
      case 'fit':
        assertLoaded();
        requireRuntime().fit();
        requireRuntime().flush('lab-fit');
        message('Fit scene bounds into the responsive viewport.');
        break;
      case 'reset':
        requireRuntime().resetView();
        requireRuntime().flush('lab-reset-view');
        message('Reset viewport translation, scale, and rotation.');
        break;
      case 'capture': {
        assertLoaded();
        const base64 = await requireRuntime().captureBase64();
        captureImage.src = base64;
        captureImage.hidden = false;
        capturePreview.querySelector('span')?.remove();
        message(`Captured a local PNG preview (${formatBytes(base64.length)} encoded).`);
        break;
      }
      case 'destroy':
        await destroyRuntime();
        message('Destroyed Pixi Application, aggregate layers, assets, root events, and scheduler.');
        setStatus('offline');
        break;
      case 'reinit':
        await reinitialize();
        message('Created a fresh PatchMap lifecycle. Run Load JSON to restore authoritative state.');
        break;
      default:
        throw new Error(`Unknown PatchMap lab action: ${action}`);
    }
    lastAction = action;
    lastActionMs = performance.now() - started;
    if (action !== 'destroy') setStatus('ready');
  } catch (error) {
    lastAction = action;
    lastActionMs = performance.now() - started;
    fail(error);
  } finally {
    setBusy(false);
    renderReadout();
  }
}

async function reinitialize(): Promise<PatchMapRuntime> {
  setBusy(true);
  setStatus('busy');
  await destroyRuntime();
  const size = surfaceSize();
  const selectedStrategy = strategyValue();
  const selectedBackend = backendValue();
  const core = await createPatchMapRuntime({
    target: canvasHost,
    width: size.width,
    height: size.height,
    pixelRatio: window.devicePixelRatio || 1,
    strategy: selectedStrategy,
    preference: selectedBackend,
    antialias: false,
    background: 0xf7f8faff,
    powerPreference: 'high-performance',
    autoRender: false,
    assetPolicy: ({ descriptor, packageOwned }) => {
      if (
        !packageOwned &&
        descriptor.src !== PATCH_MAP_SYNTHETIC_ASSET_DATA_URL
      ) {
        throw new Error('PatchMap performance Lab rejected a non-fixture asset');
      }
    },
  });
  core.setViewportZoomLimits(PATCH_MAP_PERFORMANCE_LAB_ZOOM_LIMITS);
  runtime = core;
  frameLoop = core.createFrameLoop({
    onFrame: ({ wallTimeMs, activeAnimationsAfter }) => {
      if (
        activeAnimationsAfter === 0 ||
        wallTimeMs - lastFrameReadoutMs >= 200
      ) {
        lastFrameReadoutMs = wallTimeMs;
        queueReadout();
      }
    },
  });
  generation += 1;
  loaded = false;
  currentInput = null;
  currentInputFingerprint = null;
  inputImmutable = null;
  datasetSummary = 'No JSON loaded';
  diagnosticCount = 0;
  lastNormalizeMs = null;
  lastStoreMs = null;
  lastPrepareMs = null;
  lastError = null;
  captureImage.hidden = true;
  captureImage.removeAttribute('src');
  if (!capturePreview.querySelector('span')) {
    const placeholder = document.createElement('span');
    placeholder.textContent = 'Run Capture after a visible frame';
    capturePreview.prepend(placeholder);
  }
  setStatus('ready');
  setBusy(false);
  renderReadout();
  return core;
}

async function destroyRuntime(): Promise<void> {
  const core = runtime;
  runtime = null;
  frameLoop?.destroy();
  frameLoop = null;
  if (core && !core.destroyed) await core.destroy();
  loaded = false;
  currentInput = null;
  currentInputFingerprint = null;
}

function loadDataset(dataset: DatasetKey): PatchMapLoadResult {
  const core = requireRuntime();
  const input = dataset === 'production'
    ? productionFixture
    : createSyntheticPatchMap(Number(dataset), 0x5eed);
  const before = fingerprint(input);
  const result = core.load(input);
  const after = fingerprint(input);
  currentInput = input;
  currentInputFingerprint = before;
  inputImmutable = before === after;
  loaded = true;
  diagnosticCount = result.parse.diagnostics.length;
  lastNormalizeMs = result.normalizeMs;
  lastStoreMs = result.storeLoadMs;
  lastPrepareMs = null;
  const counts = result.parse.identity.counts;
  datasetSummary = `${datasetLabel(dataset)} · ${counts.sourceElements.toLocaleString()} source elements · ${counts.entities.toLocaleString()} entities`;
  core.flush(`lab-load-${dataset}`);
  message(
    `${datasetSummary}. Input fingerprint ${inputImmutable ? 'unchanged' : 'changed'}; ${diagnosticCount.toLocaleString()} diagnostics.`,
  );
  renderReadout();
  return result;
}

function renderReadout(): void {
  const core = liveRuntime();
  const debug = core?.debugSnapshot();
  const renderer = debug?.renderer;
  text('status', status.toUpperCase());
  text('generation', `L${String(generation).padStart(2, '0')}`);
  text('active-strategy', renderer?.strategy.toUpperCase() ?? strategyValue().toUpperCase());
  text('active-backend', renderer?.backend.toUpperCase() ?? backendValue().toUpperCase());
  text('metric-entities', (debug?.entityCount ?? 0).toLocaleString());
  text('metric-frames', (renderer?.frame ?? 0).toLocaleString());
  text('metric-render-objects', (renderer?.aggregateRenderObjects ?? 0).toLocaleString());
  text('metric-primitives', (renderer?.visiblePrimitives ?? 0).toLocaleString());
  text('metric-animations', (debug?.activeAnimations ?? 0).toLocaleString());
  text('metric-selection', (debug?.selectionCount ?? 0).toLocaleString());
  text('metric-bitmap-text', (renderer?.bitmapTextCount ?? 0).toLocaleString());
  text('metric-fallback-text', (renderer?.fallbackTextCount ?? 0).toLocaleString());
  text('metric-images', (renderer?.imageCount ?? 0).toLocaleString());
  text(
    'metric-assets',
    `${(renderer?.loadedAssetCount ?? 0).toLocaleString()} / ${(renderer?.unresolvedAssetCount ?? 0).toLocaleString()} unresolved`,
  );
  text(
    'metric-upload',
  renderer?.uploadObservation === 'particle-full-upload-count'
      ? `${renderer.dynamicFullUploadCount.toLocaleString()} dynamic particles`
      : `${renderer?.uploadedChunks.toLocaleString() ?? '0'} chunks · ${formatBytes(renderer?.uploadedBytes ?? 0)}`,
  );
  text('metric-invalidation', renderer?.lastInvalidation ?? 'destroyed');
  text(
    'metric-view',
    renderer
      ? `${renderer.view.scale.toFixed(2)}× · ${renderer.view.x.toFixed(1)}, ${renderer.view.y.toFixed(1)}`
      : '—',
  );
  text('metric-action', lastAction);
  text('metric-action-ms', formatNullableMs(lastActionMs));
  text('metric-normalize-ms', formatNullableMs(lastNormalizeMs));
  text('metric-store-ms', formatNullableMs(lastStoreMs));
  text('metric-prepare-ms', formatNullableMs(lastPrepareMs));
  text('input-immutability', inputImmutable === null ? 'PENDING' : inputImmutable ? 'PASS' : 'FAIL');
  text('diagnostic-count', diagnosticCount.toLocaleString());
  text('dataset-summary', datasetSummary);
  text(
    'interaction-status',
    core
      ? `Root events active · selection ${debug?.selectionCount ?? 0} · ${renderer?.view.scale.toFixed(2) ?? '1.00'}× viewport`
      : 'Runtime offline. Choose a strategy/backend and run Re-init.',
  );
  document.body.dataset.status = status;
  document.body.dataset.runtime = core ? 'alive' : 'offline';
  document.body.dataset.strategy = renderer?.strategy ?? strategyValue();
  document.body.dataset.backend = renderer?.backend ?? backendValue();
  syncControlAvailability();
}

function stateSnapshot(): PatchMapLabState {
  const core = liveRuntime();
  const debug = core?.debugSnapshot();
  return Object.freeze({
    status,
    generation,
    dataset: datasetValue(),
    selectedStrategy: strategyValue(),
    selectedBackend: backendValue(),
    activeStrategy: debug?.renderer.strategy ?? null,
    activeBackend: debug?.renderer.backend ?? null,
    loaded,
    destroyed: !core,
    entityCount: debug?.entityCount ?? 0,
    frame: debug?.renderer.frame ?? 0,
    lastAction,
    lastActionMs,
    error: lastError,
  });
}

function queueReadout(): void {
  cancelAnimationFrame(refreshFrame);
  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = 0;
    renderReadout();
  });
}

function setBusy(value: boolean): void {
  busy = value;
  document.body.dataset.busy = String(value);
  syncControlAvailability();
}

function syncControlAvailability(): void {
  const alive = liveRuntime() !== null;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const action = button.dataset.action;
    button.disabled = busy || (!alive && action !== 'reinit');
  }
  datasetSelect.disabled = busy;
  strategySelect.disabled = busy;
  backendSelect.disabled = busy;
}

function setStatus(value: LabStatus): void {
  status = value;
  document.body.dataset.status = value;
}

function fail(error: unknown): void {
  lastError = error instanceof Error ? error.message : String(error);
  setStatus('failed');
  message(`ERROR · ${lastError}`);
  document.body.dataset.labError = lastError;
}

function message(value: string): void {
  text('last-message', value);
}

function requireRuntime(): PatchMapRuntime {
  const core = liveRuntime();
  if (!core) throw new Error('PatchMap is offline; run Re-init first');
  return core;
}

function liveRuntime(): PatchMapRuntime | null {
  return runtime && !runtime.destroyed ? runtime : null;
}

function assertLoaded(): void {
  if (!loaded || currentInput === null || currentInputFingerprint === null) {
    throw new Error('Load a PATCH MAP JSON dataset before this action');
  }
}

function surfaceSize(): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(canvasFrame.clientWidth)),
    height: Math.max(1, Math.round(canvasFrame.clientHeight)),
  };
}

function fingerprint(input: unknown): string {
  const serialized = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function datasetValue(): DatasetKey {
  return isDatasetKey(datasetSelect.value) ? datasetSelect.value : '500';
}

function strategyValue(): PatchMapRendererStrategy {
  return strategySelect.value === 'particle' ? 'particle' : 'mesh';
}

function backendValue(): PatchMapBackendPreference {
  return backendSelect.value === 'webgpu' ? 'webgpu' : 'webgl';
}

function isDatasetKey(value: string | null): value is DatasetKey {
  return value === '100' ||
    value === '500' ||
    value === '1000' ||
    value === '2000' ||
    value === '5000' ||
    value === '10000' ||
    value === 'production';
}

function datasetLabel(dataset: DatasetKey): string {
  return dataset === 'production' ? 'production fixture' : `synthetic ${Number(dataset).toLocaleString()}`;
}

function applyUrlSelection(): void {
  const search = new URL(window.location.href).searchParams;
  const dataset = search.get('dataset');
  if (isDatasetKey(dataset)) datasetSelect.value = dataset;
  strategySelect.value = search.get('strategy') === 'particle' ? 'particle' : 'mesh';
  backendSelect.value = search.get('backend') === 'webgpu' ? 'webgpu' : 'webgl';
}

function persistSelection(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('dataset', datasetValue());
  url.searchParams.set('strategy', strategyValue());
  url.searchParams.set('backend', backendValue());
  window.history.replaceState({}, '', url);
}

function formatNullableMs(value: number | null): string {
  return value === null ? '—' : formatMs(value);
}

function formatMs(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString()} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function text(testId: string, value: string): void {
  required(`[data-testid="${testId}"]`).textContent = value;
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required PatchMap lab element: ${selector}`);
  return element;
}

export {};
