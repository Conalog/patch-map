import {
  captureDraw,
  capturePublicCall,
  captureUpdate,
  createHost,
  findById,
  fixedInitOptions,
  normalizeError,
  normalizeEventArgs,
  normalizeGeneratedIds,
  normalizePublicValue,
  normalizeReturn,
  preserveCanvasSnapshot,
  roundNumber,
  snapshotElement,
  snapshotManagedScene,
  waitForAsyncEvents,
  waitForRenderedFrame,
} from '../lib/public-observers.mjs';

const createInitializedPatchmap = async (Patchmap, options = fixedInitOptions()) => {
  const host = createHost();
  const patchmap = new Patchmap();
  await patchmap.init(host, options);
  return { host, patchmap };
};

const observeCall = (patchmap, input, invoke) =>
  capturePublicCall(input, invoke, { patchmap });

const snapshotViewport = (patchmap) => ({
  center: {
    x: roundNumber(patchmap.viewport?.center?.x),
    y: roundNumber(patchmap.viewport?.center?.y),
  },
  scale: {
    x: roundNumber(patchmap.viewport?.scale?.x),
    y: roundNumber(patchmap.viewport?.scale?.y),
  },
  worldTransform: patchmap.world
    ? {
        x: roundNumber(patchmap.world.x),
        y: roundNumber(patchmap.world.y),
        angle: roundNumber(patchmap.world.angle),
        scaleX: roundNumber(patchmap.world.scale?.x),
        scaleY: roundNumber(patchmap.world.scale?.y),
      }
    : null,
});

const snapshotPublicChildren = (element) =>
  (element?.children ?? []).map((child, index) => {
    let bounds = null;
    try {
      const value = child?.getBounds?.();
      if (value) {
        bounds = {
          x: roundNumber(value.x),
          y: roundNumber(value.y),
          width: roundNumber(value.width),
          height: roundNumber(value.height),
        };
      }
    } catch {
      bounds = null;
    }
    return {
      index,
      id: child?.id ?? null,
      label: child?.label ?? null,
      type: child?.type ?? null,
      visible: child?.visible ?? null,
      renderable: child?.renderable ?? null,
      destroyed: child?.destroyed ?? null,
      x: roundNumber(child?.x),
      y: roundNumber(child?.y),
      width: roundNumber(child?.width),
      height: roundNumber(child?.height),
      bounds,
    };
  });

const legacyCandidates = [
  { name: 'empty-array', value: [] },
  { name: 'empty-object', value: {} },
  {
    name: 'current-map-array',
    value: [
      {
        type: 'rect',
        id: 'legacy-current-rect',
        size: { width: 20, height: 12 },
        fill: '#0c73bf',
      },
    ],
  },
  {
    name: 'children-object',
    value: {
      id: 'legacy-root',
      children: [
        {
          type: 'rect',
          id: 'legacy-child-rect',
          size: { width: 20, height: 12 },
          fill: '#0c73bf',
        },
      ],
    },
  },
  {
    name: 'elements-object',
    value: {
      elements: [
        {
          type: 'rect',
          id: 'legacy-elements-rect',
          size: { width: 20, height: 12 },
          fill: '#0c73bf',
        },
      ],
    },
  },
  { name: 'grouped-empty', value: { primary: [] } },
  {
    name: 'grouped-minimal-properties',
    value: {
      primary: [
        {
          id: 'legacy-minimal',
          type: 'rect',
          properties: {},
        },
      ],
    },
  },
  {
    name: 'grouped-rect-properties',
    value: {
      primary: [
        {
          id: 'legacy-grouped-rect',
          type: 'rect',
          properties: {
            transform: { x: 12, y: 18, angle: 15 },
            size: { width: 30, height: 16 },
            fill: '#0c73bf',
          },
        },
      ],
    },
  },
  {
    name: 'legacy-draw-object',
    value: {
      grids: [],
      devices: [
        {
          id: 'legacy-device',
          type: 'item',
          properties: {
            transform: { x: 32, y: 48, angle: 0 },
            size: { width: 42, height: 42 },
            status: 'ready',
          },
        },
      ],
    },
  },
  { name: 'null', value: null },
  { name: 'malformed-number', value: 42 },
];

