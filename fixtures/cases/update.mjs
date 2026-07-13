import {
  canvasPixelDigest,
  captureDraw,
  captureUpdate,
  createHost,
  findById,
  fixedInitOptions,
  flattenSelectorResult,
  normalizeEventArgs,
  normalizeGeneratedIds,
  preserveCanvasSnapshot,
  roundNumber,
  snapshotElement,
  snapshotManagedScene,
  waitForAsyncEvents,
  waitForRenderedFrame,
} from '../lib/public-observers.mjs';

const createInitializedPatchmap = async (Patchmap) => {
  const host = createHost();
  const patchmap = new Patchmap();
  await patchmap.init(host, fixedInitOptions());
  return { host, patchmap };
};

const attachUpdateTrace = (patchmap) => {
  const trace = [];
  patchmap.on('patchmap:updated', (...args) => {
    trace.push({
      event: 'patchmap:updated',
      args: normalizeEventArgs(args, patchmap),
    });
  });
  return trace;
};

const rect = (id, x, fill = '#94a3b8') => ({
  type: 'rect',
  id,
  label: id,
  size: { width: 48, height: 32 },
  fill,
  attrs: { x, y: 36 },
});

const upd001 = {
  id: 'UPD-001',
  level: 1,
  title: 'Direct reference and JSONPath updates target equivalent elements',
  invocation: [
    'await init(host, fixedOptions)',
    'draw(two equivalent rect elements)',
    'selector(path) to obtain a direct live element reference',
    'update({elements: directReference, changes})',
    'update({path: JSONPath, changes})',
    'compare returned references and public state/geometry',
  ],
  timingBoundaries: ['each synchronous update return and event callback order'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [
      rect('upd-direct', 24),
      rect('upd-path', 120),
    ]);
    const eventTrace = attachUpdateTrace(patchmap);
    const changes = { attrs: { x: 72, y: 64 }, fill: '#ef4444' };
    const directTarget = findById(patchmap, 'upd-direct');
    eventTrace.push({ boundary: 'before-direct-update' });
    const directUpdate = captureUpdate(patchmap, {
      elements: directTarget,
      changes,
    });
    eventTrace.push({ boundary: 'after-direct-update' });
    eventTrace.push({ boundary: 'before-path-update' });
    const pathUpdate = captureUpdate(patchmap, {
      path: '$..children[?(@.id==="upd-path")]',
      changes,
    });
    eventTrace.push({ boundary: 'after-path-update' });
    const directSnapshot = snapshotElement(findById(patchmap, 'upd-direct'));
    const pathSnapshot = snapshotElement(findById(patchmap, 'upd-path'));
    const comparableProps = ({ id, label, ...props }) => props;
    const equivalent = {
      props:
        JSON.stringify(comparableProps(directSnapshot.props)) ===
        JSON.stringify(comparableProps(pathSnapshot.props)),
      transform:
        JSON.stringify(directSnapshot.transform) ===
        JSON.stringify(pathSnapshot.transform),
      dimensions:
        JSON.stringify(directSnapshot.dimensions) ===
        JSON.stringify(pathSnapshot.dimensions),
    };
    patchmap.destroy();
    return {
      draw,
      directUpdate,
      pathUpdate,
      eventTrace,
      directSnapshot,
      pathSnapshot,
      equivalent,
    };
  },
};

const tableTextInput = () => [
  {
    type: 'text',
    id: 'upd-table-text',
    text: 'before',
    style: { fontSize: 12, fill: '#111827', letterSpacing: 2 },
    attrs: { x: 24, y: 24 },
  },
];

const tableItemInput = () => [
  {
    type: 'item',
    id: 'upd-table-item',
    size: { width: 96, height: 72 },
    attrs: { x: 24, y: 24 },
    components: [
      {
        type: 'text',
        id: 'upd-component-text',
        label: 'primary-copy',
        text: 'before',
        style: { fontSize: 12, fill: '#111827', letterSpacing: 1 },
      },
      {
        type: 'icon',
        id: 'upd-component-icon',
        label: 'secondary-icon',
        source: 'device',
        size: 16,
      },
      {
        type: 'text',
        id: 'upd-component-text-second',
        label: 'secondary-copy',
        text: 'before-second',
        style: { fontSize: 10, fill: '#334155', letterSpacing: 0 },
      },
    ],
  },
];

const componentRow = (name, matchingCase, mergeStrategy, components) => ({
  name,
  matchingCase,
  input: tableItemInput,
  targetId: 'upd-table-item',
  options: {
    changes: { components },
    mergeStrategy,
  },
});

