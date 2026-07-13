import { Container } from 'pixi.js';
import {
  captureDraw,
  createHost,
  findById,
  fixedInitOptions,
  normalizeEventArgs,
  preserveCanvasSnapshot,
  snapshotElement,
  snapshotManagedScene,
  waitForAsyncEvents,
  waitForRenderedFrame,
} from '../lib/public-observers.mjs';

const allKindsInput = () => [
  {
    type: 'group',
    id: 'drw-group',
    label: 'group defaults',
    attrs: { x: 24, y: 24 },
    children: [
      {
        type: 'rect',
        id: 'drw-group-rect',
        label: 'nested rect',
        size: { width: 72, height: 36 },
        fill: '#cbd5e1',
      },
    ],
  },
  {
    type: 'grid',
    id: 'drw-grid',
    label: 'grid defaults',
    attrs: { x: 128, y: 24 },
    cells: [['A']],
    item: {
      size: { width: 72, height: 96 },
      components: [
        {
          type: 'background',
          id: 'drw-background',
          source: {
            type: 'rect',
            fill: '#f8fafc',
            borderWidth: 2,
            borderColor: '#64748b',
            radius: 4,
          },
        },
        {
          type: 'bar',
          id: 'drw-bar',
          source: { type: 'rect', fill: '#ffffff' },
          size: { width: '70%', height: '24%' },
          tint: '#0c73bf',
          animation: false,
        },
        {
          type: 'icon',
          id: 'drw-icon',
          source: 'device',
          size: 18,
        },
        {
          type: 'text',
          id: 'drw-component-text',
          text: 'A',
          style: { fontSize: 12, fill: '#1a1a1a' },
        },
      ],
    },
  },
  {
    type: 'item',
    id: 'drw-item',
    label: 'item defaults',
    attrs: { x: 232, y: 24 },
    size: 64,
  },
  {
    type: 'relations',
    id: 'drw-relations',
    label: 'empty relations',
    links: [],
  },
  {
    type: 'image',
    id: 'drw-image',
    label: 'image defaults',
    attrs: { x: 320, y: 24 },
    source: 'device',
    size: 48,
  },
  {
    type: 'text',
    id: 'drw-text',
    label: 'text defaults',
    attrs: { x: 392, y: 24 },
    text: 'PATCH MAP',
    style: { fontSize: 16, fill: '#1a1a1a' },
  },
  {
    type: 'rect',
    id: 'drw-rect',
    label: 'rect defaults',
    attrs: { x: 24, y: 160 },
    size: { width: 112, height: 52 },
    fill: '#ef4444',
  },
];

const defaultBarInput = () => [
  {
    type: 'item',
    id: 'drw-default-bar-item',
    label: 'bar default probe',
    size: { width: 72, height: 96 },
    attrs: { x: 24, y: 24 },
    components: [
      {
        type: 'bar',
        id: 'drw-default-bar',
        source: { type: 'rect', fill: '#ffffff' },
        size: { width: '70%', height: '24%' },
        tint: '#0c73bf',
      },
    ],
  },
];

const gridInput = (inactiveCellStrategy) => [
  {
    type: 'grid',
    id: `drw-grid-${inactiveCellStrategy}`,
    label: `grid ${inactiveCellStrategy}`,
    cells: [
      ['A', 0, 1],
      [0, 'B', 0],
    ],
    gap: { x: 3, y: 5 },
    inactiveCellStrategy,
    item: {
      size: { width: 20, height: 30 },
      components: [
        {
          type: 'background',
          source: {
            type: 'rect',
            fill: '#dbeafe',
            borderWidth: 1,
            borderColor: '#2563eb',
          },
        },
        {
          type: 'text',
          text: 'cell',
          style: { fontSize: 7, fill: '#1e3a8a' },
        },
      ],
    },
    attrs: { x: 10, y: 20 },
  },
];

const simpleRectInput = (id, x = 24) => [
  {
    type: 'rect',
    id,
    label: id,
    size: { width: 48, height: 32 },
    fill: '#0c73bf',
    attrs: { x, y: 24 },
  },
];

const createInitializedPatchmap = async (Patchmap) => {
  const host = createHost();
  const patchmap = new Patchmap();
  await patchmap.init(host, fixedInitOptions());
  return { host, patchmap };
};

