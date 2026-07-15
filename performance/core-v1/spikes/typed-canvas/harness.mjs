import { TypedCanvasCore } from './core.mjs';
import { generatedEntities, productionEntities, updateColumns } from './workloads.mjs';

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    unit: 'ms',
    raw: samples,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
  };
}

function mark() {
  return performance.now();
}

function runOnce(entities, sample, record) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  document.body.append(canvas);

  let start = mark();
  const core = new TypedCanvasCore(canvas);
  record.init.push(mark() - start);

  start = mark();
  core.load(entities);
  record.load.push(mark() - start);

  start = mark();
  core.flush();
  record.firstRender.push(mark() - start);

  const update = updateColumns(entities, sample);
  const resolved = core.resolve(update.ids);
  start = mark();
  core.updateResolved(resolved, { height: update.height });
  record.trustedBulkUpdate.push(mark() - start);
  core.flush();

  start = mark();
  core.updateBatch(update);
  record.validatedBulkUpdate.push(mark() - start);
  core.flush();

  const animationTargets = new Float32Array(update.height.length);
  for (let index = 0; index < animationTargets.length; index += 1) animationTargets[index] = 4 + ((index * 19 + sample) % 28);
  core.animateBatch({ ids: update.ids, height: animationTargets }, 0, 240);
  for (let frame = 1; frame <= 16; frame += 1) {
    start = mark();
    core.stepAnimation(frame * 15);
    core.flush();
    record.animationFrame.push(mark() - start);
  }

  const operations = 64;
  start = mark();
  for (let index = 0; index < operations; index += 1) {
    const entity = entities[(index * 31 + sample * 11) % entities.length];
    core.selectAt(entity.x + entity.width * 0.5, entity.y + entity.height * 0.5);
  }
  record.hitTestSelection.push((mark() - start) / operations);

  start = mark();
  core.destroy();
  canvas.remove();
  record.teardown.push(mark() - start);
}

function emptyRecord() {
  return {
    init: [], load: [], firstRender: [], trustedBulkUpdate: [], validatedBulkUpdate: [],
    animationFrame: [], hitTestSelection: [], teardown: [],
  };
}

function runWorkload(name, entities, warmups, samples) {
  for (let index = 0; index < warmups; index += 1) runOnce(entities, index, emptyRecord());
  const record = emptyRecord();
  for (let index = 0; index < samples; index += 1) runOnce(entities, index + warmups, record);
  const metrics = {};
  for (const [metric, values] of Object.entries(record)) metrics[metric] = summarize(values);
  metrics.hitTestSelection.unit = 'ms/op';
  return { name, entityCount: entities.length, warmups, samples, animationFrameSamples: record.animationFrame.length, metrics };
}

window.runTypedCanvasSpike = ({ production, sizes, warmups, samples }) => {
  const workloads = sizes.map((count) => [String(count), generatedEntities(count)]);
  workloads.push(['production-458', productionEntities(production)]);
  return workloads.map(([name, entities]) => runWorkload(name, entities, warmups, samples));
};

window.runTypedCanvasContractChecks = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const core = new TypedCanvasCore(canvas);
  const input = [
    { id: 'a', x: 1, y: 2, width: 10, height: 11, color: 0x112233, flags: 1 },
    { id: 'b', x: 20, y: 2, width: 10, height: 11, color: 0x445566, flags: 1 },
  ];
  const beforeInput = JSON.stringify(input);
  core.load(input);
  const firstFrame = core.flush();
  const beforeFailure = core.snapshot('a');
  const beforeVersion = core.version;
  let atomicError = false;
  try {
    core.updateBatch({ ids: ['a', 'missing'], x: new Float32Array([9, 10]) });
  } catch {
    atomicError = true;
  }
  const afterFailure = core.snapshot('a');
  const atomic = atomicError && beforeVersion === core.version && beforeFailure.x === afterFailure.x;
  core.updateBatch({ ids: ['a'], x: new Float32Array([8]) });
  const synchronousState = core.snapshot('a').x === 8;
  const unpublishedFrame = core.frameVersion !== core.version;
  const publishedFrame = core.flush().changed && !core.flush().changed;
  const reference = core.hitTest(8, 3);
  core.load(input);
  const staleRejected = core.snapshot(reference) === null;
  const inputImmutable = beforeInput === JSON.stringify(input);
  const drawCallsAggregated = firstFrame.drawCalls === 3;
  const destroyFirst = core.destroy();
  const destroySecond = core.destroy();
  let destroyedGuard = false;
  try { core.flush(); } catch { destroyedGuard = true; }
  const checks = {
    inputImmutable, atomic, synchronousState, unpublishedFrame, publishedFrame,
    staleRejected, drawCallsAggregated,
    lifecycleSafe: destroyFirst === true && destroySecond === false && destroyedGuard,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
};

window.typedCanvasReady = true;