const upd002 = {
  id: 'UPD-002',
  level: 1,
  title: 'Merge and replace nested object/array semantics are table-driven',
  invocation: [
    'For each table row, draw a fresh independently authored input',
    'select the explicit target ID',
    'update component arrays by explicit id, label-only, type-only, or same-type ambiguous order under merge and replace',
    'record public return, target props, managed descendant scene, and ordered row event trace',
  ],
  timingBoundaries: ['synchronous update return per table row'],
  volatileFields: [
    {
      field: 'generated component ids',
      replacement: '<generated-id:n>',
      reason:
        'Exact generated ID strings are non-normative. Whether item props expose a generated ID while a matched live scene handle retains its explicit ID is Level 1 normative public behavior.',
    },
  ],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = attachUpdateTrace(patchmap);
    const rows = [
      {
        name: 'nested-object-merge',
        input: tableTextInput,
        targetId: 'upd-table-text',
        options: { changes: { style: { fill: '#ef4444' } }, mergeStrategy: 'merge' },
      },
      {
        name: 'nested-object-replace',
        input: tableTextInput,
        targetId: 'upd-table-text',
        options: {
          changes: { style: { fill: '#ef4444' } },
          mergeStrategy: 'replace',
        },
      },
      componentRow('component-explicit-id-merge', 'explicit-id', 'merge', [
        {
          type: 'text',
          id: 'upd-component-text-second',
          text: 'after-explicit-id-second',
          style: { fill: '#ef4444' },
        },
      ]),
      componentRow('component-explicit-id-replace', 'explicit-id', 'replace', [
        {
          type: 'text',
          id: 'upd-component-text-second',
          text: 'after-explicit-id-second',
          style: { fill: '#ef4444' },
        },
        {
          type: 'text',
          id: 'upd-component-text',
          label: 'primary-copy',
          text: 'before',
          style: { fontSize: 12, fill: '#111827', letterSpacing: 1 },
        },
      ]),
      componentRow('component-label-only-merge', 'label-only', 'merge', [
        {
          type: 'text',
          label: 'secondary-copy',
          text: 'after-label-only-second',
          style: { fill: '#f97316' },
        },
      ]),
      componentRow('component-label-only-replace', 'label-only', 'replace', [
        {
          type: 'text',
          label: 'secondary-copy',
          text: 'after-label-only-second',
          style: { fill: '#f97316' },
        },
        {
          type: 'text',
          label: 'primary-copy',
          text: 'before',
          style: { fontSize: 12, fill: '#111827', letterSpacing: 1 },
        },
      ]),
      componentRow('component-type-only-merge', 'type-only', 'merge', [
        {
          type: 'icon',
          source: 'device',
          size: 28,
          tint: '#22c55e',
        },
      ]),
      componentRow('component-type-only-replace', 'type-only', 'replace', [
        {
          type: 'icon',
          source: 'device',
          size: 28,
          tint: '#22c55e',
        },
      ]),
      componentRow(
        'component-same-type-ambiguous-order-merge',
        'same-type-ambiguous-order',
        'merge',
        [
          { type: 'text', text: 'after-order-first' },
          { type: 'text', text: 'after-order-second' },
        ],
      ),
      componentRow(
        'component-same-type-ambiguous-order-replace',
        'same-type-ambiguous-order',
        'replace',
        [
          { type: 'text', text: 'after-order-first' },
          { type: 'text', text: 'after-order-second' },
        ],
      ),
    ];

    const table = [];
    for (const row of rows) {
      const draw = captureDraw(patchmap, row.input());
      const target = findById(patchmap, row.targetId);
      const beforeTarget = normalizeGeneratedIds(snapshotElement(target));
      const beforeScene = snapshotManagedScene(patchmap.world);
      const traceStart = eventTrace.length;
      eventTrace.push({ boundary: `before:${row.name}` });
      const update = captureUpdate(patchmap, {
        elements: target,
        ...row.options,
      });
      eventTrace.push({ boundary: `after:${row.name}` });
      table.push({
        name: row.name,
        matchingCase: row.matchingCase ?? 'nested-object',
        mergeStrategy: row.options.mergeStrategy,
        draw,
        beforeTarget,
        beforeScene,
        update,
        target: normalizeGeneratedIds(
          snapshotElement(findById(patchmap, row.targetId)),
        ),
        scene: snapshotManagedScene(patchmap.world),
        eventTrace: eventTrace.slice(traceStart),
      });
    }
    patchmap.destroy();
    return { table, eventTrace };
  },
};