const createEventTrace = (patchmap, events) => {
  const trace = [];
  for (const event of events) {
    patchmap.on(event, (...args) => {
      trace.push({ event, args: normalizeEventArgs(args, patchmap) });
    });
  }
  return trace;
};

const drw001 = {
  id: 'DRW-001',
  level: 1,
  title: 'Seven element kinds and four component kinds materialize defaults',
  invocation: [
    'await init(host, fixedOptions)',
    'draw(default bar probe with animation omitted) and read returned/scene defaults',
    'draw(independent seven-element/four-component visual input with bar animation=false)',
    'await document.fonts and next native rendered frame',
    'read public returned data and managed scene handles from each subcase',
  ],
  timingBoundaries: [
    'default probe draw return',
    'stable visual draw return',
    'stable visual settled next native rendered frame',
  ],
  volatileFields: [
    {
      field: 'generated component ids',
      replacement: '<generated-id:n>',
      reason: 'Public contract permits generated IDs; random values are not semantic.',
    },
  ],
  screenshot: true,
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    const defaultInput = defaultBarInput();
    eventTrace.push({ boundary: 'before-default-probe-draw' });
    const defaultDraw = captureDraw(patchmap, defaultInput);
    eventTrace.push({ boundary: 'after-default-probe-draw-return' });
    const defaultScene = snapshotManagedScene(patchmap.world);
    const defaultBar = snapshotElement(findById(patchmap, 'drw-default-bar'));

    const visualInput = allKindsInput();
    eventTrace.push({ boundary: 'before-stable-visual-draw' });
    const visualDraw = captureDraw(patchmap, visualInput);
    eventTrace.push({ boundary: 'after-stable-visual-draw-return' });
    await waitForRenderedFrame(patchmap);
    const visualScene = snapshotManagedScene(patchmap.world);
    preserveCanvasSnapshot(
      patchmap.app.canvas,
      'oracle-settled-snapshot',
    );
    return {
      observed: {
        defaultMaterialization: {
          draw: defaultDraw,
          bar: defaultBar,
          scene: defaultScene,
        },
        stableVisual: {
          draw: visualDraw,
          scene: visualScene,
        },
        eventTrace,
      },
      cleanup: () => patchmap.destroy(),
    };
  },
};

const drw002 = {
  id: 'DRW-002',
  level: 1,
  title: 'Grid cell identity, label, geometry, destroy and hide strategies',
  invocation: [
    'await init(host, fixedOptions)',
    "draw(grid input with inactiveCellStrategy='destroy')",
    'read managed scene and geometry',
    "draw(grid input with inactiveCellStrategy='hide')",
    'await next native rendered frame and read managed scene and geometry',
  ],
  timingBoundaries: ['each draw return', 'settled next native rendered frame'],
  volatileFields: [
    {
      field: 'generated component ids',
      replacement: '<generated-id:n>',
      reason: 'Grid clones receive generated component IDs; random values are not semantic.',
    },
  ],
  screenshot: true,
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    eventTrace.push({ boundary: 'before-destroy-strategy-draw' });
    const destroyDraw = captureDraw(patchmap, gridInput('destroy'));
    eventTrace.push({ boundary: 'after-destroy-strategy-draw-return' });
    const destroyScene = snapshotManagedScene(patchmap.world);
    eventTrace.push({ boundary: 'before-hide-strategy-draw' });
    const hideDraw = captureDraw(patchmap, gridInput('hide'));
    eventTrace.push({ boundary: 'after-hide-strategy-draw-return' });
    await waitForRenderedFrame(patchmap);
    const hideScene = snapshotManagedScene(patchmap.world);
    preserveCanvasSnapshot(
      patchmap.app.canvas,
      'oracle-settled-snapshot',
    );
    return {
      observed: { destroyDraw, destroyScene, hideDraw, hideScene, eventTrace },
      cleanup: () => patchmap.destroy(),
    };
  },
};

const drw003 = {
  id: 'DRW-003',
  level: 1,
  title: 'Draw preserves caller input and returns materialized data',
  invocation: [
    'await init(host, fixedOptions)',
    'deep-copy input before draw',
    'draw(independent input)',
    'deep-copy input after draw and compare',
    'record returned materialized data',
  ],
  timingBoundaries: ['synchronous draw return'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    const input = [
      {
        type: 'group',
        id: 'drw-immutability-group',
        children: simpleRectInput('drw-immutability-rect'),
      },
    ];
    const draw = captureDraw(patchmap, input);
    await waitForAsyncEvents(patchmap);
    const scene = snapshotManagedScene(patchmap.world);
    patchmap.destroy();
    return { draw, eventTrace, scene };
  },
};

