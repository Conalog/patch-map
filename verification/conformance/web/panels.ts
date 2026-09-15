import { PatchMap } from '../../../packages/javascript/src/index';
import scene from '../../../conformance/scenes/panel-groups.json';

const { groups, rows, columns, groupColumns, groupGap, grid } = scene;
const count = groups * rows * columns;
const fullHeight = grid.item.size.height - 2 * grid.item.padding;
const targets = Array.from({ length: count }, (_, i) => `g${Math.floor(i / (rows * columns))}.${Math.floor(i % (rows * columns) / columns)}.${i % columns}`);
const percentages = new Uint8Array(count).fill(100);
const heights = new Float64Array(count).fill(fullHeight);
const fullHeights = new Float64Array(count).fill(fullHeight);
const visible = new Array<boolean>(count).fill(true);
const hidden = new Array<boolean>(count).fill(false);
const texts = new Array<string>(count).fill('0');
const status = document.querySelector<HTMLElement>('#status')!;
const mode = document.querySelector<HTMLSelectElement>('#mode')!;
const animate = document.querySelector<HTMLInputElement>('#animate')!;
const change = document.querySelector<HTMLButtonElement>('#change')!;
let textMode = false;
let seed = scene.seed;
let updates = 0;

const instance = await PatchMap.mount({
  container: document.querySelector<HTMLDivElement>('#map')!,
  fit: false,
  historyLimit: 0,
  selection: { box: false },
  theme: scene.theme,
  data: Array.from({ length: groups }, (_, g) => ({
    ...grid,
    id: `g${g}`,
    attrs: {
      ...grid.attrs,
      x: g % groupColumns * (columns * grid.item.size.width + (columns - 1) * grid.gap + groupGap),
      y: Math.floor(g / groupColumns) * (rows * grid.item.size.height + (rows - 1) * grid.gap + groupGap),
    },
    cells: Array.from({ length: rows }, () => Array<number>(columns).fill(1)),
  })),
});
instance.viewport.fit();
status.textContent = '5,000개 panel 준비 완료';
document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select').forEach((control) => { control.disabled = false; });

function report(label: string, result: ReturnType<typeof instance.updateBatch>): void {
  status.textContent = `${label} · ${result.appliedCount}개 · ${result.status}`;
  if (result.status !== 'committed' && result.status !== 'unchanged') throw new Error(JSON.stringify(result));
}

mode.addEventListener('change', () => {
  const nextTextMode = mode.value === 'text';
  try {
    report(`${nextTextMode ? '텍스트' : '높이'} 모드`, instance.updateBatch({
      targets,
      bar: { componentId: 'bar', height: nextTextMode ? fullHeights : heights },
      text: { componentId: 'text', changes: { show: nextTextMode ? visible : hidden }, text: texts },
    }, { animate: false, recordHistory: false }));
    textMode = nextTextMode;
    animate.disabled = textMode;
    change.textContent = textMode ? '전체 텍스트 랜덤 변경' : '전체 높이 랜덤 변경';
  } catch (error) { mode.value = textMode ? 'text' : 'bar'; status.textContent = String(error); }
});

change.addEventListener('click', () => {
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    if (textMode) {
      let value = 1 + seed % 9999;
      if (String(value) === texts[i]) value = value % 9999 + 1;
      texts[i] = String(value);
    } else {
      let percent = 1 + seed % 100;
      if (percent === percentages[i]) percent = percent % 100 + 1;
      percentages[i] = percent;
      heights[i] = fullHeight * percent / 100;
    }
  }
  try {
    const result = instance.updateBatch({ targets, ...(textMode
      ? { text: { componentId: 'text', text: texts } }
      : { bar: { componentId: 'bar', height: heights } }) }, { animate: !textMode && animate.checked, recordHistory: false });
    report(`${textMode ? '텍스트' : '높이'} 변경 ${++updates}회`, result);
  } catch (error) { status.textContent = String(error); }
});
document.querySelector('#fit')!.addEventListener('click', () => { instance.viewport.fit(); });
document.querySelector('#in')!.addEventListener('click', () => { instance.viewport.zoomBy(1.25); });
document.querySelector('#out')!.addEventListener('click', () => { instance.viewport.zoomBy(0.8); });
instance.viewport.onSettled((state) => {
  document.querySelector('#camera')!.textContent = `${Math.round(state.scale * 100)}% · ${state.centerWorld.map(Math.round).join(', ')}`;
});

// Explicit demo probe; no scene readback or traversal in the update path.
Object.assign(window, { patchMapPanelDemo: { instance, targets } });
