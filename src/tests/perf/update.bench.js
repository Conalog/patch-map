import { afterAll, bench, describe } from 'vitest';
import { Patchmap } from '../../patchmap';
import drawBenchData from './draw-data.json';

const BENCH_OPTIONS = {
  warmupIterations: 0,
  warmupTime: 20,
  iterations: 3,
  time: 80,
};

const PANEL_ITEM_SELECTOR = '$..children[?(@.display=="panelGroup")].children';
const ALL_ITEM_SELECTOR = '$..children[?(@.type==="item")]';

const describeInBrowser =
  typeof document !== 'undefined' ? describe : describe.skip;

const flattenElements = (value) => {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
};

const assertDrawableData = (data) => {
  if (!Array.isArray(data)) {
    throw new TypeError('draw-data.json must export a top-level array.');
  }
};

const getJsonSizeBytes = (data) =>
  new TextEncoder().encode(JSON.stringify(data)).length;

const countDataNodes = (nodes) => {
  let count = 0;
  const stack = Array.isArray(nodes) ? [...nodes] : [nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;

    count += 1;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }

  return count;
};

const panelInitChanges = () => ({
  components: [
    { type: 'bar', animation: false },
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
    { type: 'icon', show: true, size: 20, source: 'loading', tint: 'black' },
  ],
});

const panelChartChanges = (index, variant) => {
  const high = (index + variant) % 2 === 0;
  const percent = high ? 76 : 31;
  const tint = high ? 'primary.default' : 'primary.dark';
  return {
    components: [
      {
        type: 'bar',
        show: true,
        size: { height: `${percent}%` },
        tint,
        animation: true,
      },
      { type: 'icon', show: false },
      { type: 'text', show: false },
    ],
  };
};

const panelTextChanges = (index, variant) => {
  const tint = (index + variant) % 3 === 0 ? '#f59e0b' : '#22c55e';
  return {
    components: [
      { type: 'bar', show: true, size: '100%', tint, animation: false },
      { type: 'icon', show: false },
      {
        type: 'text',
        show: true,
        text: `${(index + 1) * (variant + 1)}\nW`,
        style: { fill: 'white' },
      },
    ],
  };
};

const panelMixedChanges = (index, variant) => {
  if (index % 11 === 0) {
    return {
      components: [
        {
          type: 'bar',
          show: true,
          size: '100%',
          tint: 'gray.dark',
          animation: false,
        },
        { type: 'icon', show: true, source: 'warning', tint: 'white' },
        { type: 'text', show: false },
      ],
    };
  }
  if (index % 17 === 0) {
    return {
      components: [
        {
          type: 'bar',
          show: true,
          size: '100%',
          tint: 'gray.light',
          animation: false,
        },
        { type: 'icon', show: true, source: 'wifi', tint: 'white' },
        { type: 'text', show: false },
      ],
    };
  }
  return index % 5 === 0
    ? panelTextChanges(index, variant)
    : panelChartChanges(index, variant);
};

const createChangesList = (items, factory, variant) =>
  items.map((_, index) => factory(index, variant));

