import { afterAll, bench, describe } from 'vitest';
import { Patchmap } from '../../patchmap';
import drawBenchData from './draw-data.json';

const BENCH_OPTIONS = {
  warmupIterations: 0,
  warmupTime: 0,
  iterations: 5,
  time: 80,
};
const FAST_PATH_DISABLE_FLAG = '__PATCHMAP_DISABLE_INITIAL_FAST_PATH__';
const VISIBLE_SAMPLE_LOG_LIMIT = 12;

const describeInBrowser =
  typeof document !== 'undefined' ? describe : describe.skip;

const PATCH_SERVICE_FIT_OPTIONS = {
  filter: (obj) => obj.type !== 'image',
  padding: { y: 160 },
};

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

const getJsonSizeBytes = (data) =>
  new TextEncoder().encode(JSON.stringify(data)).length;

const assertDrawableData = (data) => {
  if (!Array.isArray(data)) {
    throw new TypeError('draw-data.json must export a top-level array.');
  }
};

const waitForPostrender = (app, timeoutMs = 30_000) =>
  new Promise((resolve, reject) => {
    const listener = {
      postrender: () => {
        clearTimeout(timeoutId);
        app.renderer.runners.postrender.remove(listener);
        resolve(performance.now());
      },
    };
    const timeoutId = setTimeout(() => {
      app.renderer.runners.postrender.remove(listener);
      reject(
        new Error(`Timed out waiting for postrender after ${timeoutMs}ms.`),
      );
    }, timeoutMs);

    app.renderer.runners.postrender.add(listener);
  });

const waitForAnimationFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve(performance.now()));
  });

const waitForVisibleFrame = async (app) => {
  const renderedAt = await waitForPostrender(app);
  const visibleAt = await waitForAnimationFrame();

  return { renderedAt, visibleAt };
};