const api101 = {
  id: 'API-101',
  level: 1,
  title: 'Legacy conversion and draw inputs expose exact public outcomes',
  questions: ['Q13'],
  invocation: [
    'call convertLegacyData with independently authored empty/current/object/malformed inputs',
    'record normalized return or exact public error and caller-input mutation',
    'pass the same authored values to draw after init',
  ],
  timingBoundaries: ['synchronous standalone return/error', 'synchronous draw return/error'],
  volatileFields: [
    {
      field: 'generated ids',
      replacement: '<generated-id:n>',
      reason: 'Exact generated strings are non-normative; output structure is preserved.',
    },
  ],
  async run({ Patchmap, convertLegacyData }) {
    const standalone = legacyCandidates.map(({ name, value }) => ({
      name,
      call: capturePublicCall(
        { value },
        () => convertLegacyData(value),
      ),
    }));
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = legacyCandidates.map(({ name, value }) => ({
      name,
      call: captureDraw(patchmap, value),
      scene: snapshotManagedScene(patchmap.world),
    }));
    patchmap.destroy();
    return { standalone, draw, eventTrace: [] };
  },
};

const relationEndpoints = () => [
  {
    type: 'rect',
    id: 'rel-a',
    size: { width: 40, height: 24 },
    fill: '#dbeafe',
    attrs: { x: 40, y: 60 },
  },
  {
    type: 'rect',
    id: 'rel-b',
    size: { width: 40, height: 24 },
    fill: '#fee2e2',
    attrs: { x: 180, y: 140 },
  },
];

const relationCandidates = [
  { name: 'from-to', link: { from: 'rel-a', to: 'rel-b' } },
  { name: 'source-target', link: { source: 'rel-a', target: 'rel-b' } },
  { name: 'sourceId-targetId', link: { sourceId: 'rel-a', targetId: 'rel-b' } },
  { name: 'start-end', link: { start: 'rel-a', end: 'rel-b' } },
  { name: 'tuple', link: ['rel-a', 'rel-b'] },
];

const rel101 = {
  id: 'REL-101',
  level: 1,
  title: 'Relations endpoint schemas and public path behavior are table-driven',
  questions: ['Q14'],
  invocation: [
    'draw two explicit endpoint rects plus one independently authored relations link candidate',
    'record exact success/error, materialized props, public live bounds and public child geometry',
    'for accepted candidates exercise duplicate merge, refresh, reverse direction, missing endpoint, focus and fit',
  ],
  timingBoundaries: ['each synchronous draw/update/focus/fit return', 'settled next frame'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = [];
    for (const event of ['patchmap:draw', 'patchmap:updated']) {
      patchmap.on(event, (...args) => {
        eventTrace.push({ event, args: normalizeEventArgs(args, patchmap) });
      });
    }
    const table = [];
    for (const candidate of relationCandidates) {
      const input = [
        ...relationEndpoints(),
        {
          type: 'relations',
          id: `relations-${candidate.name}`,
          links: [candidate.link],
        },
      ];
      const draw = captureDraw(patchmap, input);
      const relation = findById(patchmap, `relations-${candidate.name}`);
      const row = {
        name: candidate.name,
        draw,
        relation: relation ? snapshotElement(relation) : null,
        publicChildren: snapshotPublicChildren(relation),
      };
      if (relation) {
        row.duplicateMerge = captureUpdate(patchmap, {
          elements: relation,
          changes: { links: [candidate.link, candidate.link] },
          mergeStrategy: 'merge',
        });
        row.afterDuplicate = snapshotElement(relation);
        row.afterDuplicateChildren = snapshotPublicChildren(relation);
        row.refresh = captureUpdate(patchmap, {
          elements: relation,
          refresh: true,
        });
        row.focus = observeCall(
          patchmap,
          { ids: relation.id },
          () => patchmap.focus(relation.id),
        );
        row.afterFocus = snapshotViewport(patchmap);
        row.fit = observeCall(
          patchmap,
          { ids: relation.id },
          () => patchmap.fit(relation.id),
        );
        row.afterFit = snapshotViewport(patchmap);
      }
      table.push(row);
    }

    const edgeCases = [];
    for (const [name, links] of [
      ['reverse', [{ source: 'rel-b', target: 'rel-a' }]],
      ['missing-endpoint', [{ source: 'rel-a', target: 'rel-missing' }]],
      ['empty-links', []],
    ]) {
      const id = `relations-edge-${name}`;
      const draw = captureDraw(patchmap, [
        ...relationEndpoints(),
        { type: 'relations', id, links },
      ]);
      const relation = findById(patchmap, id);
      edgeCases.push({
        name,
        draw,
        relation: relation ? snapshotElement(relation) : null,
        publicChildren: snapshotPublicChildren(relation),
      });
    }
    const settledDraw = captureDraw(patchmap, [
      ...relationEndpoints(),
      {
        type: 'relations',
        id: 'relations-settled',
        links: [{ source: 'rel-a', target: 'rel-b' }],
      },
    ]);
    await waitForRenderedFrame(patchmap);
    const settledRelation = findById(patchmap, 'relations-settled');
    const settledAccepted = {
      draw: settledDraw,
      relation: snapshotElement(settledRelation),
      publicChildren: snapshotPublicChildren(settledRelation),
      scene: snapshotManagedScene(patchmap.world),
    };
    patchmap.destroy();
    return { table, edgeCases, settledAccepted, eventTrace };
  },
};