const upd003 = {
  id: 'UPD-003',
  level: 1,
  title: 'Refresh re-applies observable behavior for an equal value',
  invocation: [
    'draw(show=true rect)',
    'set public live handle renderable=false while props.show remains true',
    'update same show=true with refresh=false',
    'set renderable=false again',
    'update same show=true with refresh=true',
    'record live visibility and ordered update events',
  ],
  timingBoundaries: ['synchronous update returns and callbacks'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [rect('upd-refresh', 24)]);
    const target = findById(patchmap, 'upd-refresh');
    const eventTrace = attachUpdateTrace(patchmap);

    eventTrace.push({ boundary: 'before-no-refresh' });
    target.renderable = false;
    const beforeNoRefresh = snapshotElement(target);
    const noRefresh = captureUpdate(patchmap, {
      elements: target,
      changes: { show: true },
      refresh: false,
    });
    const afterNoRefresh = snapshotElement(target);
    eventTrace.push({ boundary: 'after-no-refresh' });

    eventTrace.push({ boundary: 'before-refresh' });
    target.renderable = false;
    const beforeRefresh = snapshotElement(target);
    const refresh = captureUpdate(patchmap, {
      elements: target,
      changes: { show: true },
      refresh: true,
    });
    const afterRefresh = snapshotElement(target);
    eventTrace.push({ boundary: 'after-refresh' });
    patchmap.destroy();
    return {
      draw,
      noRefresh,
      refresh,
      beforeNoRefresh,
      afterNoRefresh,
      beforeRefresh,
      afterRefresh,
      eventTrace,
    };
  },
};

const center = (snapshot) => ({
  x: snapshot.bounds?.centerX ?? null,
  y: snapshot.bounds?.centerY ?? null,
});

const upd004 = {
  id: 'UPD-004',
  level: 1,
  title: 'Relative transforms and center-origin rotation preserve public geometry',
  invocation: [
    'draw(angle, rotation, and center-origin target rects)',
    'update angle target with relative x/y/angle',
    'update rotation target with relative rotation radians',
    "update center target angle with rotateOrigin='center'",
    'record props, transforms, bounds, and center delta',
  ],
  timingBoundaries: ['synchronous update return and geometry read'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = attachUpdateTrace(patchmap);
    const draw = captureDraw(patchmap, [
      {
        ...rect('upd-relative-angle', 64),
        attrs: { x: 64, y: 80, angle: 10 },
      },
      {
        ...rect('upd-relative-rotation', 144),
        attrs: { x: 144, y: 80, rotation: 0.1 },
      },
      {
        ...rect('upd-center-origin', 240),
        size: { width: 80, height: 30 },
        attrs: { x: 240, y: 96, angle: 0 },
      },
    ]);
    const angleTarget = findById(patchmap, 'upd-relative-angle');
    const rotationTarget = findById(patchmap, 'upd-relative-rotation');
    const centerTarget = findById(patchmap, 'upd-center-origin');
    const before = {
      angle: snapshotElement(angleTarget),
      rotation: snapshotElement(rotationTarget),
      center: snapshotElement(centerTarget),
    };
    eventTrace.push({ boundary: 'before-relative-angle' });
    const angleUpdate = captureUpdate(patchmap, {
      elements: angleTarget,
      changes: { attrs: { x: 5, y: -3, angle: 20 } },
      relativeTransform: true,
    });
    eventTrace.push({ boundary: 'after-relative-angle' });
    eventTrace.push({ boundary: 'before-relative-rotation' });
    const rotationUpdate = captureUpdate(patchmap, {
      elements: rotationTarget,
      changes: { attrs: { rotation: 0.2 } },
      relativeTransform: true,
    });
    eventTrace.push({ boundary: 'after-relative-rotation' });
    eventTrace.push({ boundary: 'before-center-origin-rotation' });
    const centerUpdate = captureUpdate(patchmap, {
      elements: centerTarget,
      changes: { attrs: { angle: 90 } },
      rotateOrigin: 'center',
    });
    eventTrace.push({ boundary: 'after-center-origin-rotation' });
    const after = {
      angle: snapshotElement(angleTarget),
      rotation: snapshotElement(rotationTarget),
      center: snapshotElement(centerTarget),
    };
    const beforeCenter = center(before.center);
    const afterCenter = center(after.center);
    const centerDelta = {
      x: roundNumber(afterCenter.x - beforeCenter.x),
      y: roundNumber(afterCenter.y - beforeCenter.y),
    };
    patchmap.destroy();
    return {
      draw,
      before,
      angleUpdate,
      rotationUpdate,
      centerUpdate,
      after,
      centerDelta,
      eventTrace,
    };
  },
};

