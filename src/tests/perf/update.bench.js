import { bench, describe } from 'vitest';
import { Patchmap } from '../../patchmap';
import { benchData } from './data';

const itemsSelector = '$..[?(@.display=="panelGroup")].children';
const MAX_ITEMS = 1000;
const BENCH_OPTIONS = {
  warmupIterations: 0,
  warmupTime: 20,
  iterations: 3,
  time: 80,
};

const ITEM_APPLY_OPTIONS = { mergeStrategy: 'merge', refresh: false };
const BOOLEAN_OPTIONS = [false, true];
const APPLY_OPTION_MATRIX = BOOLEAN_OPTIONS.flatMap((refresh) =>
  BOOLEAN_OPTIONS.flatMap((validateSchema) =>
    BOOLEAN_OPTIONS.map((normalize) => ({
      mergeStrategy: 'merge',
      refresh,
      validateSchema,
      normalize,
    })),
  ),
);

const createItemBarOnlyPatch = (percent, tint) => ({
  components: [
    {
      type: 'bar',
      show: true,
      size: { height: `${percent}%` },
      tint,
      animation: true,
    },
  ],
});

const createBarPatch = (percent, tint) => ({
  show: true,
  size: { height: { value: percent, unit: '%' } },
  tint,
  animation: true,
});

const createMatrixLabel = (options) => {
  return `refresh=${String(options.refresh)}, validate=${String(options.validateSchema)}, normalize=${String(options.normalize)}`;
};

const describeInBrowser =
  typeof document !== 'undefined' ? describe : describe.skip;

describeInBrowser(
  'perf: update hot path (item components vs bar direct apply)',
  () => {
    let patchmap;
    let hostElement;
    let items = [];
    let bars = [];
    let updateItemBarOptionsA = [];
    let updateItemBarOptionsB = [];
    let itemBarOnlyChangesA = [];
    let itemBarOnlyChangesB = [];
    let barChangesA = [];
    let barChangesB = [];
    let isPrepared = false;

    const runPatchmapUpdate = (optionsList) => {
      for (let i = 0; i < optionsList.length; i += 1) {
        patchmap.update(optionsList[i]);
      }
    };

    const runItemApply = (changesList) => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesList[i], ITEM_APPLY_OPTIONS);
      }
    };

    const runBarApply = (changesList, options) => {
      for (let i = 0; i < bars.length; i += 1) {
        const bar = bars[i];
        if (!bar) continue;
        bar.apply(changesList[i], options);
      }
    };

    const setupCycle = async () => {
      if (isPrepared) return;

      document.body.innerHTML = '';
      hostElement = document.createElement('div');
      hostElement.style.height = '100svh';
      document.body.appendChild(hostElement);

      patchmap = new Patchmap();
      await patchmap.init(hostElement);
      patchmap.draw(benchData);

      const selectedItems = patchmap
        .selector(itemsSelector)
        .slice(0, MAX_ITEMS);
      items = selectedItems.filter((item) =>
        item.children.some((child) => child.type === 'bar'),
      );
      bars = items.map((item) =>
        item.children.find((child) => child.type === 'bar'),
      );

      itemBarOnlyChangesA = items.map((_, i) =>
        createItemBarOnlyPatch(
          i % 2 ? 70 : 30,
          i % 2 ? 'primary.default' : 'primary.dark',
        ),
      );
      itemBarOnlyChangesB = items.map((_, i) =>
        createItemBarOnlyPatch(
          i % 2 ? 30 : 70,
          i % 2 ? 'primary.dark' : 'primary.default',
        ),
      );

      barChangesA = bars.map((_, i) =>
        createBarPatch(
          i % 2 ? 70 : 30,
          i % 2 ? 'primary.default' : 'primary.dark',
        ),
      );
      barChangesB = bars.map((_, i) =>
        createBarPatch(
          i % 2 ? 30 : 70,
          i % 2 ? 'primary.dark' : 'primary.default',
        ),
      );

      updateItemBarOptionsA = items.map((item, i) => ({
        elements: item,
        changes: itemBarOnlyChangesA[i],
        emit: false, // Compare core update path without event dispatch overhead.
      }));
      updateItemBarOptionsB = items.map((item, i) => ({
        elements: item,
        changes: itemBarOnlyChangesB[i],
        emit: false, // Compare core update path without event dispatch overhead.
      }));

      runPatchmapUpdate(updateItemBarOptionsA);
      runPatchmapUpdate(updateItemBarOptionsB);

      console.info('[bench context]', {
        selectedItems: selectedItems.length,
        sampledItems: items.length,
        bars: bars.length,
        benchOptions: BENCH_OPTIONS,
      });
      isPrepared = true;
    };

    const teardownCycle = () => {};

    bench(
      'B1: patchmap.update per-item item.components (bar-only)',
      () => {
        runPatchmapUpdate(updateItemBarOptionsA);
        runPatchmapUpdate(updateItemBarOptionsB);
      },
      { ...BENCH_OPTIONS, setup: setupCycle, teardown: teardownCycle },
    );

    bench(
      'B2: item.apply per-item item.components (bar-only)',
      () => {
        runItemApply(itemBarOnlyChangesA);
        runItemApply(itemBarOnlyChangesB);
      },
      { ...BENCH_OPTIONS, setup: setupCycle, teardown: teardownCycle },
    );

    bench(
      'B3: bar.apply per-item direct bar (baseline options)',
      () => {
        runBarApply(barChangesA, ITEM_APPLY_OPTIONS);
        runBarApply(barChangesB, ITEM_APPLY_OPTIONS);
      },
      { ...BENCH_OPTIONS, setup: setupCycle, teardown: teardownCycle },
    );

    for (const options of APPLY_OPTION_MATRIX) {
      const label = createMatrixLabel(options);
      bench(
        `S6 matrix: bar.apply (${label})`,
        () => {
          runBarApply(barChangesA, options);
          runBarApply(barChangesB, options);
        },
        { ...BENCH_OPTIONS, setup: setupCycle, teardown: teardownCycle },
      );
    }
  },
);