const textInput = () => [
  {
    type: 'text',
    id: 'txt-element-default',
    attrs: { x: 20, y: 20 },
  },
  {
    type: 'text',
    id: 'txt-element-wrap',
    text: 'alpha beta\ngamma delta',
    style: {
      fontSize: 14,
      fill: '#111827',
      wordWrap: true,
      wordWrapWidth: 90,
    },
    attrs: { x: 20, y: 70 },
  },
  {
    type: 'item',
    id: 'txt-item',
    size: { width: 180, height: 120 },
    padding: 8,
    attrs: { x: 180, y: 24 },
    components: [
      {
        type: 'text',
        id: 'txt-component-default',
        text: 'component default',
      },
      {
        type: 'text',
        id: 'txt-component-auto',
        label: 'auto-font',
        text: 'AUTO FONT WRAPS HERE',
        placement: 'top',
        split: 2,
        style: {
          fontSize: 20,
          fill: '#0f172a',
          autoFont: {},
          wordWrap: true,
          wordWrapWidth: 72,
        },
      },
      {
        type: 'text',
        id: 'txt-component-newline',
        text: 'line one\nline two',
        placement: 'bottom',
        style: {
          fontSize: 12,
          fill: '#334155',
          wordWrap: true,
          wordWrapWidth: 80,
        },
      },
    ],
  },
];

const txt101 = {
  id: 'TXT-101',
  level: 1,
  title: 'Element and item-component text expose distinct materialization and geometry',
  questions: ['Q12', 'Q19'],
  invocation: [
    'draw element text defaults plus constrained wrapping/newline input',
    'draw item text components with autoFont, overflow, placement and constrained size',
    'update and refresh the autoFont component by explicit ID',
    'record materialized props, geometry, public scene and exact invalid errors',
  ],
  timingBoundaries: ['draw return', 'update return', 'settled rendered frame'],
  volatileFields: [],
  evidencePolicy: {
    publicBehaviorStateGeometryText: {
      normative: true,
    },
    pixel: {
      normative: false,
      status: 'provisional-non-windows',
      reason: 'Current macOS headless SwiftShader text raster is environment provenance only.',
      requiredConfirmation: 'Reconfirm native/headed Windows before normative cross-environment pixel comparison.',
    },
  },
  screenshot: true,
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = [];
    patchmap.on('patchmap:updated', (...args) => {
      eventTrace.push({ event: 'patchmap:updated', args: normalizeEventArgs(args, patchmap) });
    });
    const draw = captureDraw(patchmap, textInput());
    const before = snapshotManagedScene(patchmap.world);
    const item = findById(patchmap, 'txt-item');
    const update = captureUpdate(patchmap, {
      elements: item,
      changes: {
        components: [
          {
            type: 'text',
            id: 'txt-component-auto',
            text: 'UPDATED AUTO FONT CONTENT',
            placement: 'right-bottom',
            split: 1,
            style: { autoFont: {}, wordWrap: true, wordWrapWidth: 64 },
          },
        ],
      },
    });
    const afterUpdate = snapshotManagedScene(patchmap.world);
    const refresh = captureUpdate(patchmap, {
      elements: item,
      changes: {
        components: [{ type: 'text', id: 'txt-component-auto' }],
      },
      refresh: true,
    });
    const invalid = [
      ['invalid-overflow', { overflow: 'invalid-overflow' }],
      ['invalid-placement', { placement: 'invalid-placement' }],
      ['invalid-auto-font', { style: { autoFont: true } }],
    ].map(([name, invalidFields]) => ({
      name,
      call: captureDraw(patchmap, [
        {
          type: 'item',
          id: `txt-invalid-${name}`,
          size: 80,
          components: [{ type: 'text', text: 'invalid probe', ...invalidFields }],
        },
      ]),
    }));
    await waitForRenderedFrame(patchmap);
    const settled = snapshotManagedScene(patchmap.world);
    patchmap.app.render();
    preserveCanvasSnapshot(patchmap.app.canvas, 'oracle-settled-snapshot');
    return {
      observed: { draw, before, update, afterUpdate, refresh, invalid, settled, eventTrace },
      cleanup: () => patchmap.destroy(),
    };
  },
};

