export function examplesRunnerSource() {
  return `
import { runMinimalExample } from './examples/minimal';
import { runDashboardExample } from './examples/dashboard';
import { runEditorExample } from './examples/editor';
import { runReportExample } from './examples/report';
import { PatchMap as ImagePatchMap } from '@conalog/patch-map/image';
import { buildPanelData, buildPanelBatch, previewImage, renderMapImage, renderMapVariants, runImageExample } from './examples/image';
import { createImageJobQueue, createImageService, ImageQueueFullError } from './examples/image-job-queue';

async function decode(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); canvas.width = 1; canvas.height = 1; }
}

async function runImageRecipes() {
  const normal = [
    { id: 'panel-a', color: '#22c55e', label: 'NORMAL' },
    { id: 'panel-b', color: '#22c55e', label: 'NORMAL' },
  ];
  const create = { data: buildPanelData(normal), width: 320, height: 180, background: '#ffffff', fit: { padding: 20 } };
  const before = JSON.stringify(normal);
  const probe = await ImagePatchMap.create(create);
  let resetPixels, residualBatch, previewDecoded, failureCleanup;
  const outputs = [];
  try {
    await probe.render();
    const runtimeBefore = probe.assets.status().runtime;
    const standalone = await renderMapImage({ create });
    const expected = await decode(standalone.blob);
    const variants = new Map();
    await runImageExample(async (name, image) => {
      if (image.blob.size === 0 || image.size[0] !== 320 || image.size[1] !== 180 ||
          image.mime !== (name === 'single' ? 'image/jpeg' : 'image/png')) throw new Error('image recipe metadata failed');
      variants.set(name, await decode(image.blob));
      outputs.push(name);
    });
    const restored = variants.get('restored').data;
    const warning = variants.get('warning').data;
    const expectedWarning = await decode((await renderMapImage({ create: {
      ...create, data: buildPanelData(normal.map(row => row.id === 'panel-a' ? { ...row, color: '#ff0000', label: 'WARN' } : row)),
    } })).blob);
    const center = (100 * 320 + 100) * 4;
    resetPixels = restored.every((value, index) => value === expected.data[index]) &&
      warning.every((value, index) => value === expectedWarning.data[index]) &&
      warning[center] === 255 && warning[center + 1] === 0 && restored[center] === 34 && restored[center + 1] === 197;
    const changed = await renderMapImage({ create, updates: buildPanelBatch(normal.map(row => ({ ...row, color: '#0000ff', label: 'BLUE' }))) });
    const changedPixels = await decode(changed.blob);
    residualBatch = changedPixels.data[center] === 0 && changedPixels.data[center + 2] === 255;
    await previewImage('packed-image-example', standalone);
    const preview = document.querySelector('img[alt="packed-image-example"]');
    previewDecoded = preview?.complete && preview?.naturalWidth === 320;
    preview?.remove();
    let missingRejected = false, invalidRejected = false, consumerRejected = false;
    try { await renderMapImage({ create, updates: { targets: ['missing'], text: { text: ['bad'] } } }); }
    catch (error) { missingRejected = error instanceof TypeError; }
    try { await renderMapImage({ create, updates: { targets: ['panel-a', 'panel-b'], text: { text: ['bad'] } } }); }
    catch (error) { invalidRejected = error instanceof RangeError; }
    try {
      await renderMapVariants(create, [{ name: 'fail', updates: buildPanelBatch(normal) }], async () => { throw new Error('host consumer failed'); });
    } catch (error) { consumerRejected = error.message === 'host consumer failed'; }
    const runtimeAfter = probe.assets.status().runtime;
    failureCleanup = missingRejected && invalidRejected && consumerRejected &&
      runtimeAfter.resourceCount === runtimeBefore.resourceCount && runtimeAfter.leaseCount === runtimeBefore.leaseCount;
    if (!failureCleanup) throw new Error('recipe cleanup: ' + JSON.stringify({ missingRejected, invalidRejected, consumerRejected, runtimeBefore, runtimeAfter }));
  } finally { await probe.destroy(); }

  const queue = createImageJobQueue(1, 1);
  const order = [];
  let unblock;
  const first = queue.submit(async () => {
    order.push('first');
    await new Promise(resolve => { unblock = resolve; });
    throw new Error('job failed');
  });
  const firstOutcome = first.catch(error => error.message);
  const second = queue.submit(async () => { order.push('second'); return 2; });
  const overflowRejected = await queue.submit(async () => 3).then(() => false, error => error instanceof ImageQueueFullError);
  const bounded = queue.active === 1 && queue.waiting === 1 && order.length === 1;
  unblock();
  const queueRecovered = await firstOutcome === 'job failed' && await second === 2 &&
    queue.active === 0 && queue.waiting === 0 && order.join(',') === 'first,second';
  const deliveries = [], releases = [];
  let pageNumber = 0;
  let releaseFirst, notifyCleanup;
  const cleanupStarted = new Promise(resolve => { notifyCleanup = resolve; });
  const service = createImageService({
    acquirePage: async () => {
      const id = ++pageNumber;
      return { renderAndReadBytes: async () => new Uint8Array([id]), release: async () => {
        if (id === 1) { notifyCleanup(); await new Promise(resolve => { releaseFirst = resolve; }); }
        releases.push(id);
      } };
    },
    send: async (input, bytes) => { if (input === 'fail') throw new Error('delivery failed'); deliveries.push([input, bytes[0]]); },
  });
  const failedDelivery = service('fail').then(() => false, error => error.message === 'delivery failed');
  const nextDelivery = service('next');
  await cleanupStarted;
  const waitedForCleanup = pageNumber === 1 && deliveries.length === 0;
  releaseFirst();
  const deliveryRejected = await failedDelivery;
  await nextDelivery;
  const serviceRecovered = deliveryRejected && waitedForCleanup && releases.join(',') === '1,2' && JSON.stringify(deliveries) === JSON.stringify([['next', 2]]);
  const result = { outputs, resetPixels, residualBatch, previewDecoded, failureCleanup, overflowRejected, bounded, queueRecovered, serviceRecovered, immutable: JSON.stringify(normal) === before };
  if (outputs.join(',') !== 'single,warning,restored' || Object.values(result).some(value => value === false || value === undefined)) {
    throw new Error('image recipes failed: ' + JSON.stringify(result));
  }
  return result;
}

const examples = [
  ['minimal', runMinimalExample],
  ['dashboard', runDashboardExample],
  ['editor', runEditorExample],
  ['report', runReportExample],
  ['image', runImageRecipes],
];
const results = [];
for (const [name, run] of examples) {
  const host = document.createElement('div');
  host.dataset.example = name;
  host.style.width = '480px';
  host.style.height = '280px';
  document.body.appendChild(host);
  try {
    const result = await run(host);
    results.push({ name, status: 'pass', result });
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    host.remove();
  }
}
window.__PATCH_MAP_PACKAGE_EXAMPLES__ = {
  compiledExamples: examples.map(([name]) => name),
  executedExamples: results.filter(({ status }) => status === 'pass').map(({ name }) => name),
  results,
  remainingCanvasCount: document.querySelectorAll('canvas').length,
};
`;
}

export function html(entry) {
  return `<!doctype html>
<html><body><script type="module" src="${entry}"></script></body></html>\n`;
}