const drw004 = {
  id: 'DRW-004',
  level: 1,
  title: 'Invalid draw preserves latest successful state and pending draw event',
  invocation: [
    'await init(host, fixedOptions)',
    "on('patchmap:draw', callback)",
    'draw(valid input)',
    'draw(invalid unknown-kind input) before the pending event fires',
    'normalize thrown error as {name,message}',
    'await pending async events and inspect latest successful scene',
  ],
  timingBoundaries: ['synchronous error', 'pending async draw event'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    const successfulDraw = captureDraw(
      patchmap,
      simpleRectInput('drw-latest-success'),
    );
    const invalidDraw = captureDraw(patchmap, [
      { type: 'not-a-public-kind', id: 'drw-invalid' },
    ]);
    await waitForAsyncEvents(patchmap);
    const sceneAfterInvalid = snapshotManagedScene(patchmap.world);
    patchmap.destroy();
    return { successfulDraw, invalidDraw, eventTrace, sceneAfterInvalid };
  },
};

const drw005 = {
  id: 'DRW-005',
  level: 1,
  title: 'Consecutive draws emit only the newest pending draw event',
  invocation: [
    'await init(host, fixedOptions)',
    "on('patchmap:draw', callback)",
    'draw(first successful input)',
    'draw(second successful input) before the first pending event fires',
    'await async event boundary',
  ],
  timingBoundaries: ['two synchronous draw returns', 'pending async event'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    const firstDraw = captureDraw(
      patchmap,
      simpleRectInput('drw-first-success', 24),
    );
    const secondDraw = captureDraw(
      patchmap,
      simpleRectInput('drw-second-success', 96),
    );
    await waitForAsyncEvents(patchmap);
    const scene = snapshotManagedScene(patchmap.world);
    patchmap.destroy();
    return { firstDraw, secondDraw, eventTrace, scene };
  },
};

const drw006 = {
  id: 'DRW-006',
  level: 1,
  title: 'Redraw removes prior managed and unmanaged world children',
  invocation: [
    'await init(host, fixedOptions)',
    'draw(first managed input)',
    'world.addChild(new public Pixi Container with fixture label)',
    'draw(second managed input)',
    'observe old managed/unmanaged parent and destroyed state',
  ],
  timingBoundaries: ['synchronous second draw return'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = createEventTrace(patchmap, ['patchmap:draw']);
    const firstDraw = captureDraw(
      patchmap,
      simpleRectInput('drw-managed-before'),
    );
    const priorManaged = findById(patchmap, 'drw-managed-before');
    const unmanaged = new Container({ label: 'oracle-unmanaged-world-child' });
    patchmap.world.addChild(unmanaged);
    const beforeRedraw = {
      managed: snapshotElement(priorManaged),
      unmanaged: {
        label: unmanaged.label,
        parentIsWorld: unmanaged.parent === patchmap.world,
        destroyed: unmanaged.destroyed,
      },
      worldChildCount: patchmap.world.children.length,
    };
    const secondDraw = captureDraw(patchmap, [
      {
        type: 'text',
        id: 'drw-managed-after',
        text: 'replacement',
        attrs: { x: 24, y: 24 },
      },
    ]);
    await waitForAsyncEvents(patchmap);
    const afterRedraw = {
      priorManaged: {
        id: priorManaged.id ?? null,
        parentIsNull: priorManaged.parent === null,
        destroyed: priorManaged.destroyed,
      },
      unmanaged: {
        label: unmanaged.label,
        parentIsNull: unmanaged.parent === null,
        destroyed: unmanaged.destroyed,
      },
      worldChildCount: patchmap.world.children.length,
      scene: snapshotManagedScene(patchmap.world),
    };
    patchmap.destroy();
    return { firstDraw, beforeRedraw, secondDraw, eventTrace, afterRedraw };
  },
};

export const drawFixtures = [
  drw001,
  drw002,
  drw003,
  drw004,
  drw005,
  drw006,
];