const snapshotAnimationContext = (patchmap, assigned = undefined, baseline = undefined) => {
  const value = patchmap.animationContext;
  return {
    valueKind: value === null ? 'null' : typeof value,
    type: typeof value,
    isNull: value === null,
    equalsAssigned: assigned === undefined ? null : value === assigned,
    equalsBaseline: baseline === undefined ? null : value === baseline,
    ownsPublicProperty: Object.hasOwn(patchmap, 'animationContext'),
  };
};

const ctx101 = {
  id: 'CTX-101',
  level: 2,
  title: 'Animation context lifecycle and assignment are public observations',
  questions: ['Q20'],
  invocation: [
    'read animationContext before init and after init',
    'assign independently authored object/null/string values and read strict ownership/equality',
    'draw and update an animated bar across a rendered frame',
    'destroy, re-init and repeat reads',
  ],
  timingBoundaries: [
    'before init',
    'after init',
    'draw/update return',
    'next rendered frame after a 30ms settle boundary',
    'destroy/re-init',
  ],
  volatileFields: [],
  async run({ Patchmap }) {
    const host = createHost();
    const patchmap = new Patchmap();
    const beforeInit = snapshotAnimationContext(patchmap);
    const baselineContext = patchmap.animationContext;
    await patchmap.init(host, fixedInitOptions());
    const afterInit = snapshotAnimationContext(patchmap, undefined, baselineContext);
    const assignedObject = { owner: 'fixture', progress: 0.25 };
    const assignments = [];
    for (const [name, value] of [
      ['object', assignedObject],
      ['null', null],
      ['string', 'fixture-context'],
    ]) {
      let outcome;
      try {
        patchmap.animationContext = value;
        outcome = { returned: { kind: 'assignment-completed' } };
      } catch (error) {
        outcome = { threw: normalizeError(error) };
      }
      assignments.push({
        name,
        outcome,
        snapshot: snapshotAnimationContext(patchmap, value, baselineContext),
      });
    }
    const draw = captureDraw(patchmap, [
      {
        type: 'item',
        id: 'ctx-item',
        size: 80,
        components: [
          {
            type: 'bar',
            id: 'ctx-bar',
            source: { type: 'rect', fill: '#ffffff' },
            size: { width: '70%', height: '20%' },
            tint: '#0c73bf',
            animation: true,
            animationDuration: 1,
          },
        ],
      },
    ]);
    const bar = findById(patchmap, 'ctx-bar');
    const beforeUpdate = snapshotElement(bar);
    const update = captureUpdate(patchmap, {
      elements: findById(patchmap, 'ctx-item'),
      changes: {
        components: [
          {
            type: 'bar',
            id: 'ctx-bar',
            size: { width: '70%', height: '60%' },
            animation: true,
            animationDuration: 1,
          },
        ],
      },
    });
    const atReturn = snapshotElement(findById(patchmap, 'ctx-bar'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await waitForRenderedFrame(patchmap);
    const nextFrame = snapshotElement(findById(patchmap, 'ctx-bar'));
    patchmap.destroy();
    const afterDestroy = snapshotAnimationContext(patchmap, assignedObject, baselineContext);
    const destroyedContext = patchmap.animationContext;
    await patchmap.init(host, fixedInitOptions());
    const afterReinit = snapshotAnimationContext(patchmap, assignedObject, baselineContext);
    afterReinit.equalsAfterDestroy = patchmap.animationContext === destroyedContext;
    patchmap.destroy();
    return {
      beforeInit,
      afterInit,
      assignments,
      draw,
      beforeUpdate,
      update,
      atReturn,
      nextFrame,
      afterDestroy,
      afterReinit,
      eventTrace: [],
    };
  },
};

const recordStateCall = (patchmap, name, args, invoke) => ({
  name,
  call: observeCall(patchmap, { args }, invoke),
});

const sta101 = {
  id: 'STA-101',
  level: 1,
  title: 'Default selection registration and state manager lifecycle are timed publicly',
  questions: ['Q3', 'Q22'],
  invocation: [
    'after init before draw, call documented setState(selection)',
    'draw, redraw, destroy and re-init while repeating the same documented call',
    'register an independently authored State subclass and exercise set/push/pop/reset/modifier methods when callable',
    'record exact public returns/errors and ordered state/modifier events',
  ],
  timingBoundaries: ['post-init/pre-draw', 'post-draw', 'post-redraw', 'post-destroy', 'post-reinit'],
  volatileFields: [],
  async run({ Patchmap, State, PROPAGATE_EVENT }) {
    class FixtureState extends State {
      static handledEvents = ['onpointerdown'];

      enter(store, options) {
        super.enter(store);
        this.fixtureOptions = options ?? null;
      }

      onpointerdown() {
        return PROPAGATE_EVENT;
      }
    }

    const host = createHost();
    const patchmap = new Patchmap();
    await patchmap.init(host, fixedInitOptions());
    const manager = patchmap.stateManager;
    const eventTrace = [];
    for (const event of [
      'state:pushed',
      'state:popped',
      'state:set',
      'state:reset',
      'state:destroyed',
      'modifier:activated',
      'modifier:deactivated',
    ]) {
      manager.on(event, (...args) => {
        eventTrace.push({ event, args: normalizeEventArgs(args, patchmap) });
      });
    }
    const methodSurface = Object.fromEntries(
      [
        'register',
        'setState',
        'pushState',
        'popState',
        'resetState',
        'activateModifier',
        'deactivateModifier',
      ].map((name) => [name, typeof manager?.[name]]),
    );
    const timeline = [];
    timeline.push(
      recordStateCall(patchmap, 'selection-after-init-before-draw', ['selection'], () =>
        manager.setState('selection'),
      ),
    );
    const draw = captureDraw(patchmap, [
      {
        type: 'rect',
        id: 'sta-rect',
        size: 20,
        fill: '#0c73bf',
      },
    ]);
    timeline.push(
      recordStateCall(patchmap, 'selection-after-draw', ['selection'], () =>
        manager.setState('selection'),
      ),
    );
    const register = recordStateCall(
      patchmap,
      'register-fixture-state',
      ['fixture', 'FixtureState'],
      () => manager.register('fixture', FixtureState),
    );
    const customCalls = [
      recordStateCall(patchmap, 'set-fixture-state', ['fixture', { marker: 'set' }], () =>
        manager.setState('fixture', { marker: 'set' }),
      ),
    ];
    if (typeof manager.pushState === 'function') {
      customCalls.push(
        recordStateCall(patchmap, 'push-fixture-state', ['fixture', { marker: 'push' }], () =>
          manager.pushState('fixture', { marker: 'push' }),
        ),
      );
    }
    if (typeof manager.popState === 'function') {
      customCalls.push(
        recordStateCall(patchmap, 'pop-state', [], () => manager.popState()),
      );
    }
    if (typeof manager.activateModifier === 'function') {
      customCalls.push(
        recordStateCall(patchmap, 'activate-modifier', ['fixture'], () =>
          manager.activateModifier('fixture'),
        ),
      );
    }
    if (typeof manager.deactivateModifier === 'function') {
      customCalls.push(
        recordStateCall(patchmap, 'deactivate-modifier', ['fixture'], () =>
          manager.deactivateModifier('fixture'),
        ),
      );
    }
    if (typeof manager.resetState === 'function') {
      customCalls.push(
        recordStateCall(patchmap, 'reset-state', [], () => manager.resetState()),
      );
    }
    const invalidCalls = [
      recordStateCall(patchmap, 'set-unknown-state', ['oracle-unknown-state'], () =>
        manager.setState('oracle-unknown-state'),
      ),
      recordStateCall(patchmap, 'set-state-no-args', [], () => manager.setState()),
      recordStateCall(patchmap, 'activate-unknown-modifier', ['oracle-unknown-modifier'], () =>
        manager.activateModifier('oracle-unknown-modifier'),
      ),
      recordStateCall(patchmap, 'deactivate-unknown-modifier', ['oracle-unknown-modifier'], () =>
        manager.deactivateModifier('oracle-unknown-modifier'),
      ),
    ];
    const redraw = captureDraw(patchmap, [
      {
        type: 'rect',
        id: 'sta-rect-redraw',
        size: 24,
        fill: '#ef4444',
      },
    ]);
    timeline.push(
      recordStateCall(patchmap, 'selection-after-redraw', ['selection'], () =>
        manager.setState('selection'),
      ),
    );
    patchmap.destroy();
    const afterDestroy = recordStateCall(
      patchmap,
      'selection-on-destroyed-manager',
      ['selection'],
      () => manager.setState('selection'),
    );
    await patchmap.init(host, fixedInitOptions());
    const reinitManager = patchmap.stateManager;
    const afterReinitBeforeDraw = recordStateCall(
      patchmap,
      'selection-after-reinit-before-draw',
      ['selection'],
      () => reinitManager.setState('selection'),
    );
    patchmap.destroy();
    return {
      methodSurface,
      timeline,
      draw,
      register,
      customCalls,
      invalidCalls,
      redraw,
      afterDestroy,
      afterReinitBeforeDraw,
      eventTrace,
    };
  },
};

const vie101 = {
  id: 'VIE-101',
  level: 1,
  title: 'syncViewTransform surface and view controls expose public effects',
  questions: ['Q5', 'Q23'],
  invocation: [
    'probe only the named syncViewTransform public property before/after init',
    'if callable, invoke before init, after init, after draw, and after view mutation',
    'exercise rotation, flip, focus, fit and invalid fit padding through documented public calls',
  ],
  timingBoundaries: ['synchronous method return/error at each lifecycle phase'],
  volatileFields: [],
  async run({ Patchmap }) {
    const host = createHost();
    const patchmap = new Patchmap();
    const eventTrace = [];
    for (const event of ['patchmap:rotated', 'patchmap:flipped']) {
      patchmap.on(event, (...args) => {
        eventTrace.push({ event, args: normalizeEventArgs(args, patchmap) });
      });
    }
    const surface = [];
    const probe = (phase) => {
      const type = typeof patchmap.syncViewTransform;
      const entry = { phase, type };
      if (type === 'function') {
        entry.call = observeCall(patchmap, { phase }, () => patchmap.syncViewTransform());
        entry.after = snapshotViewport(patchmap);
      }
      surface.push(entry);
    };
    probe('before-init');
    await patchmap.init(host, fixedInitOptions());
    probe('after-init');
    const draw = captureDraw(patchmap, [
      {
        type: 'rect',
        id: 'vie-a',
        size: { width: 40, height: 20 },
        fill: '#0c73bf',
        attrs: { x: 40, y: 60 },
      },
      {
        type: 'rect',
        id: 'vie-b',
        size: { width: 20, height: 40 },
        fill: '#ef4444',
        attrs: { x: 180, y: 140 },
      },
    ]);
    probe('after-draw');
    const operations = [];
    for (const [name, input, invoke] of [
      ['focus-default', {}, () => patchmap.focus()],
      ['focus-explicit', { ids: ['vie-a'] }, () => patchmap.focus(['vie-a'])],
      ['fit-default', {}, () => patchmap.fit()],
      ['fit-padding-number', { padding: 24 }, () => patchmap.fit(undefined, { padding: 24 })],
      ['fit-padding-axis', { padding: { x: 5, y: 10 } }, () => patchmap.fit(undefined, { padding: { x: 5, y: 10 } })],
      ['fit-padding-invalid-edge', { padding: { top: 10 } }, () => patchmap.fit(undefined, { padding: { top: 10 } })],
      ['rotation-set', { value: 90 }, () => { patchmap.rotation.value = 90; }],
      ['rotation-rotateBy', { value: 45 }, () => patchmap.rotation.rotateBy(45)],
      ['rotation-reset', {}, () => patchmap.rotation.reset()],
      ['flip-set', { x: true, y: true }, () => patchmap.flip.set({ x: true, y: true })],
      ['flip-toggleX', {}, () => patchmap.flip.toggleX()],
      ['flip-toggleY', {}, () => patchmap.flip.toggleY()],
      ['flip-reset', {}, () => patchmap.flip.reset()],
    ]) {
      const call = observeCall(patchmap, input, invoke);
      operations.push({ name, call, view: snapshotViewport(patchmap) });
    }
    probe('after-view-mutations');
    patchmap.destroy();
    return { surface, draw, operations, eventTrace };
  },
};

export const priorityFixtures = [api101, rel101, txt101, ctx101, sta101, vie101];