const waitForPatchmapDraw = (patchmap, timeoutMs = 30_000) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      patchmap.off('patchmap:draw', onDraw);
      reject(
        new Error(`Timed out waiting for patchmap:draw after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
    const onDraw = () => {
      clearTimeout(timeoutId);
      resolve(performance.now());
    };
    patchmap.once('patchmap:draw', onDraw);
  });

const roundMetric = (value) => Number(value.toFixed(2));

const toLoggableSample = (sample) => ({
  label: sample.label,
  sample: sample.sample,
  drawMs: roundMetric(sample.drawMs),
  readyWaitMs:
    sample.readyWaitMs == null ? undefined : roundMetric(sample.readyWaitMs),
  renderWaitMs: roundMetric(sample.renderWaitMs),
  visibleWaitMs: roundMetric(sample.visibleWaitMs),
  totalMs: roundMetric(sample.totalMs),
  patchServiceSyncCount: sample.patchServiceSyncCount,
  patchServiceSyncMs:
    sample.patchServiceSyncMs == null
      ? undefined
      : roundMetric(sample.patchServiceSyncMs),
  reportPanelUpdateCount: sample.reportPanelUpdateCount,
  reportPanelUpdateMs:
    sample.reportPanelUpdateMs == null
      ? undefined
      : roundMetric(sample.reportPanelUpdateMs),
});

const summarizeSamples = (samples) => {
  const byLabel = new Map();

  for (const sample of samples) {
    const current = byLabel.get(sample.label) ?? {
      label: sample.label,
      samples: 0,
      drawMs: 0,
      readyWaitMs: 0,
      renderWaitMs: 0,
      visibleWaitMs: 0,
      totalMs: 0,
      patchServiceSyncMs: 0,
      reportPanelUpdateMs: 0,
    };

    current.samples += 1;
    current.drawMs += sample.drawMs;
    current.readyWaitMs += sample.readyWaitMs ?? 0;
    current.renderWaitMs += sample.renderWaitMs;
    current.visibleWaitMs += sample.visibleWaitMs;
    current.totalMs += sample.totalMs;
    current.patchServiceSyncMs += sample.patchServiceSyncMs ?? 0;
    current.reportPanelUpdateMs += sample.reportPanelUpdateMs ?? 0;
    byLabel.set(sample.label, current);
  }

  return [...byLabel.values()].map((summary) => ({
    label: summary.label,
    samples: summary.samples,
    drawMeanMs: Number((summary.drawMs / summary.samples).toFixed(2)),
    readyWaitMeanMs: Number((summary.readyWaitMs / summary.samples).toFixed(2)),
    renderWaitMeanMs: Number(
      (summary.renderWaitMs / summary.samples).toFixed(2),
    ),
    visibleWaitMeanMs: Number(
      (summary.visibleWaitMs / summary.samples).toFixed(2),
    ),
    totalMeanMs: Number((summary.totalMs / summary.samples).toFixed(2)),
    patchServiceSyncMeanMs: Number(
      (summary.patchServiceSyncMs / summary.samples).toFixed(2),
    ),
    reportPanelUpdateMeanMs: Number(
      (summary.reportPanelUpdateMs / summary.samples).toFixed(2),
    ),
  }));
};

const summarizeInitialDrawSamples = (samples) => {
  const byLabel = new Map();

  for (const sample of samples) {
    const current = byLabel.get(sample.label) ?? {
      label: sample.label,
      samples: 0,
      drawMs: 0,
    };
    current.samples += 1;
    current.drawMs += sample.drawMs;
    byLabel.set(sample.label, current);
  }

  return [...byLabel.values()].map((summary) => ({
    label: summary.label,
    samples: summary.samples,
    drawMeanMs: Number((summary.drawMs / summary.samples).toFixed(2)),
  }));
};

const flattenElements = (value) => {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
};

const pushChildren = (stack, target) => {
  if (!Array.isArray(target?.children) || target.children.length === 0) return;
  stack.push(...target.children);
};

const createItemElementMap = (children) => {
  const itemElementMap = new Map();
  const stack = [...children];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.type === 'item' && current.id) {
      itemElementMap.set(current.id, current);
    }
    pushChildren(stack, current);
  }
  return itemElementMap;
};

const createPatchServiceSync = (context) => {
  const { patchmap } = context;
  context.patchServiceStats = {
    children: [],
    itemElementMap: new Map(),
    syncCount: 0,
    syncMs: 0,
    reportPanelUpdateCount: 0,
    reportPanelUpdateMs: 0,
  };
  const sync = () => {
    const startedAt = performance.now();
    context.patchServiceStats.children = [...patchmap.world.children];
    context.patchServiceStats.itemElementMap = createItemElementMap(
      context.patchServiceStats.children,
    );
    context.patchServiceStats.syncCount += 1;
    context.patchServiceStats.syncMs += performance.now() - startedAt;
  };
  patchmap.on('patchmap:draw', sync);
  patchmap.on('patchmap:updated', sync);
  return context.patchServiceStats;
};

const hideRelations = (patchmap) => {
  patchmap.update({
    path: '$..children[?(@.type==="relations")]',
    changes: { show: false },
  });
};

const hideInactiveGridCells = (patchmap) => {
  patchmap.update({
    path: '$..children[?(@.type==="grid")]',
    changes: { inactiveCellStrategy: 'hide' },
  });
};

const updateReportPanelBackgrounds = (context) => {
  const { patchmap } = context;
  const startedAt = performance.now();
  let updatedCount = 0;
  const panels = flattenElements(
    patchmap.selector('$..children[?(@.type=="grid")].children', {}),
  );

  for (const panel of panels) {
    if (!panel || panel.type !== 'item') continue;
    const hash = hashString(panel.id);
    patchmap.update({
      elements: panel,
      changes: {
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: hashToPanelColor(hash),
              borderWidth: 2,
            },
          },
        ],
      },
    });
    updatedCount += 1;
  }
  context.patchServiceStats.reportPanelUpdateCount += updatedCount;
  context.patchServiceStats.reportPanelUpdateMs +=
    performance.now() - startedAt;
};

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const hashToPanelColor = (hash) => {
  const score = hash % 5;
  if (score <= 1) return '#ef4444';
  if (score === 2) return '#f59e0b';
  if (score === 3) return '#84cc16';
  return '#22c55e';
};

describeInBrowser('perf: patchmap.draw', () => {
  const contexts = new Map();
  const initialDrawSamples = [];
  const visibleSamples = [];
  const loggedContexts = new Set();

  const createContext = async (name, configure) => {
    assertDrawableData(drawBenchData);

    const hostElement = document.createElement('div');
    hostElement.style.width = '100vw';
    hostElement.style.height = '100vh';
    document.body.appendChild(hostElement);

    const patchmap = new Patchmap();
    await patchmap.init(hostElement);
    const context = { name, patchmap, hostElement };
    configure?.(context);
    return context;
  };

  const getContext = async (name, configure) => {
    const existing = contexts.get(name);
    if (existing) return existing;

    const context = await createContext(name, configure);
    contexts.set(name, context);

    await drawAndWaitForVisible(context, () => {
      context.patchmap.draw(drawBenchData);
    });

    console.info('[draw bench context]', {
      scenario: name,
      topLevelItems: drawBenchData.length,
      dataNodes: countDataNodes(drawBenchData),
      jsonSizeBytes: getJsonSizeBytes(drawBenchData),
      benchOptions: BENCH_OPTIONS,
      dataSource: 'src/tests/perf/draw-data.json',
    });

    return context;
  };

  const cleanupContext = (context) => {
    if (!context) return;
    contexts.delete(context.name);
    context.patchmap.destroy();
    if (context.hostElement?.parentElement) {
      context.hostElement.parentElement.removeChild(context.hostElement);
    }
  };

  const logBenchContext = (name) => {
    if (loggedContexts.has(name)) return;
    loggedContexts.add(name);
    console.info('[draw bench context]', {
      scenario: name,
      topLevelItems: drawBenchData.length,
      dataNodes: countDataNodes(drawBenchData),
      jsonSizeBytes: getJsonSizeBytes(drawBenchData),
      benchOptions: BENCH_OPTIONS,
      dataSource: 'src/tests/perf/draw-data.json',
    });
  };

  const drawAndWaitForVisible = async (context, drawAction) => {
    const visibleFrame = waitForVisibleFrame(context.patchmap.app);
    drawAction();
    await visibleFrame;
  };

  const measureDrawToVisible = async (label, context, drawAction) => {
    const startedAt = performance.now();

    drawAction();

    const drawReturnedAt = performance.now();
    const visibleFrame = waitForVisibleFrame(context.patchmap.app);
    const { renderedAt, visibleAt } = await visibleFrame;
    const sample = {
      label,
      sample: visibleSamples.length + 1,
      drawMs: drawReturnedAt - startedAt,
      renderWaitMs: renderedAt - drawReturnedAt,
      visibleWaitMs: visibleAt - drawReturnedAt,
      totalMs: visibleAt - startedAt,
    };
    visibleSamples.push(sample);

    if (visibleSamples.length <= VISIBLE_SAMPLE_LOG_LIMIT) {
      console.info('[draw-to-visible sample]', toLoggableSample(sample));
    }
  };

  const measureInitialDrawOnly = async (label, configure, drawAction) => {
    const context = await createContext(label, configure);
    try {
      const startedAt = performance.now();
      drawAction(context);
      const drawReturnedAt = performance.now();
      const sample = {
        label,
        sample: initialDrawSamples.length + 1,
        drawMs: drawReturnedAt - startedAt,
      };
      initialDrawSamples.push(sample);

      if (initialDrawSamples.length <= VISIBLE_SAMPLE_LOG_LIMIT) {
        console.info('[initial-draw sample]', {
          label: sample.label,
          sample: sample.sample,
          drawMs: roundMetric(sample.drawMs),
        });
      }
    } finally {
      cleanupContext(context);
    }
  };

  const measurePatchServiceReady = async (label, context, drawAction) => {
    const stats = context.patchServiceStats;
    const syncCountBefore = stats?.syncCount ?? 0;
    const syncMsBefore = stats?.syncMs ?? 0;
    const reportPanelUpdateCountBefore = stats?.reportPanelUpdateCount ?? 0;
    const reportPanelUpdateMsBefore = stats?.reportPanelUpdateMs ?? 0;
    const startedAt = performance.now();
    const drawEvent = waitForPatchmapDraw(context.patchmap);

    drawAction();

    const drawReturnedAt = performance.now();
    const visibleFrame = waitForVisibleFrame(context.patchmap.app);
    const drawEventAt = await drawEvent;
    const { renderedAt, visibleAt } = await visibleFrame;
    const sample = {
      label,
      sample: visibleSamples.length + 1,
      drawMs: drawReturnedAt - startedAt,
      readyWaitMs: drawEventAt - drawReturnedAt,
      renderWaitMs: renderedAt - drawReturnedAt,
      visibleWaitMs: visibleAt - drawReturnedAt,
      totalMs: visibleAt - startedAt,
      patchServiceSyncCount: (stats?.syncCount ?? 0) - syncCountBefore,
      patchServiceSyncMs: (stats?.syncMs ?? 0) - syncMsBefore,
      reportPanelUpdateCount:
        (stats?.reportPanelUpdateCount ?? 0) - reportPanelUpdateCountBefore,
      reportPanelUpdateMs:
        (stats?.reportPanelUpdateMs ?? 0) - reportPanelUpdateMsBefore,
    };
    visibleSamples.push(sample);

    if (visibleSamples.length <= VISIBLE_SAMPLE_LOG_LIMIT) {
      console.info('[patch-service-ready sample]', toLoggableSample(sample));
    }
  };

  const setupCore = async () => getContext('core draw only');
  const setupCoreInitial = () => logBenchContext('core initial draw only');
  const setupCoreInitialBaseline = () => {
    globalThis[FAST_PATH_DISABLE_FLAG] = true;
    logBenchContext('core initial draw baseline');
  };
  const setupCoreInitialFastPath = () => {
    globalThis[FAST_PATH_DISABLE_FLAG] = false;
    logBenchContext('core initial draw fast path');
  };
  const setupCoreInitialVisible = () =>
    logBenchContext('core initial draw-to-visible');

  const setupPatchServiceEditor = async () =>
    getContext('patch-service editor', (context) => {
      createPatchServiceSync(context);
      context.patchmap.on('patchmap:draw', () => {
        hideInactiveGridCells(context.patchmap);
      });
    });
  const setupPatchServiceEditorInitial = async () =>
    logBenchContext('patch-service editor initial draw');
  const configurePatchServiceEditor = (context) => {
    createPatchServiceSync(context);
    context.patchmap.on('patchmap:draw', () => {
      hideInactiveGridCells(context.patchmap);
    });
  };

  const setupPatchServiceDashboard = async () =>
    getContext('patch-service dashboard widget', (context) => {
      createPatchServiceSync(context);
      context.patchmap.on('patchmap:draw', () => {
        hideRelations(context.patchmap);
      });
    });
  const setupPatchServiceDashboardInitial = async () =>
    logBenchContext('patch-service dashboard initial draw');
  const configurePatchServiceDashboard = (context) => {
    createPatchServiceSync(context);
    context.patchmap.on('patchmap:draw', () => {
      hideRelations(context.patchmap);
    });
  };

  const setupPatchServiceReport = async () =>
    getContext('patch-service report panel-performance', (context) => {
      createPatchServiceSync(context);
      context.patchmap.on('patchmap:draw', () => {
        updateReportPanelBackgrounds(context);
      });
    });

  afterAll(() => {
    globalThis[FAST_PATH_DISABLE_FLAG] = false;
    if (initialDrawSamples.length > 0) {
      console.info(
        '[initial-draw summary]',
        summarizeInitialDrawSamples(initialDrawSamples),
      );
    }
    if (visibleSamples.length > 0) {
      console.info(
        '[draw-to-visible summary]',
        summarizeSamples(visibleSamples),
      );
    }
    for (const context of contexts.values()) {
      context.patchmap.destroy();
      if (context.hostElement?.parentElement) {
        context.hostElement.parentElement.removeChild(context.hostElement);
      }
    }
  });

  bench(
    'core initial draw baseline',
    async () => {
      await measureInitialDrawOnly(
        'core initial draw baseline',
        undefined,
        (context) => {
          context.patchmap.draw(drawBenchData);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupCoreInitialBaseline },
  );

  bench(
    'core initial draw fast path',
    async () => {
      await measureInitialDrawOnly(
        'core initial draw fast path',
        undefined,
        (context) => {
          context.patchmap.draw(drawBenchData);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupCoreInitialFastPath },
  );

  bench(
    'core initial draw',
    async () => {
      await measureInitialDrawOnly(
        'core initial draw',
        undefined,
        (context) => {
          context.patchmap.draw(drawBenchData);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupCoreInitial },
  );

  bench(
    'core initial draw-to-visible',
    async () => {
      const context = await createContext('core initial draw-to-visible');
      try {
        await measureDrawToVisible('core initial draw', context, () => {
          context.patchmap.draw(drawBenchData);
        });
      } finally {
        cleanupContext(context);
      }
    },
    { ...BENCH_OPTIONS, setup: setupCoreInitialVisible },
  );

  bench(
    'patch-service editor ready: initial draw',
    async () => {
      const context = await createContext(
        'patch-service editor initial draw',
        configurePatchServiceEditor,
      );
      try {
        await measurePatchServiceReady(
          'patch-service editor initial draw',
          context,
          () => {
            context.patchmap.draw(drawBenchData);
            context.patchmap.fit(null, PATCH_SERVICE_FIT_OPTIONS);
          },
        );
      } finally {
        cleanupContext(context);
      }
    },
    { ...BENCH_OPTIONS, setup: setupPatchServiceEditorInitial },
  );

  bench(
    'patch-service dashboard ready: initial draw',
    async () => {
      const context = await createContext(
        'patch-service dashboard initial draw',
        configurePatchServiceDashboard,
      );
      try {
        await measurePatchServiceReady(
          'patch-service dashboard initial draw',
          context,
          () => {
            context.patchmap.draw(drawBenchData);
            context.patchmap.fit(null, PATCH_SERVICE_FIT_OPTIONS);
          },
        );
      } finally {
        cleanupContext(context);
      }
    },
    { ...BENCH_OPTIONS, setup: setupPatchServiceDashboardInitial },
  );

  bench(
    'core draw: redraw same data',
    () => {
      const { patchmap } = contexts.get('core draw only');
      patchmap.draw(drawBenchData);
    },
    { ...BENCH_OPTIONS, setup: setupCore },
  );

  bench(
    'core draw-to-visible: redraw same data',
    async () => {
      const context = contexts.get('core draw only');
      await measureDrawToVisible('core redraw same data', context, () => {
        context.patchmap.draw(drawBenchData);
      });
    },
    { ...BENCH_OPTIONS, setup: setupCore },
  );

  bench(
    'patch-service editor ready: initial-like redraw',
    async () => {
      const context = contexts.get('patch-service editor');
      await measurePatchServiceReady(
        'patch-service editor initial-like redraw',
        context,
        () => {
          context.patchmap.draw(drawBenchData);
          context.patchmap.fit(null, PATCH_SERVICE_FIT_OPTIONS);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupPatchServiceEditor },
  );

  bench(
    'patch-service dashboard ready: blueprint redraw',
    async () => {
      const context = contexts.get('patch-service dashboard widget');
      await measurePatchServiceReady(
        'patch-service dashboard blueprint redraw',
        context,
        () => {
          context.patchmap.draw(drawBenchData);
          context.patchmap.fit(null, PATCH_SERVICE_FIT_OPTIONS);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupPatchServiceDashboard },
  );

  bench(
    'patch-service report ready: date redraw',
    async () => {
      const context = contexts.get('patch-service report panel-performance');
      await measurePatchServiceReady(
        'patch-service report date redraw',
        context,
        () => {
          context.patchmap.draw(drawBenchData);
          context.patchmap.fit(null, PATCH_SERVICE_FIT_OPTIONS);
        },
      );
    },
    { ...BENCH_OPTIONS, setup: setupPatchServiceReport },
  );

  bench(
    'core draw: clear then draw data',
    () => {
      const { patchmap } = contexts.get('core draw only');
      patchmap.draw([]);
      patchmap.draw(drawBenchData);
    },
    { ...BENCH_OPTIONS, setup: setupCore },
  );

  bench(
    'core draw-to-visible: clear then draw data',
    async () => {
      const context = contexts.get('core draw only');
      await measureDrawToVisible('core clear then draw data', context, () => {
        context.patchmap.draw([]);
        context.patchmap.draw(drawBenchData);
      });
    },
    { ...BENCH_OPTIONS, setup: setupCore },
  );
});