const bulkInput = () => [
  {
    type: 'grid',
    id: 'upd-bulk-grid',
    cells: [
      ['A', 'B'],
      ['C', 'D'],
    ],
    gap: 4,
    item: {
      size: { width: 72, height: 72 },
      components: [
        {
          type: 'background',
          source: { type: 'rect', fill: '#f8fafc' },
        },
        {
          type: 'bar',
          source: { type: 'rect', fill: '#ffffff' },
          size: { width: '70%', height: '35%' },
          tint: '#0c73bf',
          animation: false,
        },
      ],
    },
    attrs: { x: 24, y: 24 },
  },
];

const upd005 = {
  id: 'UPD-005',
  level: 2,
  title: 'Trusted silent bulk update mutates at return and renders next native frame',
  invocation: [
    'draw(four-item grid) and await settled native frame',
    'capture initial rendered pixel digest and preserved canvas snapshot',
    'selector(all item descendants)',
    'update({elements, changes, validateSchema:false, emit:false})',
    'read public item/component state immediately after return',
    'await the next automatic ticker render',
    'capture final pixel digest and public scene',
  ],
  timingBoundaries: [
    'immediately after synchronous update return',
    'next native rendered frame after app render callback',
  ],
  volatileFields: [
    {
      field: 'generated component ids',
      replacement: '<generated-id:n>',
      reason: 'Generated IDs are not semantic to bulk update behavior.',
    },
  ],
  evidencePolicy: {
    publicBehaviorStateEventTiming: {
      normative: true,
      includes: [
        'synchronous update return',
        'return-time public scene/state',
        'ordered event trace',
        'next rendered frame public scene/state and timing boundary',
      ],
    },
    pixel: {
      normative: false,
      status: 'provisional-non-windows',
      reason:
        'The current macOS headless Chromium SwiftShader pixel set is environment-specific: the initial/pre-update preserved capture contains large black areas, while the after/next-frame capture has a white background. Neither phase is replacement behavior.',
      requiredConfirmation:
        'Reconfirm on an approved native Windows headed run before treating pixels as normative.',
    },
  },
  screenshot: true,
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, bulkInput());
    await waitForRenderedFrame(patchmap);
    patchmap.app.render();
    const initialPixelDigest = await canvasPixelDigest(patchmap.app.canvas);
    preserveCanvasSnapshot(patchmap.app.canvas);
    const items = flattenSelectorResult(
      patchmap.selector('$..children[?(@.type==="item")]'),
    ).filter((element) => element?.type === 'item');
    const eventTrace = attachUpdateTrace(patchmap);
    eventTrace.push({ boundary: 'before-silent-update' });
    const update = captureUpdate(patchmap, {
      elements: items,
      changes: {
        components: [
          {
            type: 'bar',
            size: { width: '70%', height: '60%' },
            tint: '#ef4444',
            animation: false,
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    const returnTime = {
      targetedIds: items.map((item) => item.id),
      scene: snapshotManagedScene(patchmap.world),
      eventTrace: [...eventTrace],
    };
    eventTrace.push({ boundary: 'after-silent-update-return' });
    await waitForRenderedFrame(patchmap);
    const nextFramePixelDigest = await canvasPixelDigest(patchmap.app.canvas);
    preserveCanvasSnapshot(patchmap.app.canvas, 'oracle-after-snapshot');
    const nextFrame = {
      scene: snapshotManagedScene(patchmap.world),
      pixelDigest: nextFramePixelDigest,
      differsFromInitialPixels: nextFramePixelDigest !== initialPixelDigest,
      eventTrace: [...eventTrace],
    };
    return {
      observed: {
        draw,
        update,
        initialPixelDigest,
        returnTime,
        nextFrame,
        eventTrace: [...eventTrace],
      },
      cleanup: () => patchmap.destroy(),
    };
  },
};

const upd006 = {
  id: 'UPD-006',
  level: 1,
  title: 'Missing update target returns empty result and records event behavior',
  invocation: [
    'draw(one explicit rect)',
    "on('patchmap:updated', callback)",
    'update({path: missing JSONPath, changes})',
    'record return and ordered event trace',
  ],
  timingBoundaries: ['synchronous update return and async event drain'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [rect('upd-existing', 24)]);
    const eventTrace = attachUpdateTrace(patchmap);
    eventTrace.push({ boundary: 'before-missing-update' });
    const update = captureUpdate(patchmap, {
      path: '$..children[?(@.id==="upd-missing")]',
      changes: { show: false },
    });
    eventTrace.push({ boundary: 'after-missing-update' });
    await waitForAsyncEvents(patchmap);
    const scene = snapshotManagedScene(patchmap.world);
    patchmap.destroy();
    return { draw, update, eventTrace, scene };
  },
};

export const updateFixtures = [upd001, upd002, upd003, upd004, upd005, upd006];
