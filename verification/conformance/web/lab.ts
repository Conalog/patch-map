import { PatchMap } from '../../../packages/javascript/src/index';
import type { PatchMapInstance } from '../../../packages/javascript/src/index';
import gallery from '../../../conformance/fixtures/gallery.json';
import updates from '../../../conformance/fixtures/updates.json';
import editor from '../../../conformance/fixtures/editor.json';
import codecs from '../../../conformance/fixtures/codecs.json';
import alphaParity from '../../../conformance/fixtures/alpha-parity.json';
import serviceBlueprint from '../../../conformance/scenes/service-blueprint.json';
import catalog from '../../../conformance/scenes/feature-lab.json';
import manifest from '../../../conformance/manifest.json';
import { acquireSharedFixtureAssets, assertCommandExpectation, executeSharedCommand, EXTRA_TRACE_FIXTURES, observePublic } from '../public-runner';
import type { SharedFixture, SharedCommand } from '../public-runner';

type Scenario = { id: string; title: string; fixture: string; hint: string; kind?: string; initialFit?: readonly { id: string }[]; commands?: readonly SharedCommand[] };
const scenarios: readonly Scenario[] = catalog.scenarios;
const fixtures = new Map<string, SharedFixture>([serviceBlueprint as SharedFixture, gallery, updates, editor, codecs as SharedFixture, alphaParity, ...EXTRA_TRACE_FIXTURES].map(f => [f.id, f]));
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selector = element<HTMLSelectElement>('scenario');
fixtures.set('scenes/service-blueprint', serviceBlueprint as SharedFixture);
const map = element<HTMLDivElement>('map');
let instance: PatchMapInstance | undefined;
let secondary: PatchMapInstance | undefined;
let releaseAssets: (() => Promise<void>) | undefined;
let scenario = scenarios[0]!;
let fixture = fixtures.get(scenario.fixture)!;
let index = 0, seed = 0x51a7;
let busy = false;
let displayMode: string | undefined;
let log: unknown[] = [];
let tooltip: unknown, hover: unknown, selectionEvent: unknown;
const steps = () => scenario.commands ?? fixture.commands;
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function summary() {
  if (instance) element('brush-state').textContent = `브러시 ${instance.selection.brush.state.enabled ? '켜짐' : '꺼짐'} · ${instance.selection.brush.state.drawing ? '선택 중' : '대기'}`;
  element('progress').textContent = `${index} / ${steps().length} 단계`;
  element('summary').textContent = instance ? `선택 ${instance.selection.ids.join(', ') || '없음'} · 회전 ${instance.rotation.value}°` : '';
}
function inspect() {
  if (instance) element('observation').textContent = pretty({ scenario: scenario.id, ...observePublic(instance), debug: instance.debug.snapshot(), tooltip, hover, selectionEvent, log });
}
function status(message: string) { element('status').textContent = message; summary(); }
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLButtonElement>('button:not([data-tab])').forEach(button => { button.disabled = value; });
  selector.disabled = value;
  element<HTMLSelectElement>('brush-trigger').disabled = value;
  element<HTMLInputElement>('box').disabled = value;
  element<HTMLInputElement>('multiple').disabled = value;
}
async function act(label: string, run: () => unknown) {
  if (busy) return;
  if (!label.startsWith('service-')) displayMode = undefined;
  setBusy(true);
  try {
    const result = await run();
    log.push({ action: label, result });
    status(`${label}: ${JSON.stringify(result)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.push({ action: label, error: message }); status(`${label} 실패: ${message}`);
  } finally {
    log = log.slice(-100); setBusy(false); renderSteps();
    if (!element('inspect').hidden) inspect();
  }
}
function bind(id: string, run: () => unknown, event = 'click') {
  element(id).addEventListener(event, () => { void act(id, run); });
}
async function reset(id = scenario.id) {
  await secondary?.destroy(); secondary = undefined; element('second-map').hidden = true;
  await instance?.destroy(); instance = undefined;
  await releaseAssets?.(); releaseAssets = undefined;
  scenario = scenarios.find(value => value.id === id)!;
  fixture = fixtures.get(scenario.fixture)!;
  index = 0; displayMode = undefined; seed = 0x51a7; log = []; tooltip = undefined; hover = undefined; selectionEvent = undefined;
  selector.value = scenario.id;
  element('hint').textContent = scenario.hint;
  element('service-controls').hidden = scenario.kind !== 'service';
  map.style.width = `${fixture.surface.width}px`; map.style.height = `${fixture.surface.height}px`;
  const assets = await acquireSharedFixtureAssets(fixture); releaseAssets = assets.dispose;
  try {
    instance = await PatchMap.mount({ container: map, data: fixture.dataset, ...fixture.surface, fit: false, ...(scenario.kind === 'service' ? { theme: serviceBlueprint.theme } : {}),
      selection: { visual: { color: '#ef4444', displayMode: 'element-only' }, brush: { longPress: element<HTMLSelectElement>('brush-trigger').value === 'manual' ? false : { behavior: element<HTMLSelectElement>('brush-trigger').value as 'toggle' | 'hold', delayMs: 500 } }, allowMultiple: element<HTMLInputElement>('multiple').checked, box: element<HTMLInputElement>('box').checked ? { activationModifier: 'none' } : false },
      pointer: { tooltip: { pinOnContextMenu: true } },
      ...(assets.runtime ? { assetRuntime: assets.runtime } : {}) });
  } catch (error) { await releaseAssets(); releaseAssets = undefined; throw error; }
  if (scenario.initialFit) instance.viewport.fit({ targets: scenario.initialFit });
  instance.selection.onChange(summary);
  instance.selection.brush.onChange(summary);
  instance.pointer.onHover(value => { hover = value; });
  instance.selection.onPointerChange(value => { selectionEvent = value; });
  instance.pointer.onTooltip(value => { tooltip = value; if (!element('inspect').hidden) inspect(); });
  status(`Ready · ${scenario.title}`); renderSteps(); return { ready: scenario.id };
}
async function checked(command: SharedCommand) {
  const c = instance!;
  const before = observePublic(c);
  let result: unknown;
  try { result = await executeSharedCommand(c, command); }
  catch (error) {
    if (!command.expect?.throws) throw error;
    result = { thrown: { kind: error instanceof TypeError || error instanceof RangeError ? 'invalid-argument' : 'unexpected-error' } };
  }
  assertCommandExpectation(command, before, observePublic(c), result);
  if (command.op === 'viewport.resize') {
    const bounds = c.viewport.state.screenBounds;
    map.style.width = `${bounds[2]}px`; map.style.height = `${bounds[3]}px`;
  }
  return { commandId: command.id, ok: true, result };
}
async function step() {
  const command = steps()[index];
  if (!command) return { completed: true };
  const result = await checked(command); index++; summary(); return result;
}
function renderSteps() {
  const list = element('command-list'); list.replaceChildren();
  if (!steps().length) { list.textContent = '자동 단계가 없는 시각·수동 시나리오입니다. 조작 안내를 따라 확인하세요.'; return; }
  steps().forEach((command, i) => {
    const details = document.createElement('details');
    const title = document.createElement('summary'); title.textContent = `${i < index ? '✓' : '○'} ${i + 1}. ${command.id}`;
    if (i < index) title.className = 'pass';
    const pre = document.createElement('pre'); pre.textContent = pretty(command);
    const button = document.createElement('button'); button.textContent = '여기까지 재현';
    button.disabled = busy;
    button.onclick = () => { void act(command.id, async () => { await reset(); const results = []; while (index <= i) results.push(await step()); return results; }); };
    details.append(title, pre, button); list.append(details);
  });
}
for (const value of scenarios) { const option = document.createElement('option'); option.value = value.id; option.textContent = value.title; selector.append(option); }
for (const requirement of manifest.requirements) {
  const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = requirement.id;
  const pre = document.createElement('pre'); pre.textContent = `${requirement.document}\n\n${requirement.cases.join('\n')}`;
  details.append(title, pre); element('requirements').append(details);
}
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) tab.onclick = () => {
  document.querySelectorAll<HTMLElement>('.pane').forEach(pane => { pane.hidden = pane.id !== tab.dataset.tab; });
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
  if (tab.dataset.tab === 'inspect') inspect();
};
bind('scenario', () => reset(selector.value), 'change'); bind('reset', () => reset());
bind('brush-enable', () => instance!.selection.brush.enable());
bind('brush-disable', () => instance!.selection.brush.disable());
bind('brush-toggle', () => instance!.selection.brush.toggle());
bind('brush-trigger', () => reset(), 'change');
bind('box', () => reset(), 'change'); bind('multiple', () => reset(), 'change');
bind('step', step); bind('run-all', async () => { const results = []; while (index < steps().length) { results.push(await step()); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); } return { ok: true, steps: results }; });
bind('undo', () => instance!.history.undo()); bind('redo', () => instance!.history.redo());
bind('rotate', () => instance!.rotation.animateTo(instance!.rotation.value + 90).finished);
bind('angle-reset', () => instance!.rotation.reset()); bind('fit', () => instance!.viewport.fit());
bind('zoom-in', () => instance!.viewport.zoomBy(1.25)); bind('zoom-out', () => instance!.viewport.zoomBy(.8)); bind('pan', () => instance!.viewport.panBy([40, 0]));
bind('clear-selection', () => instance!.selection.clear());
bind('apply-angle', () => instance!.rotation.animateTo(Number(element<HTMLInputElement>('angle').value)).finished);
bind('apply-text', () => instance!.update({ id: 'text', changes: { text: element<HTMLInputElement>('text').value } }));
bind('heights', () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const ids = instance!.targets.query({ type: 'grid-cell', scope: 'instances' }).matches.map(m => m.id);
  return scenario.id !== 'animation' && ids.length ? instance!.updateBatch({ targets: ids, bar: { height: ids.map((_, i) => 6 + (seed + i * 17) % 44) } }, { animate: true }) : instance!.update({ id: 'item', bar: { height: 6 + seed % 75 } }, { animate: true });
});
bind('first-group', () => instance!.viewport.fit({ targets: ['g0', 'text', 'combiner-0', 'inverter-0'].map(id => ({ id })) }));
for (const mode of ['bar', 'text', 'noData', 'wifi', 'error'] as const) bind(`service-${mode}`, () => {
  const ids = instance!.targets.query({type: 'grid-cell', scope: 'instances'}).matches.map(m => m.id);
  let patch = structuredClone(serviceBlueprint.displayModes[mode]) as Record<string, Record<string, unknown>>;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  if (mode === 'text') patch.text!.text = ids.map((_, i) => String(100 + (seed + i * 17) % 900));
  if (mode === 'bar') patch.bar!.height = ids.map((_, i) => 1 + (seed + i * 17) % 74);
  if (displayMode === mode && (mode === 'bar' || mode === 'text')) patch = mode === 'bar' ? {bar: {height: patch.bar!.height}} : {text: {componentId: 'text', text: patch.text!.text}};
  for (const component of Object.values(patch)) for (const [key, value] of Object.entries(component)) {
    if (key === 'componentId') continue;
    if (key === 'changes') component[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, item]) => [field, Array(ids.length).fill(item)]));
    else if (!Array.isArray(value)) component[key] = Array(ids.length).fill(value);
  }
  const result = instance!.updateBatch({targets: ids, ...patch}, {animate: mode === 'bar', recordHistory: false});
  displayMode = ['committed', 'unchanged'].includes(result.status) ? mode : undefined;
  return result;
});
bind('empty', () => instance!.data.replace([]));
bind('second', async () => {
  if (secondary) { await secondary.destroy(); secondary = undefined; element('second-map').hidden = true; return '해제됨'; }
  const host = element<HTMLDivElement>('second-map'); host.hidden = false;
  // A second asset lease is owned by its own map; reuse registered runtime only.
  const assets = await acquireSharedFixtureAssets(fixture);
  try { secondary = await PatchMap.mount({ container: host, data: fixture.dataset, width: 240, height: 260, fit: true, ...(scenario.kind === 'service' ? { theme: serviceBlueprint.theme } : {}), ...(assets.runtime ? { assetRuntime: assets.runtime } : {}) }); }
  finally { await assets.dispose(); }
  return '독립 인스턴스 생성됨';
});
bind('capture', async () => { const png = await instance!.capture.png(); element<HTMLImageElement>('capture-image').src = png.dataUrl; element<HTMLDialogElement>('capture-dialog').showModal(); return { size: png.size }; });
bind('execute', () => checked(JSON.parse(element<HTMLTextAreaElement>('command').value) as SharedCommand));
bind('refresh', () => { inspect(); return '갱신됨'; });
bind('export', () => {
  const url = URL.createObjectURL(new Blob([pretty({ scenario: scenario.id, observation: instance && observePublic(instance), log })], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `patch-map-${scenario.id}.json`; link.click(); URL.revokeObjectURL(url); return '저장됨';
});
// Read-only automation access; every mutation is exercised through the visible UI.
Object.assign(window, { patchMapLab: { snapshot: () => ({ scenario: scenario.id, index, busy, log, observation: instance && observePublic(instance), brush: instance?.selection.brush.state }) } });
await act('초기화', () => reset());
