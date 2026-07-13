import { Patchmap, Transformer } from '/src/index.ts';
import { createScalingFixture } from '/scripts/perf/synthetic-fixture.js';

const host = document.querySelector('#host');
const state = {
  frameTimes: [],
  interaction: null,
  items: [],
  itemIds: new Set(),
  longTasks: [],
  longTaskObserver: null,
  patchmap: null,
  relation: null,
  traces: [],
  transformer: null,
};

const frameLoop = (timestamp) => {
  state.frameTimes.push(timestamp);
  if (state.frameTimes.length > 20_000) state.frameTimes.splice(0, 10_000);
  requestAnimationFrame(frameLoop);
};
requestAnimationFrame(frameLoop);

try {
  state.longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.longTasks.push({
        durationMs: entry.duration,
        name: entry.name,
        startTime: entry.startTime,
      });
    }
  });
  state.longTaskObserver.observe({ type: 'longtask', buffered: true });
} catch {
  state.longTaskObserver = null;
}

const setup = async (itemCount) => {
  await teardown();

  const fixture = structuredClone(createScalingFixture(itemCount));
  const grid = fixture[0];
  fixture.push({
    type: 'relations',
    id: `perf-relations-${itemCount}`,
    label: `perf-relations-${itemCount}`,
    links: [],
  });

  const patchmap = new Patchmap();
  state.patchmap = patchmap;
  await patchmap.init(host, {
    app: {
      antialias: false,
      autoStart: false,
      height: 900,
      resolution: 1,
      width: 1440,
    },
    viewport: {
      plugins: {
        decelerate: { disabled: true },
        drag: { disabled: true },
        pinch: { disabled: true },
        wheel: { disabled: true },
      },
    },
  });
  patchmap.draw(fixture);
  patchmap.app.render();

  state.items = flatten(
    patchmap.selector('$..children[?(@.type==="item")]'),
  ).filter((item) => item?.type === 'item');
  state.itemIds = new Set(state.items.map((item) => item.id));
  state.relation = flatten(
    patchmap.selector('$..children[?(@.type==="relations")]'),
  ).find((element) => element?.id === `perf-relations-${itemCount}`) ?? null;

  if (state.items.length !== itemCount) {
    throw new Error(
      `Expected ${itemCount} public item handles, received ${state.items.length}`,
    );
  }
  if (!state.relation) throw new Error('Public relations handle is missing');

  patchmap.fit(grid.id, { padding: 80 });
  patchmap.app.render();

  const transformer = new Transformer({
    boundsDisplayMode: 'all',
    resizeHandles: true,
    rotateHandles: true,
    transformHistory: false,
  });
  patchmap.transformer = transformer;
  transformer.elements = [];
  state.transformer = transformer;
  patchmap.app.render();

  return {
    canvas: canvasGeometry(),
    itemCount: state.items.length,
    relationId: state.relation.id,
  };
};

const teardown = async () => {
  const patchmap = state.patchmap;
  state.patchmap = null;
  state.transformer = null;
  state.items = [];
  state.itemIds = new Set();
  state.relation = null;
  state.traces = [];
  state.interaction = null;
  if (patchmap) patchmap.destroy();
  host.replaceChildren();
  await nextFrames(1);
};

