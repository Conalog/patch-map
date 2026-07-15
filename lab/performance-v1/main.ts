import {
  CoreV1LabRuntime,
  type DatasetKey,
  isDatasetKey,
  type LabReadout,
} from './runtime';

const canvas = required<HTMLCanvasElement>('[data-testid="core-canvas"]');
const datasetSelect = required<HTMLSelectElement>('[data-testid="dataset-select"]');
const statusBadge = required<HTMLElement>('[data-testid="status-badge"]');
const runtime = new CoreV1LabRuntime(canvas, datasetFromUrl());

datasetSelect.value = runtime.dataset;
runtime.reinitialize();
render(runtime.readout());
setStatus('READY');
document.body.dataset.labReady = 'true';

datasetSelect.addEventListener('change', () => {
  const dataset = datasetSelect.value;
  if (!isDatasetKey(dataset)) return;
  runtime.setDataset(dataset);
  persistDataset(dataset);
  render(runtime.readout());
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', () => {
    void runAction(button.dataset.action ?? '');
  });
}

let resizeFrame = 0;
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    try {
      runtime.resize();
      render(runtime.readout());
    } catch {
      // The torn-down surface intentionally ignores resize until re-init.
    }
  });
});
resizeObserver.observe(required('[data-testid="canvas-wrap"]'));

window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect();
  runtime.teardown();
});

window.setInterval(() => {
  required('[data-testid="clock"]').textContent = new Date().toISOString().slice(11, 23);
}, 47);

async function runAction(action: string): Promise<void> {
  setBusy(true);
  setStatus(action === 'auto' ? 'REPLAYING' : 'RUNNING');
  try {
    switch (action) {
      case 'load':
        await runtime.load();
        break;
      case 'trusted':
        runtime.trustedCommit();
        break;
      case 'random':
        runtime.randomCommit();
        break;
      case 'advance':
        runtime.advanceAnimation();
        break;
      case 'flush':
        runtime.flush();
        break;
      case 'hit':
        runtime.hitAndSelect();
        break;
      case 'teardown':
        runtime.teardown();
        break;
      case 'reinit':
        runtime.reinitialize();
        break;
      case 'auto':
        await runtime.autoReplay((_label, readout) => render(readout));
        break;
      default:
        throw new Error(`Unknown lab action: ${action}`);
    }
    render(runtime.readout());
    setStatus(runtime.readout().alive ? 'READY' : 'OFFLINE');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('FAIL');
    statusBadge.title = message;
    console.error('[core-v1-lab]', error);
  } finally {
    setBusy(false);
  }
}

function render(readout: LabReadout): void {
  text('surface-state-revision', String(readout.revision));
  text('surface-frame-revision', nullableNumber(readout.frameRevision));
  text('metric-revision', String(readout.revision));
  text('metric-frame-revision', nullableNumber(readout.frameRevision));
  text('metric-frame', String(readout.frame));
  text('metric-entities', readout.entityCount.toLocaleString());
  text('metric-selection', readout.selectionCount.toLocaleString());
  text('metric-animations', readout.activeAnimations.toLocaleString());
  text('metric-commands', readout.commandCount.toLocaleString());
  text('metric-action', readout.lastAction);
  text('metric-action-ms', formatMs(readout.lastActionMs));
  text('metric-flush-ms', formatMs(readout.lastFlushMs));
  text('metric-canvas', `${readout.canvasWidth}×${readout.canvasHeight}`);
  text('metric-fixture', readout.fixtureStatus);
  text('lifecycle-generation', `L${String(readout.lifecycle).padStart(2, '0')}`);
  text('workload-note', readout.workloadNote);
  text('event-count', `${readout.events.length.toLocaleString()} records`);

  const invariantList = required<HTMLOListElement>('[data-testid="invariant-list"]');
  invariantList.replaceChildren(
    ...readout.invariants.map((invariant) => {
      const item = document.createElement('li');
      item.dataset.testid = 'invariant-row';
      item.dataset.status = invariant.status;
      const verdict = document.createElement('b');
      verdict.textContent = invariant.status.toUpperCase();
      const copy = document.createElement('span');
      const label = document.createElement('strong');
      label.textContent = invariant.label;
      const detail = document.createElement('small');
      detail.textContent = invariant.detail;
      copy.append(label, detail);
      item.append(verdict, copy);
      return item;
    }),
  );

  const eventLog = required<HTMLOListElement>('[data-testid="event-log"]');
  eventLog.replaceChildren(
    ...readout.events.map((event) => {
      const item = document.createElement('li');
      item.dataset.testid = 'event-row';
      const sequence = document.createElement('b');
      sequence.textContent = `#${String(event.sequence).padStart(3, '0')}`;
      const time = document.createElement('time');
      time.textContent = event.time;
      const type = document.createElement('strong');
      type.textContent = event.type;
      const revision = document.createElement('span');
      revision.textContent = `r${event.revision}`;
      const detail = document.createElement('small');
      detail.textContent = event.detail;
      item.append(sequence, time, type, revision, detail);
      return item;
    }),
  );
}

function setBusy(busy: boolean): void {
  document.body.dataset.busy = String(busy);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    button.disabled = busy;
  }
  datasetSelect.disabled = busy;
}

function setStatus(status: 'BOOTING' | 'READY' | 'RUNNING' | 'REPLAYING' | 'OFFLINE' | 'FAIL'): void {
  statusBadge.textContent = status;
  statusBadge.dataset.status = status.toLowerCase();
  if (status !== 'FAIL') statusBadge.title = '';
}

function datasetFromUrl(): DatasetKey {
  const value = new URL(window.location.href).searchParams.get('dataset');
  return isDatasetKey(value) ? value : '500';
}

function persistDataset(dataset: DatasetKey): void {
  const url = new URL(window.location.href);
  url.searchParams.set('dataset', dataset);
  window.history.replaceState({}, '', url);
}

function text(testId: string, value: string): void {
  required(`[data-testid="${testId}"]`).textContent = value;
}

function nullableNumber(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatMs(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required lab element: ${selector}`);
  return element;
}