describeInBrowser('perf: patchmap.update dashboard plant-map', () => {
  let patchmap;
  let hostElement;
  let panelItems = [];
  let allItems = [];
  let panelInitA;
  let panelInitB;
  let panelChartA = [];
  let panelChartB = [];
  let panelMixedA = [];
  let panelMixedB = [];
  let isPrepared = false;

  const setupPatchmap = async () => {
    if (isPrepared) return;
    assertDrawableData(drawBenchData);

    document.body.innerHTML = '';
    hostElement = document.createElement('div');
    hostElement.style.width = '100vw';
    hostElement.style.height = '100vh';
    document.body.appendChild(hostElement);

    patchmap = new Patchmap();
    await patchmap.init(hostElement);
    patchmap.draw(drawBenchData);

    panelItems = flattenElements(patchmap.selector(PANEL_ITEM_SELECTOR)).filter(
      (item) => item?.type === 'item',
    );
    allItems = flattenElements(patchmap.selector(ALL_ITEM_SELECTOR)).filter(
      (item) => item?.type === 'item',
    );

    panelInitA = panelInitChanges();
    panelInitB = {
      components: [
        { type: 'bar', show: false },
        { type: 'icon', show: true, source: 'loading', tint: 'black' },
      ],
    };
    panelChartA = createChangesList(panelItems, panelChartChanges, 0);
    panelChartB = createChangesList(panelItems, panelChartChanges, 1);
    panelMixedA = createChangesList(panelItems, panelMixedChanges, 0);
    panelMixedB = createChangesList(panelItems, panelMixedChanges, 1);

    runPanelInitUpdate(panelInitA);
    runPanelInitUpdate(panelInitB);
    runPanelPerItemUpdate(panelChartA);
    runPanelPerItemUpdate(panelChartB);

    console.info('[update bench context]', {
      scenario: 'dashboard plant-map',
      topLevelItems: drawBenchData.length,
      dataNodes: countDataNodes(drawBenchData),
      jsonSizeBytes: getJsonSizeBytes(drawBenchData),
      panelItems: panelItems.length,
      allItems: allItems.length,
      benchOptions: BENCH_OPTIONS,
      dataSource: 'src/tests/perf/draw-data.json',
      patchServiceUsage: [
        'objectState: per item patchmap.update({ elements: item, validateSchema: false, emit: false })',
        'panelObjectState.ondrawend: bulk patchmap.update({ elements: items, changes: panelState.init() })',
        'highlightPlugin: bulk attrs alpha updates for selected and non-selected items',
      ],
    });

    isPrepared = true;
  };

  const runPanelInitUpdate = (changes) => {
    patchmap.update({ elements: panelItems, changes });
  };

  const runPanelTrustedInitUpdate = (changes) => {
    patchmap.update({
      elements: panelItems,
      changes,
      validateSchema: false,
      emit: false,
    });
  };

  const runPanelPerItemUpdate = (changesList) => {
    for (let index = 0; index < panelItems.length; index += 1) {
      patchmap.update({
        elements: panelItems[index],
        changes: changesList[index],
        validateSchema: false,
        emit: false,
      });
    }
  };

  const runHighlightUpdate = (variant) => {
    const highlightItems = [];
    const notHighlightItems = [];
    for (let index = 0; index < allItems.length; index += 1) {
      if ((index + variant) % 7 === 0) {
        highlightItems.push(allItems[index]);
      } else {
        notHighlightItems.push(allItems[index]);
      }
    }

    patchmap.update({
      elements: highlightItems,
      changes: { attrs: { alpha: 1 } },
    });
    patchmap.update({
      elements: notHighlightItems,
      changes: { attrs: { alpha: 0.5 } },
    });
  };

  const runTrustedHighlightUpdate = (variant) => {
    const highlightItems = [];
    const notHighlightItems = [];
    for (let index = 0; index < allItems.length; index += 1) {
      if ((index + variant) % 7 === 0) {
        highlightItems.push(allItems[index]);
      } else {
        notHighlightItems.push(allItems[index]);
      }
    }

    patchmap.update({
      elements: highlightItems,
      changes: { attrs: { alpha: 1 } },
      validateSchema: false,
      emit: false,
    });
    patchmap.update({
      elements: notHighlightItems,
      changes: { attrs: { alpha: 0.5 } },
      validateSchema: false,
      emit: false,
    });
  };

  afterAll(() => {
    if (patchmap) {
      patchmap.destroy();
      patchmap = undefined;
    }
    if (hostElement?.parentElement) {
      hostElement.parentElement.removeChild(hostElement);
    }
    hostElement = undefined;
  });

  bench(
    'dashboard panel ondrawend: bulk init update',
    () => {
      runPanelInitUpdate(panelInitA);
      runPanelInitUpdate(panelInitB);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );

  bench(
    'dashboard panel ondrawend: trusted bulk init update',
    () => {
      runPanelTrustedInitUpdate(panelInitA);
      runPanelTrustedInitUpdate(panelInitB);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );

  bench(
    'dashboard panel refresh: per-item chart update',
    () => {
      runPanelPerItemUpdate(panelChartA);
      runPanelPerItemUpdate(panelChartB);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );

  bench(
    'dashboard panel refresh: per-item mixed state update',
    () => {
      runPanelPerItemUpdate(panelMixedA);
      runPanelPerItemUpdate(panelMixedB);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );

  bench(
    'dashboard highlight: bulk alpha update',
    () => {
      runHighlightUpdate(0);
      runHighlightUpdate(1);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );

  bench(
    'dashboard highlight: trusted bulk alpha update',
    () => {
      runTrustedHighlightUpdate(0);
      runTrustedHighlightUpdate(1);
    },
    { ...BENCH_OPTIONS, setup: setupPatchmap },
  );
});