const measureS3 = async () => {
  requireReady();
  const trustedBulk = await measureUpdateBoundary(() => {
    const returned = state.patchmap.update({
      elements: state.items,
      changes: {
        components: [{
          type: 'bar',
          size: { width: '72%', height: '68%' },
          tint: '#ef4444',
          animation: false,
        }],
      },
      emit: false,
      validateSchema: false,
    });
    const bars = state.items.map((item) => findComponent(item, 'bar'));
    return {
      assertions: [
        check(
          'trusted-bulk-return-preserves-target-count',
          returned.length === state.items.length,
          { actual: returned.length, expected: state.items.length },
        ),
        check(
          'trusted-bulk-return-preserves-public-handle-identity',
          returned.every((item, index) => item === state.items[index]),
        ),
        check(
          'trusted-bulk-state-observable-before-return',
          bars.every((bar) => bar && sizeContains(bar.props?.size, 68)),
          { observedBars: bars.filter(Boolean).length },
        ),
      ],
      targetedItems: returned.length,
    };
  });

  const sequentialMixed = await measureUpdateBoundary(() => {
    let targetCount = 0;
    let identityCount = 0;
    let immediateCount = 0;
    for (let index = 0; index < state.items.length; index += 1) {
      const item = state.items[index];
      const isBar = index % 2 === 0;
      const component = findComponent(item, isBar ? 'bar' : 'text');
      if (!component) continue;
      const changes = isBar
        ? {
            attrs: { perfSequence: index },
            size: { width: '68%', height: '52%' },
            tint: index % 4 === 0 ? '#0ea5e9' : '#22c55e',
          }
        : {
            attrs: { perfSequence: index },
            text: `P${index % 10}`,
            tint: index % 4 === 1 ? '#7c3aed' : '#db2777',
          };
      const returned = state.patchmap.update({
        elements: component,
        changes,
        emit: false,
        validateSchema: false,
      });
      targetCount += returned.length;
      if (returned[0] === component) identityCount += 1;
      if (component.props?.attrs?.perfSequence === index) immediateCount += 1;
    }
    return {
      assertions: [
        check(
          'sequential-mixed-targets-one-component-per-item',
          targetCount === state.items.length,
          { actual: targetCount, expected: state.items.length },
        ),
        check(
          'sequential-mixed-preserves-public-handle-identity',
          identityCount === state.items.length,
          { actual: identityCount, expected: state.items.length },
        ),
        check(
          'sequential-mixed-state-observable-before-each-return',
          immediateCount === state.items.length,
          { actual: immediateCount, expected: state.items.length },
        ),
      ],
      targetedComponents: targetCount,
    };
  });

  const bulkAlphaHighlight = await measureUpdateBoundary(() => {
    const alpha = 0.72;
    const highlightTint = 0xffd54f;
    for (const item of state.items) {
      item.alpha = alpha;
      item.tint = highlightTint;
    }
    const observableCount = state.items.filter(
      (item) => Math.abs(item.alpha - alpha) < 1e-9
        && Number(item.tint) === highlightTint,
    ).length;
    return {
      assertions: [
        check(
          'bulk-alpha-highlight-observable-before-render',
          observableCount === state.items.length,
          { actual: observableCount, expected: state.items.length },
        ),
      ],
      coverage: {
        highlightRepresentation: 'public-pixi-container-tint',
        mutationSurface: 'public-live-handle-alpha-and-tint',
        note:
          'The approved MapData schema does not define a separate highlight '
          + 'field, so the harness does not invent one.',
      },
      targetedItems: state.items.length,
    };
  });

  const relationVisibility = await measureUpdateBoundary(() => {
    const returned = state.patchmap.update({
      elements: state.relation,
      changes: { show: false },
      emit: false,
      validateSchema: false,
    });
    return {
      assertions: [
        check(
          'relation-visibility-return-preserves-handle',
          returned.length === 1 && returned[0] === state.relation,
        ),
        check(
          'relation-visibility-observable-before-return',
          state.relation.props?.show === false,
          { observed: state.relation.props?.show },
        ),
      ],
      targetedRelations: returned.length,
    };
  });

  const relationLinkRefresh = await measureUpdateBoundary(() => {
    const returned = state.patchmap.update({
      elements: state.relation,
      changes: { links: [], show: true },
      emit: false,
      refresh: true,
      validateSchema: false,
    });
    return {
      assertions: [
        check(
          'relation-link-refresh-return-preserves-handle',
          returned.length === 1 && returned[0] === state.relation,
        ),
        check(
          'relation-link-refresh-observable-before-return',
          state.relation.props?.show === true
            && Array.isArray(state.relation.props?.links)
            && state.relation.props.links.length === 0,
          {
            linkCount: state.relation.props?.links?.length,
            show: state.relation.props?.show,
          },
        ),
      ],
      coverage: {
        linkFixture: 'approved-empty-links-only',
        note:
          'The approved handoff does not publish a non-empty link schema; '
          + 'non-empty relation refresh remains an oracle coverage gap.',
      },
      targetedRelations: returned.length,
    };
  });

  return {
    bulkAlphaHighlight,
    relationLinkRefresh,
    relationVisibility,
    sequentialMixed,
    trustedBulk,
  };
};

