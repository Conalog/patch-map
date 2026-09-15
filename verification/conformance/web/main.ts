import { PatchMap } from '../../../src/index';
import type { PatchMapInstance } from '../../../src/index';
import gallery from '../../../conformance/fixtures/gallery.json';
import updates from '../../../conformance/fixtures/updates.json';
import editor from '../../../conformance/fixtures/editor.json';
import codecs from '../../../conformance/fixtures/codecs.json';
import { observePublic, executeSharedCommand, assertCommandExpectation, runPublicFixture, EXTRA_TRACE_FIXTURES, acquireSharedFixtureAssets } from '../public-runner';
import type { SharedFixture } from '../public-runner';

const fixtures: Readonly<Record<string, SharedFixture>> = { gallery, updates, editor, codecs: codecs as SharedFixture };
const container = document.querySelector<HTMLDivElement>('#map')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const output = document.querySelector<HTMLPreElement>('#observation')!;
let instance: PatchMapInstance | undefined;
let fixture = fixtures.gallery!;
let commandIndex = 0;
let seed = 0x51a7;
let busy = false;
let disposeAssets: (() => Promise<void>) | undefined;

function show(message: string): void {
  status.textContent = message;
  if (instance) {
    const observation = observePublic(instance);
    output.textContent = JSON.stringify({ fixture: fixture.id, semanticHash: observation.semanticHash,
      roots: observation.rootIds, targets: observation.targets.length, selection: observation.selectionIds,
      history: observation.history, editor: observation.editor, nextCommand: fixture.commands[commandIndex]?.id ?? null }, null, 2);
  }
}
async function reset(id = fixture.id): Promise<void> {
  if (instance) await instance.destroy();
  await disposeAssets?.();
  disposeAssets = undefined;
  fixture = fixtures[id]!;
  commandIndex = 0;
  document.querySelector('#surface-description')!.textContent = `Shared fixture · npm / PixiJS · ${fixture.surface.width} × ${fixture.surface.height} logical pixels`;
  container.style.width = `${fixture.surface.width}px`;
  container.style.height = `${fixture.surface.height}px`;
  const assets = await acquireSharedFixtureAssets(fixture);
  disposeAssets = assets.dispose;
  try { instance = await PatchMap.mount({ container, data: fixture.dataset, ...fixture.surface, fit: false, ...(assets.runtime ? { assetRuntime: assets.runtime } : {}) }); }
  catch (error) { await disposeAssets(); disposeAssets = undefined; throw error; }
  instance.selection.onChange(() => { show('Selection changed'); });
  show(`${fixture.id}: same input and logical surface as Flutter`);
}
function action(selector: string, callback: () => Promise<void> | void, event = 'click'): void {
  document.querySelector(selector)!.addEventListener(event, () => {
    if (busy) return;
    busy = true;
    void Promise.resolve().then(callback).catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : String(error);
      console.error(error);
    }).finally(() => { busy = false; });
  });
}
action('#fixture', () => reset(document.querySelector<HTMLSelectElement>('#fixture')!.value), 'change');
action('#reset', () => reset(document.querySelector<HTMLSelectElement>('#fixture')!.value));
action('#next', async () => {
  const command = fixture.commands[commandIndex];
  if (!instance || !command) return show('No remaining commands; choose Updates or Editor to run a trace.');
  const before = observePublic(instance);
  const result = await executeSharedCommand(instance, command);
  assertCommandExpectation(command, before, observePublic(instance), result);
  commandIndex++;
  show(`${command.id}: ${JSON.stringify(result)}`);
});
action('#heights', () => {
  if (!instance) return;
  const ids = instance.targets.query({ type: 'grid-cell', scope: 'instances' }).matches.map((target) => target.id);
  const heights = ids.map(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return 6 + seed % 44; });
  const result = instance.updateBatch({ targets: ids, bar: { componentId: 'bar', height: heights } }, { animate: true });
  show(`Seeded heights: ${result.status}, ${ids.length} grid instances`);
});
action('#undo', () => { if (instance) show(`Undo: ${instance.history.undo().status}`); });
action('#redo', () => { if (instance) show(`Redo: ${instance.history.redo().status}`); });
action('#capture', async () => {
  if (!instance) return;
  const capture = await instance.capture.png();
  const link = document.createElement('a'); link.href = capture.dataUrl; link.download = `patch-map-${fixture.id}.png`; link.click();
  show(`Captured ${capture.size.join(' × ')} logical pixels`);
});

async function traces() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:520px;pointer-events:none;z-index:-1';
  document.body.append(probe);
  try {
    const observations = [];
    for (const value of [...Object.values(fixtures), ...EXTRA_TRACE_FIXTURES]) observations.push(await runPublicFixture(value, probe));
    return { schemaRevision: 'patch-map-conformance/1', runtime: 'npm', observations };
  } finally { probe.remove(); }
}
action('#check', async () => {
  const result = await traces();
  const response = await fetch('/__conformance/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
  if (!response.ok) throw new Error('Could not retain trace evidence');
  const failures = result.observations.flatMap((trace) => trace.failures);
  show(failures.length > 0
    ? `Failed ${failures.length} expectations in ${result.observations.length} traces; all observations saved: ${JSON.stringify(failures)}`
    : `Passed ${result.observations.length} public fixture traces; observations saved`);
});

Object.assign(window, { patchMapComparison: { reset, traces, snapshot: () => instance && observePublic(instance) } });
await reset();
