import { bench, describe } from 'vitest';
import { Patchmap } from '../../patchmap';
import { benchData } from './data';

const itemsSelector = '$..[?(@.display=="panelGroup")].children';

const countFields = (value) => {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + countFields(entry), 0);
  }
  return Object.keys(value).reduce(
    (sum, key) => sum + 1 + countFields(value[key]),
    0,
  );
};

describe('perf: update hot path', () => {
  let patchmap;
  let hostElement;
  let items = [];
  let changesListSmall = [];
  let changesListLarge = [];
  let changesListBarHeight = [];
  let updateOptionsSmallRelativeTrue = [];
  let updateOptionsSmallRelativeFalse = [];
  let updateOptionsLargeRelativeTrue = [];
  let updateOptionsBarHeightRelativeTrue = [];
  let warmupDone = false;
  let isInit = false;

  const applyOptions = { mergeStrategy: 'merge', refresh: false };

  const ensureInit = async () => {
    if (isInit) return;
    document.body.innerHTML = '';
    hostElement = document.createElement('div');
    hostElement.style.height = '100svh';
    document.body.appendChild(hostElement);

    patchmap = new Patchmap();
    await patchmap.init(hostElement);
    isInit = true;
  };

  const resetState = () => {
    patchmap.draw(benchData);
    items = patchmap.selector(itemsSelector);

    patchmap.update({
      elements: items,
      changes: {
        components: [
          {
            type: 'text',
            text: '',
            style: {
              fontWeight: '600',
              fontSize: 'auto',
              autoFont: { min: 8, max: 14 },
              align: 'center',
              fill: 'white',
              breakWords: true,
              wordWrapWidth: 'auto',
            },
            margin: 4,
          },
          {
            type: 'icon',
            show: true,
            size: 20,
            source: 'loading',
            tint: 'black',
          },
        ],
      },
    });

    changesListSmall = items.map((_, i) => ({
      attrs: { alpha: i % 2 ? 0.8 : 1 },
    }));

    changesListLarge = items.map((_, i) => ({
      attrs: { alpha: i % 2 ? 0.8 : 1 },
      components: [{ type: 'text', text: String(i), style: { fontSize: 10 } }],
    }));

    changesListBarHeight = items.map((_, i) => {
      const percent = i % 2 ? 70 : 30;
      const tint = i % 2 ? 'primary.default' : 'status.success';
      return {
        components: [
          {
            type: 'bar',
            show: true,
            size: { height: `${percent}%` },
            tint,
            animation: true,
          },
        ],
      };
    });

    updateOptionsSmallRelativeTrue = items.map((item, i) => ({
      elements: item,
      changes: changesListSmall[i],
      relativeTransform: true,
    }));

    updateOptionsSmallRelativeFalse = items.map((item, i) => ({
      elements: item,
      changes: changesListSmall[i],
      relativeTransform: false,
    }));

    updateOptionsLargeRelativeTrue = items.map((item, i) => ({
      elements: item,
      changes: changesListLarge[i],
      relativeTransform: true,
    }));

    updateOptionsBarHeightRelativeTrue = items.map((item, i) => ({
      elements: item,
      changes: changesListBarHeight[i],
      relativeTransform: true,
    }));
  };

  const warmup = () => {
    for (let i = 0; i < items.length; i += 1) {
      patchmap.update(updateOptionsSmallRelativeTrue[i]);
    }
  };

  const setupCycle = async () => {
    await ensureInit();
    resetState();
    if (!warmupDone) {
      warmup();
      resetState();
      const smallFieldCount = items.length
        ? countFields(changesListSmall[0])
        : 0;
      const largeFieldCount = items.length
        ? countFields(changesListLarge[0])
        : 0;
      console.info('[bench context]', {
        items: items.length,
        smallFields: smallFieldCount,
        largeFields: largeFieldCount,
        relativeTransform: { S1: true, S3: false },
      });
      warmupDone = true;
      return;
    }
    resetState();
  };

  const teardownCycle = () => {
    // Intentionally empty; state resets in setup to keep cycles consistent.
  };

  bench(
    'S1: per-item patchmap.update (relativeTransform=true, small)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        patchmap.update(updateOptionsSmallRelativeTrue[i]);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S2: per-item item.apply (small)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesListSmall[i], applyOptions);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S1-apply: per-item item.apply (small, corresponding to S1)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesListSmall[i], applyOptions);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S3: per-item patchmap.update (relativeTransform=false, small)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        patchmap.update(updateOptionsSmallRelativeFalse[i]);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S3-apply: per-item item.apply (small, corresponding to S3)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesListSmall[i], applyOptions);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S4: per-item patchmap.update (relativeTransform=true, large)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        patchmap.update(updateOptionsLargeRelativeTrue[i]);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S4-apply: per-item item.apply (large, corresponding to S4)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesListLarge[i], applyOptions);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S5: per-item patchmap.update (relativeTransform=true, bar height)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        patchmap.update(updateOptionsBarHeightRelativeTrue[i]);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );

  bench(
    'S5-apply: per-item item.apply (bar height, corresponding to S5)',
    () => {
      for (let i = 0; i < items.length; i += 1) {
        items[i].apply(changesListBarHeight[i], applyOptions);
      }
    },
    { setup: setupCycle, teardown: teardownCycle },
  );
});