const measureViewportPanZoom = async () => {
  requireReady();
  resetView();
  beginInteraction('viewport-pan-zoom');
  const viewport = state.patchmap.viewport;
  const start = {
    centerX: viewport.center.x,
    centerY: viewport.center.y,
    scale: viewport.scale.x,
  };
  const steps = 12;
  for (let index = 1; index <= steps; index += 1) {
    await nextFrames(1);
    const progress = index / steps;
    viewport.moveCenter(
      start.centerX + 64 * progress,
      start.centerY + 40 * progress,
    );
    viewport.setZoom(start.scale * (1 + 0.12 * progress), true);
    state.patchmap.app.render();
  }
  const observed = {
    centerX: viewport.center.x,
    centerY: viewport.center.y,
    scale: viewport.scale.x,
  };
  const measurement = await endInteraction();
  measurement.inputMode = 'public-pixi-viewport-api';
  measurement.finalViewport = observed;
  measurement.assertions = [
    check(
      'viewport-pan-observable',
      Math.abs(observed.centerX - start.centerX) > 1
        && Math.abs(observed.centerY - start.centerY) > 1,
      { observed, start },
    ),
    check(
      'viewport-zoom-observable',
      Math.abs(observed.scale - start.scale) > 1e-4,
      { observed: observed.scale, start: start.scale },
    ),
  ];
  resetView();
  return measurement;
};

const prepareSelection = async (mode) => {
  requireReady();
  resetView();
  state.traces = [];
  state.transformer.elements = [];
  state.patchmap.app.render();
  const paintSelection = mode === 'paint';
  const callback = (name) => (...args) => recordTrace(name, args);
  await Promise.resolve(state.patchmap.stateManager.setState('selection', {
    deepSelect: true,
    draggable: true,
    drillDown: true,
    onClick: callback('onClick'),
    onDoubleClick: callback('onDoubleClick'),
    onDown: callback('onDown'),
    onDrag: callback('onDrag'),
    onDragEnd: callback('onDragEnd'),
    onDragStart: callback('onDragStart'),
    onOver: callback('onOver'),
    onRightClick: callback('onRightClick'),
    onUp: callback('onUp'),
    paintSelection,
    selectUnit: 'entity',
  }));
  state.patchmap.app.render();
  return interactionGeometry();
};

const prepareTransformerGesture = (kind) => {
  requireReady();
  resetView();
  const element = state.items[0];
  state.transformer.elements = [element];
  state.patchmap.app.render();
  const bounds = publicBounds(element);
  const before = snapshotTransform(element);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const corner = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  let start;
  let end;
  if (kind === 'resize') {
    start = corner;
    end = { x: corner.x + 18, y: corner.y + 14 };
  } else if (kind === 'rotation') {
    const dx = corner.x - center.x;
    const dy = corner.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const viewportScale = Math.abs(state.patchmap.viewport.scale.x) || 1;
    const extension = 16 * viewportScale;
    start = {
      x: corner.x + (dx / length) * extension,
      y: corner.y + (dy / length) * extension,
    };
    const angle = Math.PI / 6;
    const radialX = start.x - center.x;
    const radialY = start.y - center.y;
    end = {
      x: center.x + radialX * Math.cos(angle) - radialY * Math.sin(angle),
      y: center.y + radialX * Math.sin(angle) + radialY * Math.cos(angle),
    };
  } else {
    throw new Error(`Unknown transformer gesture: ${kind}`);
  }
  return {
    before,
    elementId: element.id,
    end: canvasPoint(end),
    geometryRule: kind === 'rotation'
      ? 'public-bounds-outside-southeast-corner-16-world-units-scaled-to-canvas'
      : 'public-bounds-southeast-corner',
    start: canvasPoint(start),
  };
};

const finishTransformerGesture = async (kind, before) => {
  state.patchmap.app.render();
  const measurement = await endInteraction();
  const element = state.items[0];
  const after = snapshotTransform(element);
  const selectedIds = currentSelectionIds();
  const changed = kind === 'resize'
    ? transformSizeChanged(before, after)
    : transformAngleChanged(before, after);
  measurement.finalTransform = after;
  measurement.selectedIds = selectedIds;
  measurement.assertions = [
    check(
      `transformer-${kind}-changes-public-transform`,
      changed,
      { after, before },
    ),
    check(
      `transformer-${kind}-preserves-selection`,
      selectedIds.includes(element.id),
      { elementId: element.id, selectedIds },
    ),
  ];
  return measurement;
};

const beginInteraction = (name) => {
  if (state.interaction) throw new Error('An interaction is already active');
  state.interaction = {
    frameIndex: state.frameTimes.length,
    longTaskIndex: state.longTasks.length,
    name,
    startedAt: performance.now(),
    traceIndex: state.traces.length,
  };
};

const endInteraction = async () => {
  const active = state.interaction;
  if (!active) throw new Error('No interaction is active');
  await nextFrames(2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const endedAt = performance.now();
  const frameTimes = state.frameTimes
    .slice(active.frameIndex)
    .filter((time) => time >= active.startedAt && time <= endedAt);
  const frameIntervalsMs = [];
  for (let index = 1; index < frameTimes.length; index += 1) {
    frameIntervalsMs.push(frameTimes[index] - frameTimes[index - 1]);
  }
  const longTasks = state.longTasks
    .slice(active.longTaskIndex)
    .filter((entry) => entry.startTime <= endedAt
      && entry.startTime + entry.durationMs >= active.startedAt);
  const traces = state.traces.slice(active.traceIndex);
  state.interaction = null;
  return {
    durationMs: endedAt - active.startedAt,
    frameIntervalsMs,
    frameStats: summarize(frameIntervalsMs),
    longTaskCount: longTasks.length,
    longTaskObserverSupported: Boolean(state.longTaskObserver),
    longTaskTotalMs: longTasks.reduce(
      (total, entry) => total + entry.durationMs,
      0,
    ),
    longTasks,
    name: active.name,
    selectedIds: currentSelectionIds(),
    traceIds: unique(traces.flatMap((entry) => entry.ids)),
    traces,
  };
};

const finishPointerInteraction = async () => {
  const measurement = await endInteraction();
  measurement.selectedIds = currentSelectionIds();
  return measurement;
};

const measureUpdateBoundary = async (operation) => {
  const startedAt = performance.now();
  const operationResult = operation();
  const returnedAt = performance.now();
  state.patchmap.app.render();
  const renderedAt = performance.now();
  await nextFrames(1);
  const nextFrameAt = performance.now();
  return {
    ...operationResult,
    nextFrameAfterReturnMs: nextFrameAt - returnedAt,
    renderMs: renderedAt - returnedAt,
    syncMs: returnedAt - startedAt,
    totalMs: renderedAt - startedAt,
    visibleBoundary: 'explicit-app-render-after-return-then-next-raf',
  };
};

const interactionGeometry = () => {
  const candidates = state.items.slice(0, Math.min(6, state.items.length));
  const bounds = candidates.map(publicBounds);
  const first = bounds[0];
  const centers = bounds.map((bound) => canvasPoint({
    x: bound.x + bound.width / 2,
    y: bound.y + bound.height / 2,
  }));
  const minimumX = Math.min(...bounds.map((bound) => bound.x));
  const minimumY = Math.min(...bounds.map((bound) => bound.y));
  const maximumX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maximumY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  const canvas = canvasGeometry();
  return {
    box: {
      end: canvasPoint({ x: maximumX - 2, y: maximumY - 2 }),
      expectedIds: candidates.map((item) => item.id),
      start: canvasPoint({ x: minimumX - 6, y: minimumY - 6 }),
    },
    canvas,
    firstItem: {
      center: canvasPoint({
        x: first.x + first.width / 2,
        y: first.y + first.height / 2,
      }),
      id: candidates[0].id,
    },
    outside: {
      x: canvas.left + 4,
      y: canvas.top + 4,
    },
    paint: {
      expectedIds: candidates.map((item) => item.id),
      points: centers,
    },
  };
};

const resetView = () => {
  const grid = state.patchmap.selector('$..children[?(@.type==="grid")]')[0];
  state.patchmap.fit(grid.id, { padding: 80 });
  state.patchmap.app.render();
};

const publicBounds = (element) => {
  const bounds = element.getBounds();
  const x = numberOr(bounds.x, bounds.minX);
  const y = numberOr(bounds.y, bounds.minY);
  const width = numberOr(bounds.width, bounds.maxX - bounds.minX);
  const height = numberOr(bounds.height, bounds.maxY - bounds.minY);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Invalid public bounds for ${element.id}`);
  }
  return { height, width, x, y };
};

const canvasGeometry = () => {
  const canvas = state.patchmap?.app?.canvas;
  if (!canvas) throw new Error('Pixi canvas is unavailable');
  const rect = canvas.getBoundingClientRect();
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
};

const canvasPoint = (point) => {
  const rect = canvasGeometry();
  const screen = state.patchmap.app.screen;
  return {
    x: rect.left + (point.x / screen.width) * rect.width,
    y: rect.top + (point.y / screen.height) * rect.height,
  };
};

const snapshotTransform = (element) => ({
  angle: finiteOrNull(element.angle),
  bounds: publicBounds(element),
  id: element.id,
  position: {
    x: finiteOrNull(element.position?.x ?? element.x),
    y: finiteOrNull(element.position?.y ?? element.y),
  },
  propsAttrs: structuredClone(element.props?.attrs ?? {}),
  rotation: finiteOrNull(element.rotation),
  scale: {
    x: finiteOrNull(element.scale?.x),
    y: finiteOrNull(element.scale?.y),
  },
});

const transformSizeChanged = (before, after) =>
  differs(before.scale.x, after.scale.x)
  || differs(before.scale.y, after.scale.y)
  || differs(before.bounds.width, after.bounds.width)
  || differs(before.bounds.height, after.bounds.height)
  || JSON.stringify(before.propsAttrs) !== JSON.stringify(after.propsAttrs);

const transformAngleChanged = (before, after) =>
  differs(before.angle, after.angle)
  || differs(before.rotation, after.rotation)
  || differs(before.propsAttrs?.angle, after.propsAttrs?.angle)
  || differs(before.propsAttrs?.rotation, after.propsAttrs?.rotation);

const recordTrace = (name, args) => {
  state.traces.push({
    ids: collectIds(args),
    name,
    timestamp: performance.now(),
  });
};

const collectIds = (values) => {
  const ids = [];
  const seen = new WeakSet();
  const visit = (value, depth) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string') {
      if (state.itemIds.has(value)) ids.push(value);
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (typeof value.id === 'string' && state.itemIds.has(value.id)) {
      ids.push(value.id);
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const key of [
      'added',
      'current',
      'data',
      'detail',
      'element',
      'elements',
      'removed',
      'selected',
      'selection',
      'target',
      'targets',
    ]) {
      visit(value[key], depth + 1);
    }
  };
  visit(values, 0);
  return unique(ids);
};

const currentSelectionIds = () => unique(
  flatten(state.transformer?.elements ?? [])
    .map((element) => element?.id)
    .filter((id) => state.itemIds.has(id)),
);

const findComponent = (item, type) =>
  flatten(item?.children ?? []).find((child) => child?.type === type) ?? null;

const sizeContains = (size, expected) => {
  if (size == null) return false;
  if (typeof size === 'number') return size === expected;
  if (typeof size === 'string') return size.includes(String(expected));
  if (Array.isArray(size)) return size.some((value) => sizeContains(value, expected));
  if (typeof size === 'object') {
    return Object.values(size).some((value) => sizeContains(value, expected));
  }
  return false;
};

const check = (name, pass, details = undefined) => ({
  ...(details === undefined ? {} : { details }),
  name,
  pass: Boolean(pass),
});

const summarize = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return {
    max: sorted.at(-1),
    median: percentile(sorted, 0.5),
    min: sorted[0],
    p95: percentile(sorted, 0.95),
  };
};

const percentile = (sorted, ratio) =>
  sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];

const flatten = (value) => {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
};

const unique = (values) => [...new Set(values)];
const numberOr = (primary, fallback) =>
  Number.isFinite(Number(primary)) ? Number(primary) : Number(fallback);
const finiteOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const differs = (left, right) =>
  left !== null && right !== null && Math.abs(Number(left) - Number(right)) > 1e-5;

const nextFrames = async (count) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

const requireReady = () => {
  if (!state.patchmap?.isInit) throw new Error('Harness is not initialized');
};

globalThis.patchMapInteractionsPerf = Object.freeze({
  beginInteraction,
  endInteraction,
  finishPointerInteraction,
  finishTransformerGesture,
  measureS3,
  measureViewportPanZoom,
  prepareSelection,
  prepareTransformerGesture,
  setup,
  teardown,
});
globalThis.dispatchEvent(new Event('patchmap-interactions-perf-ready'));
