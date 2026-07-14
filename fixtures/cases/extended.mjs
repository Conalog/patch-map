import { Container } from 'pixi.js';
import {
  captureDraw,
  capturePublicCall,
  captureUpdate,
  createHost,
  findById,
  fixedInitOptions,
  flattenSelectorResult,
  normalizeError,
  normalizeEventArgs,
  normalizeGeneratedIds,
  normalizePublicValue,
  normalizeReturn,
  preserveCanvasSnapshot,
  roundNumber,
  snapshotElement,
  snapshotManagedScene,
  snapshotPatchmap,
  waitForAsyncEvents,
  waitForRenderedFrame,
} from '../lib/public-observers.mjs';

const createInitializedPatchmap = async (Patchmap, options = fixedInitOptions()) => {
  const host = createHost();
  const patchmap = new Patchmap();
  await patchmap.init(host, options);
  return { host, patchmap };
};

const outcomeOf = (invoke, normalize = normalizePublicValue) => {
  try {
    return { returned: normalize(invoke()) };
  } catch (error) {
    return { threw: normalizeError(error) };
  }
};

const publicIdentity = (value) =>
  value && typeof value === 'object'
    ? { id: value.id ?? null, type: value.type ?? null, label: value.label ?? null }
    : null;

const readNamedSurface = (value, names) =>
  Object.fromEntries(
    names.map((name) => {
      const member = value?.[name];
      if (typeof member === 'function') return [name, { type: 'function' }];
      if (Array.isArray(member)) {
        return [name, { type: 'array', length: member.length }];
      }
      if (member === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof member)) {
        return [name, { type: member === null ? 'null' : typeof member, value: member ?? null }];
      }
      return [name, { type: typeof member }];
    }),
  );

const api102 = {
  id: 'API-102',
  level: 1,
  title: 'Standalone public exports expose accepted arguments, returns, mutation and errors',
  questions: ['Q1'],
  invocation: [
    'call selector, uid, isMoved, intersectPoint and findIntersectObject with table-driven authored inputs',
    'include valid-looking, empty and malformed argument orders without enumerating returned private structure',
    'for geometry helpers also pass public live rect handles created through draw',
  ],
  timingBoundaries: ['synchronous standalone return/error'],
  volatileFields: [
    {
      field: 'uid return strings',
      replacement: 'type/length/uniqueness shape only',
      reason: 'Exact generated strings are non-normative.',
    },
  ],
  async run({
    Patchmap,
    selector,
    uid,
    isMoved,
    intersectPoint,
    findIntersectObject,
  }) {
    const authoredTree = {
      children: [
        { id: 'standalone-a', type: 'rect', label: 'Alpha' },
        { id: 'standalone-b', type: 'text', label: 'Beta' },
      ],
    };
    const selectorTable = [
      ['path-then-value', ['$..children', authoredTree]],
      ['value-then-path', [authoredTree, '$..children']],
      ['path-options-json', ['$..children', { json: authoredTree }]],
      ['root-only', ['$']],
      ['empty-path', ['', authoredTree]],
      ['invalid-path', ['$.children[', authoredTree]],
      ['no-args', []],
    ].map(([name, args]) => ({
      name,
      call: capturePublicCall({ args }, () => selector(...args)),
    }));

    const uidCalls = [];
    for (const [name, args] of [
      ['default-first', []],
      ['default-second', []],
      ['string-arg', ['fixture']],
      ['number-arg', [12]],
      ['null-arg', [null]],
    ]) {
      const call = outcomeOf(() => uid(...args), (value) => ({
        kind: typeof value,
        length: typeof value === 'string' ? value.length : null,
      }));
      uidCalls.push({ name, args, outcome: call });
    }
    const uidPair = [uid(), uid()];
    const uidRelationship = {
      bothStrings: uidPair.every((value) => typeof value === 'string'),
      lengths: uidPair.map((value) => (typeof value === 'string' ? value.length : null)),
      unique: uidPair[0] !== uidPair[1],
    };

    const pointA = { x: 10, y: 10 };
    const pointB = { x: 10, y: 10 };
    const pointC = { x: 14, y: 16 };
    const isMovedTable = [
      ['same-points', [pointA, pointB]],
      ['different-points', [pointA, pointC]],
      ['different-with-threshold', [pointA, pointC, 10]],
      ['numbers', [0, 0, 1, 1]],
      ['no-args', []],
      ['nulls', [null, null]],
    ].map(([name, args]) => ({
      name,
      call: capturePublicCall({ args }, () => isMoved(...args)),
    }));

    const authoredBounds = { x: 0, y: 0, width: 20, height: 20 };
    const intersectPointTable = [
      ['point-bounds', [pointA, authoredBounds]],
      ['bounds-point', [authoredBounds, pointA]],
      ['inside-four-numbers', [10, 10, authoredBounds]],
      ['outside', [{ x: 40, y: 40 }, authoredBounds]],
      ['empty', []],
      ['malformed', ['x', authoredBounds]],
    ].map(([name, args]) => ({
      name,
      call: capturePublicCall({ args }, () => intersectPoint(...args)),
    }));

    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [
      { type: 'rect', id: 'api-live-a', size: 24, fill: '#0c73bf', attrs: { x: 10, y: 10 } },
      { type: 'rect', id: 'api-live-b', size: 24, fill: '#ef4444', attrs: { x: 80, y: 10 } },
    ]);
    const liveA = findById(patchmap, 'api-live-a');
    const liveB = findById(patchmap, 'api-live-b');
    for (const [name, args] of [
      ['point-live-element', [{ x: 15, y: 15 }, liveA]],
      ['live-element-point', [liveA, { x: 15, y: 15 }]],
      ['live-elements', [liveA, liveB]],
    ]) {
      intersectPointTable.push({
        name,
        call: capturePublicCall({ args: args.map((value) => publicIdentity(value) ?? value) }, () => intersectPoint(...args)),
      });
    }
    const normalizeIntersect = (value) => {
      if (Array.isArray(value)) {
        return { kind: 'array', values: value.map(publicIdentity), length: value.length };
      }
      const identity = publicIdentity(value);
      return identity ? { kind: 'public-element', value: identity } : normalizePublicValue(value);
    };
    const findIntersectTable = [
      ['elements-point', [[liveA, liveB], { x: 15, y: 15 }]],
      ['point-elements', [{ x: 15, y: 15 }, [liveA, liveB]]],
      ['element-elements', [liveA, [liveA, liveB]]],
      ['world-point', [patchmap.world, { x: 15, y: 15 }]],
      ['world-live-element', [patchmap.world, liveA]],
      ['world-elements', [patchmap.world, [liveA, liveB]]],
      ['bounds-elements', [authoredBounds, [liveA, liveB]]],
      ['empty-elements', [[], pointA]],
      ['no-args', []],
    ].map(([name, args]) => ({
      name,
      outcome: outcomeOf(() => findIntersectObject(...args), normalizeIntersect),
    }));
    patchmap.destroy();
    return {
      selectorTable,
      uidCalls,
      uidRelationship,
      isMovedTable,
      intersectPointTable,
      draw,
      findIntersectTable,
      eventTrace: [],
    };
  },
};

const abi101 = {
  id: 'ABI-101',
  level: 1,
  title: 'Public class constructors expose defaults and invalid outcomes',
  questions: ['Q2'],
  invocation: [
    'construct Patchmap, Transformer, State, Command and UndoRedoManager with omitted, representative and invalid arguments',
    'read only named documented public properties and methods',
  ],
  timingBoundaries: ['synchronous constructor return/error'],
  volatileFields: [
    {
      field: 'Command generated IDs',
      replacement: 'type/length only',
      reason: 'Exact generated strings are non-normative.',
    },
  ],
  run({ Patchmap, Transformer, State, Command, UndoRedoManager }) {
    const table = [];
    const construct = (name, args, create, snapshot, cleanup) => {
      try {
        const value = create();
        table.push({ name, args, outcome: { returned: snapshot(value) } });
        cleanup?.(value);
      } catch (error) {
        table.push({ name, args, outcome: { threw: normalizeError(error) } });
      }
    };
    for (const [name, args] of [
      ['patchmap-default', []],
      ['patchmap-object', [{}]],
      ['patchmap-null', [null]],
    ]) {
      construct(name, args, () => new Patchmap(...args), (value) => snapshotPatchmap(value), (value) => value.destroy());
    }
    for (const [name, args] of [
      ['transformer-default', []],
      ['transformer-object', [{}]],
      ['transformer-custom', [{ boundsDisplayMode: 'none', resizeHandles: true, rotateHandles: true, transformHistory: true, resizeKeepRatio: true }]],
      ['transformer-null', [null]],
      ['transformer-invalid-mode', [{ boundsDisplayMode: 'invalid-mode' }]],
    ]) {
      construct(
        name,
        args,
        () => new Transformer(...args),
        (value) => ({
          surface: readNamedSurface(value, ['elements', 'selection', 'wireframeStyle', 'boundsDisplayMode', 'resizeHandles', 'rotateHandles', 'transformHistory', 'resizeKeepRatio', 'destroy']),
          selectionSurface: readNamedSurface(value.selection, ['add', 'remove', 'set']),
        }),
        (value) => value.destroy?.(),
      );
    }
    for (const [name, args] of [
      ['state-default', []],
      ['state-object', [{}]],
      ['state-null', [null]],
    ]) {
      construct(name, args, () => new State(...args), (value) => ({
        surface: readNamedSurface(value, ['enter', 'exit', 'pause', 'resume', 'destroy', 'store']),
      }));
    }
    for (const [name, args] of [
      ['command-default', []],
      ['command-string', ['fixture-command']],
      ['command-object', [{ id: 'fixture-command-object' }]],
      ['command-null', [null]],
    ]) {
      construct(name, args, () => new Command(...args), (value) => ({
        id: {
          type: typeof value.id,
          length: typeof value.id === 'string' ? value.id.length : null,
          equalsInputString: value.id === args[0],
        },
        surface: readNamedSurface(value, ['execute', 'undo']),
      }));
    }
    for (const [name, args] of [
      ['history-default', []],
      ['history-number', [3]],
      ['history-zero', [0]],
      ['history-object', [{ limit: 3 }]],
      ['history-null', [null]],
    ]) {
      construct(name, args, () => new UndoRedoManager(...args), (value) => ({
        surface: readNamedSurface(value, ['commands', 'execute', 'undo', 'redo', 'canUndo', 'canRedo', 'clear', 'destroy']),
        canUndo: outcomeOf(() => value.canUndo()),
        canRedo: outcomeOf(() => value.canRedo()),
      }), (value) => value.destroy());
    }
    return { table, eventTrace: [] };
  },
};

const minimalSchemaInputs = [
  ['group', [{ type: 'group', id: 'sch-group', children: [] }]],
  ['grid', [{ type: 'grid', id: 'sch-grid', cells: [], item: { size: 20 } }]],
  ['item', [{ type: 'item', id: 'sch-item', size: 20 }]],
  ['relations', [{ type: 'relations', id: 'sch-relations', links: [] }]],
  ['image', [{ type: 'image', id: 'sch-image', source: 'device' }]],
  ['text', [{ type: 'text', id: 'sch-text' }]],
  ['rect', [{ type: 'rect', id: 'sch-rect', size: 20 }]],
  ['components', [{
    type: 'item',
    id: 'sch-components',
    size: 80,
    components: [
      { type: 'background', id: 'sch-background', source: { type: 'rect' } },
      { type: 'bar', id: 'sch-bar', source: { type: 'rect' }, size: '50%' },
      { type: 'icon', id: 'sch-icon', source: 'device', size: 16 },
      { type: 'text', id: 'sch-component-text' },
    ],
  }]],
];

const sch101 = {
  id: 'SCH-101',
  level: 1,
  title: 'Minimal public schema defaults and validation errors are table-driven',
  questions: ['Q7', 'Q12'],
  invocation: [
    'draw each element kind and all component kinds with only documented required fields',
    'record complete materialized public props and live public geometry',
    'draw representative missing, unknown and malformed fields independently and record exact error name/message',
  ],
  timingBoundaries: ['synchronous draw return/error', 'settled frame for accepted inputs'],
  volatileFields: [
    {
      field: 'generated ids',
      replacement: '<generated-id:n>',
      reason: 'Exact generated strings are non-normative.',
    },
  ],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const valid = [];
    for (const [name, input] of minimalSchemaInputs) {
      const draw = captureDraw(patchmap, input);
      if (name === 'components') {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await waitForRenderedFrame(patchmap);
      valid.push({ name, draw, scene: snapshotManagedScene(patchmap.world) });
    }
    const invalidInputs = [
      ['unknown-element', [{ type: 'unknown', id: 'sch-invalid' }]],
      ['rect-missing-size', [{ type: 'rect', id: 'sch-invalid-rect' }]],
      ['item-missing-size', [{ type: 'item', id: 'sch-invalid-item' }]],
      ['image-missing-source', [{ type: 'image', id: 'sch-invalid-image' }]],
      ['bar-missing-required', [{ type: 'item', id: 'sch-invalid-bar-item', size: 40, components: [{ type: 'bar' }] }]],
      ['icon-invalid-placement', [{ type: 'item', id: 'sch-invalid-icon-item', size: 40, components: [{ type: 'icon', source: 'device', size: 12, placement: 'outside' }] }]],
      ['rect-unknown-field', [{ type: 'rect', id: 'sch-invalid-field', size: 20, oracleUnknown: true }]],
    ];
    const invalid = invalidInputs.map(([name, input]) => ({ name, draw: captureDraw(patchmap, input) }));
    patchmap.destroy();
    return { valid, invalid, eventTrace: [] };
  },
};

const upx101 = {
  id: 'UPX-101',
  level: 1,
  title: 'Overlapping targets, structural identity and type changes expose ordered public effects',
  questions: ['Q6', 'Q16', 'Q17'],
  invocation: [
    'draw independently authored groups, duplicate IDs, no-ID children, an item component and type-change targets',
    'update one rect through overlapping path and direct-element targeting',
    'replace children without IDs, move an explicit child between groups and update duplicate-ID targets',
    'attempt element/component discriminator changes and validateSchema/normalize variants',
  ],
  timingBoundaries: ['each synchronous update return/error', 'settled next frame'],
  volatileFields: [
    {
      field: 'generated ids',
      replacement: '<generated-id:n>',
      reason: 'Exact generated strings are non-normative; cross-phase relationships remain visible.',
    },
  ],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const eventTrace = [];
    patchmap.on('patchmap:updated', (...args) => eventTrace.push({ event: 'patchmap:updated', args: normalizeEventArgs(args, patchmap) }));
    const draw = captureDraw(patchmap, [
      {
        type: 'group', id: 'upx-group-a', children: [
          { type: 'rect', id: 'upx-overlap', label: 'overlap', size: 20, fill: '#0c73bf', attrs: { x: 5, y: 5 } },
          { type: 'rect', label: 'no-id-first', size: 22, fill: '#dbeafe', attrs: { x: 35, y: 5 } },
          { type: 'rect', id: 'upx-duplicate', label: 'duplicate-first', size: 16, fill: '#fca5a5', attrs: { x: 65, y: 5 } },
        ],
      },
      { type: 'group', id: 'upx-group-b', attrs: { y: 80 }, children: [] },
      {
        type: 'item', id: 'upx-item', size: 70, attrs: { x: 180, y: 20 }, components: [
          { type: 'icon', id: 'upx-component-switch', source: 'device', size: 16 },
          { type: 'text', label: 'upx-no-id-text', text: 'before' },
        ],
      },
      { type: 'rect', id: 'upx-type-switch-explicit', size: 30, fill: '#22c55e', attrs: { x: 280, y: 20 } },
      { type: 'rect', id: 'upx-validation', size: 24, fill: '#a855f7', attrs: { x: 340, y: 20 } },
      {
        type: 'grid',
        id: 'upx-grid-structural',
        cells: [['A', 'B']],
        attrs: { x: 180, y: 130 },
        item: {
          size: 44,
          components: [
            {
              type: 'text',
              id: 'upx-grid-template-text-explicit',
              label: 'grid-template-text',
              text: 'before-grid-template',
            },
          ],
        },
      },
    ]);
    const initial = snapshotManagedScene(patchmap.world);
    const duplicateIdDraw = captureDraw(patchmap, [
      {
        type: 'group', id: 'upx-duplicate-probe', children: [
          { type: 'rect', id: 'upx-duplicate-invalid', size: 16 },
          { type: 'rect', id: 'upx-duplicate-invalid', size: 18 },
        ],
      },
    ]);
    const overlap = findById(patchmap, 'upx-overlap');
    const overlappingTargets = captureUpdate(patchmap, {
      path: '$..children[?(@.id==="upx-overlap")]',
      elements: overlap,
      changes: { attrs: { x: 2 } },
      relativeTransform: true,
    });
    const afterOverlap = snapshotElement(findById(patchmap, 'upx-overlap'));

    const groupA = findById(patchmap, 'upx-group-a');
    const priorNoId = flattenSelectorResult(patchmap.selector('$..children[?(@.label==="no-id-first")]'))[0] ?? null;
    const noIdReplace = captureUpdate(patchmap, {
      elements: groupA,
      changes: {
        children: [
          { type: 'rect', label: 'no-id-first', size: 28, fill: '#93c5fd', attrs: { x: 40, y: 8 } },
          { type: 'rect', id: 'upx-overlap', label: 'overlap-moved-order', size: 20, fill: '#0c73bf', attrs: { x: 8, y: 8 } },
        ],
      },
      mergeStrategy: 'replace',
    });
    const nextNoId = flattenSelectorResult(patchmap.selector('$..children[?(@.label==="no-id-first")]'))[0] ?? null;
    const noIdRelationship = {
      prior: publicIdentity(priorNoId),
      next: publicIdentity(nextNoId),
      sameHandle: priorNoId === nextNoId,
      priorDestroyed: priorNoId?.destroyed ?? null,
    };

    const groupB = findById(patchmap, 'upx-group-b');
    const beforeMove = findById(patchmap, 'upx-overlap');
    const moveIntoGroupB = captureUpdate(patchmap, {
      elements: groupB,
      changes: {
        children: [{ type: 'rect', id: 'upx-overlap', label: 'moved-to-b', size: 20, fill: '#0c73bf' }],
      },
      mergeStrategy: 'replace',
    });
    const movedHandle = flattenSelectorResult(patchmap.selector('$..children[?(@.label==="moved-to-b")]'))[0] ?? null;
    const moveRelationship = {
      before: publicIdentity(beforeMove),
      after: publicIdentity(movedHandle),
      sameHandle: beforeMove === movedHandle,
      beforeDestroyed: beforeMove?.destroyed ?? null,
      afterParent: publicIdentity(movedHandle?.parent),
    };

    const duplicateTargets = flattenSelectorResult(patchmap.selector('$..children[?(@.id==="upx-duplicate")]'));
    const duplicateUpdate = captureUpdate(patchmap, {
      elements: duplicateTargets,
      changes: { show: false },
    });

    const typeTarget = findById(patchmap, 'upx-type-switch-explicit');
    const elementTypeChange = captureUpdate(patchmap, {
      elements: typeTarget,
      changes: { type: 'text', text: 'converted' },
    });
    const typeAfter = findById(patchmap, 'upx-type-switch-explicit');
    const elementTypeRelationship = {
      before: publicIdentity(typeTarget),
      after: publicIdentity(typeAfter),
      sameHandle: typeTarget === typeAfter,
      beforeDestroyed: typeTarget?.destroyed ?? null,
      afterSnapshot: snapshotElement(typeAfter),
    };

    const item = findById(patchmap, 'upx-item');
    const componentBefore = findById(patchmap, 'upx-component-switch');
    const componentTypeChange = captureUpdate(patchmap, {
      elements: item,
      changes: { components: [{ type: 'text', id: 'upx-component-switch', text: 'converted component' }] },
    });
    const componentAfter = findById(patchmap, 'upx-component-switch');
    const componentTypeRelationship = {
      before: publicIdentity(componentBefore),
      after: publicIdentity(componentAfter),
      sameHandle: componentBefore === componentAfter,
      beforeDestroyed: componentBefore?.destroyed ?? null,
      afterSnapshot: snapshotElement(componentAfter),
    };

    const snapshotGridIdentity = () => {
      const grid = findById(patchmap, 'upx-grid-structural');
      const items = (grid?.children ?? []).filter((child) => child.type === 'item');
      return {
        grid: snapshotElement(grid),
        items: items.map((gridItem) => ({
          item: publicIdentity(gridItem),
          components: (gridItem.children ?? [])
            .filter((child) => ['background', 'bar', 'icon', 'text'].includes(child.type))
            .map(publicIdentity),
        })),
      };
    };
    const gridBefore = snapshotGridIdentity();
    const gridTarget = findById(patchmap, 'upx-grid-structural');
    const gridTemplateUpdate = captureUpdate(patchmap, {
      elements: gridTarget,
      changes: {
        item: {
          components: [
            {
              type: 'text',
              id: 'upx-grid-template-text-explicit',
              label: 'grid-template-text',
              text: 'after-grid-template',
            },
          ],
        },
      },
    });
    const gridAfter = snapshotGridIdentity();

    const validation = findById(patchmap, 'upx-validation');
    const validateTrue = captureUpdate(patchmap, {
      elements: validation,
      changes: { show: 'fixture-invalid' },
      validateSchema: true,
    });
    const afterValidateTrue = snapshotElement(validation);
    const validateFalse = captureUpdate(patchmap, {
      elements: validation,
      changes: { show: 'fixture-invalid' },
      validateSchema: false,
    });
    const afterValidateFalse = snapshotElement(validation);
    const normalizeFalse = captureUpdate(patchmap, {
      elements: validation,
      changes: { size: 31, padding: { x: 2, top: 7 } },
      normalize: false,
      validateSchema: false,
    });
    const afterNormalizeFalse = snapshotElement(validation);
    await waitForRenderedFrame(patchmap);
    const settled = snapshotManagedScene(patchmap.world);
    const history = {
      commandsLength: patchmap.undoRedoManager?.commands?.length ?? null,
      canUndo: patchmap.undoRedoManager?.canUndo?.() ?? null,
      canRedo: patchmap.undoRedoManager?.canRedo?.() ?? null,
    };
    patchmap.destroy();
    return normalizeGeneratedIds({
      draw,
      initial,
      duplicateIdDraw,
      overlappingTargets,
      afterOverlap,
      noIdReplace,
      noIdRelationship,
      moveIntoGroupB,
      moveRelationship,
      duplicateTargetOrder: duplicateTargets.map(publicIdentity),
      duplicateUpdate,
      elementTypeChange,
      elementTypeRelationship,
      componentTypeChange,
      componentTypeRelationship,
      gridBefore,
      gridTemplateUpdate,
      gridAfter,
      validateTrue,
      afterValidateTrue,
      validateFalse,
      afterValidateFalse,
      normalizeFalse,
      afterNormalizeFalse,
      settled,
      history,
      eventTrace,
    });
  },
};

const drx101 = {
  id: 'DRX-101',
  level: 1,
  title: 'Replacement draw destruction is observed at return and after async drain',
  questions: ['Q10'],
  invocation: [
    'draw one managed rect and attach one authored public Pixi Container to world',
    'call replacement draw and inspect both prior handles immediately after return',
    'drain documented async draw events and inspect the same handles again',
  ],
  timingBoundaries: ['synchronous replacement draw return', 'async event/ticker drain'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const firstDraw = captureDraw(patchmap, [{ type: 'rect', id: 'drx-before', size: 24, fill: '#0c73bf' }]);
    const priorManaged = findById(patchmap, 'drx-before');
    const unmanaged = new Container({ label: 'drx-unmanaged' });
    patchmap.world.addChild(unmanaged);
    const secondDraw = captureDraw(patchmap, [{ type: 'text', id: 'drx-after', text: 'after' }]);
    const atReturn = {
      managed: { parentIsNull: priorManaged.parent === null, destroyed: priorManaged.destroyed },
      unmanaged: { parentIsNull: unmanaged.parent === null, destroyed: unmanaged.destroyed },
      scene: snapshotManagedScene(patchmap.world),
      worldChildCount: patchmap.world.children.length,
    };
    await waitForAsyncEvents(patchmap);
    const afterDrain = {
      managed: { parentIsNull: priorManaged.parent === null, destroyed: priorManaged.destroyed },
      unmanaged: { parentIsNull: unmanaged.parent === null, destroyed: unmanaged.destroyed },
      scene: snapshotManagedScene(patchmap.world),
      worldChildCount: patchmap.world.children.length,
    };
    patchmap.destroy();
    return { firstDraw, secondDraw, atReturn, afterDrain, eventTrace: [] };
  },
};

const snapshotDisplayTree = (root) => {
  const output = [];
  const visit = (children, depth) => {
    for (const child of children ?? []) {
      let bounds = null;
      try {
        const value = child.getBounds?.();
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
      output.push({
        depth,
        id: child.id ?? null,
        label: child.label ?? null,
        type: child.type ?? null,
        eventMode: child.eventMode ?? null,
        visible: child.visible ?? null,
        renderable: child.renderable ?? null,
        bounds,
      });
      visit(child.children, depth + 1);
    }
  };
  visit(root?.children, 0);
  return output;
};

const eventPoint = (element) => {
  const bounds = element?.getBounds?.();
  return bounds
    ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    : { x: 10, y: 10 };
};

const dispatchPointer = (canvas, type, point, options = {}) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: options.pointerId ?? 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: point.x,
    clientY: point.y,
    screenX: point.x,
    screenY: point.y,
    button: options.button ?? 0,
    buttons: options.buttons ?? (type === 'pointerup' ? 0 : 1),
    detail: options.detail ?? 1,
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    shiftKey: Boolean(options.shiftKey),
  });
  canvas.dispatchEvent(event);
};

const dispatchTap = async (patchmap, point, options = {}) => {
  dispatchPointer(patchmap.app.canvas, 'pointerdown', point, {
    ...options,
    buttons: options.button === 2 ? 2 : 1,
  });
  dispatchPointer(patchmap.app.canvas, 'pointerup', point, { ...options, buttons: 0 });
  await waitForAsyncEvents(patchmap);
};

const normalizeTransformerPayload = (value) => {
  if (!value || typeof value !== 'object') return normalizePublicValue(value);
  if (Array.isArray(value)) return value.map(publicIdentity);
  const output = {};
  for (const key of ['current', 'added', 'removed', 'elements']) {
    if (Array.isArray(value[key])) output[key] = value[key].map(publicIdentity);
  }
  return Object.keys(output).length > 0 ? output : normalizePublicValue(value);
};

const snapshotTransformerOptions = (transformer) => ({
  wireframeStyle: normalizePublicValue(transformer.wireframeStyle),
  boundsDisplayMode: transformer.boundsDisplayMode,
  resizeHandles: transformer.resizeHandles,
  rotateHandles: transformer.rotateHandles,
  transformHistory: transformer.transformHistory,
  resizeKeepRatio: transformer.resizeKeepRatio,
});

const trn101 = {
  id: 'TRN-101',
  level: 1,
  title: 'Transformer defaults, selection, handles and ratio callback are public observations',
  questions: ['Q11', 'Q12'],
  invocation: [
    'assign default and custom Transformer instances to an initialized Patchmap',
    'set/add/remove public selected elements and record ordered update_elements payloads',
    'record the public Pixi display tree for wireframe and handle geometry',
    'dispatch a public pointer gesture at an interactive handle and record getResizeKeepRatio callback arguments if reached',
  ],
  timingBoundaries: ['assignment/selection return', 'settled frame', 'pointer down/move/up gesture'],
  volatileFields: [],
  async run({ Patchmap, Transformer }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [
      { type: 'rect', id: 'trn-a', size: { width: 60, height: 40 }, fill: '#0c73bf', attrs: { x: 80, y: 80, angle: 15 } },
      { type: 'rect', id: 'trn-b', size: { width: 40, height: 30 }, fill: '#ef4444', attrs: { x: 190, y: 100 } },
    ]);
    const a = findById(patchmap, 'trn-a');
    const b = findById(patchmap, 'trn-b');
    const defaultTransformer = new Transformer();
    const defaultBeforeAssign = readNamedSurface(defaultTransformer, [
      'elements', 'wireframeStyle', 'boundsDisplayMode', 'resizeHandles', 'rotateHandles', 'transformHistory', 'resizeKeepRatio',
    ]);
    const defaultOptions = snapshotTransformerOptions(defaultTransformer);
    patchmap.transformer = defaultTransformer;
    const defaultAfterAssign = readNamedSurface(defaultTransformer, [
      'elements', 'wireframeStyle', 'boundsDisplayMode', 'resizeHandles', 'rotateHandles', 'transformHistory', 'resizeKeepRatio',
    ]);

    const ratioTrace = [];
    const custom = new Transformer({
      wireframeStyle: { thickness: 2, color: '#ff00ff' },
      boundsDisplayMode: 'all',
      resizeHandles: true,
      rotateHandles: true,
      transformHistory: true,
      resizeKeepRatio: false,
      getResizeKeepRatio: ({ event, handle, elements }) => {
        ratioTrace.push({
          argumentOrder: ['single-object'],
          event: {
            type: event?.type ?? null,
            shiftKey: event?.shiftKey ?? null,
            pointerType: event?.pointerType ?? null,
          },
          handle: {
            kind: handle === null ? 'null' : typeof handle,
            value: ['string', 'number', 'boolean'].includes(typeof handle)
              ? handle
              : null,
            id: handle && typeof handle === 'object' ? handle.id ?? null : null,
            label: handle && typeof handle === 'object' ? handle.label ?? null : null,
            type: handle && typeof handle === 'object' ? handle.type ?? null : null,
          },
          elements: Array.isArray(elements) ? elements.map(publicIdentity) : null,
        });
        return true;
      },
    });
    const selectionEvents = [];
    custom.on('update_elements', (...args) => {
      selectionEvents.push({
        event: 'update_elements',
        args: args.map(normalizeTransformerPayload),
      });
    });
    patchmap.transformer = custom;
    const priorDefaultAfterReplacement = {
      destroyed: defaultTransformer.destroyed ?? null,
      parentIsNull: defaultTransformer.parent === null,
    };
    const calls = [];
    calls.push({ name: 'elements-set-one', outcome: outcomeOf(() => { custom.elements = [a]; }) });
    calls.push({ name: 'selection-add-second', outcome: outcomeOf(() => custom.selection.add(b)) });
    calls.push({ name: 'selection-remove-first', outcome: outcomeOf(() => custom.selection.remove(a)) });
    calls.push({ name: 'selection-set-one', outcome: outcomeOf(() => custom.selection.set([a])) });
    await waitForRenderedFrame(patchmap);
    const customSurface = readNamedSurface(custom, [
      'elements', 'wireframeStyle', 'boundsDisplayMode', 'resizeHandles', 'rotateHandles', 'transformHistory', 'resizeKeepRatio',
    ]);
    const customOptions = snapshotTransformerOptions(custom);
    const displayTreeBeforeGesture = snapshotDisplayTree(custom);
    const interactive = [];
    const collectInteractive = (children) => {
      for (const child of children ?? []) {
        if (child.eventMode && child.eventMode !== 'none') interactive.push(child);
        collectInteractive(child.children);
      }
    };
    collectInteractive(custom.children);
    const handle = interactive.find((value) => /^resize-handle:/i.test(String(value.label ?? ''))) ?? interactive.at(-1) ?? null;
    let gesture = { attempted: false, handle: null };
    if (handle) {
      const start = eventPoint(handle);
      const end = { x: start.x + 18, y: start.y + 12 };
      gesture = {
        attempted: true,
        handle: { id: handle.id ?? null, label: handle.label ?? null, type: handle.type ?? null, eventMode: handle.eventMode ?? null },
        start: { x: roundNumber(start.x), y: roundNumber(start.y) },
        end,
      };
      dispatchPointer(patchmap.app.canvas, 'pointerdown', start, { buttons: 1 });
      await waitForAsyncEvents(patchmap);
      dispatchPointer(patchmap.app.canvas, 'pointermove', end, { buttons: 1 });
      await waitForAsyncEvents(patchmap);
      dispatchPointer(patchmap.app.canvas, 'pointerup', end, { buttons: 0 });
      await waitForAsyncEvents(patchmap);
    }
    const afterGesture = {
      elements: [snapshotElement(a), snapshotElement(b)],
      displayTree: snapshotDisplayTree(custom),
      history: {
        commandsLength: patchmap.undoRedoManager.commands.length,
        canUndo: patchmap.undoRedoManager.canUndo(),
      },
    };
    patchmap.destroy();
    return {
      draw,
      defaultBeforeAssign,
      defaultOptions,
      defaultAfterAssign,
      priorDefaultAfterReplacement,
      calls,
      customSurface,
      customOptions,
      selectionEvents,
      displayTreeBeforeGesture,
      gesture,
      ratioTrace,
      afterGesture,
    };
  },
};

const normalizeInteractionArg = (value) => {
  if (Array.isArray(value)) return { kind: 'elements', values: value.map(publicIdentity) };
  if (value && typeof value.type === 'string' && ('props' in value || 'parent' in value)) {
    return { kind: 'element', value: publicIdentity(value) };
  }
  if (value && typeof value === 'object' && typeof value.type === 'string') {
    return {
      kind: 'event',
      type: value.type,
      detail: value.detail ?? null,
      button: value.button ?? null,
      buttons: value.buttons ?? null,
      pointerType: value.pointerType ?? null,
      ctrlKey: value.ctrlKey ?? null,
      metaKey: value.metaKey ?? null,
      shiftKey: value.shiftKey ?? null,
      target: publicIdentity(value.target),
    };
  }
  return normalizePublicValue(value);
};

const int101 = {
  id: 'INT-101',
  level: 1,
  title: 'Selection callback arguments, modes and drill timing are driven through public pointer events',
  questions: ['Q4', 'Q18'],
  invocation: [
    'draw nested selectable elements and activate selection with omitted/default mode options plus callbacks',
    'dispatch public pointer tap, double-detail, right-click and drag sequences at live public bounds',
    'repeat with closestGroup, filter, paintSelection, drillDown and deepSelect options',
    'record exact callback argument order and known public event fields',
  ],
  timingBoundaries: ['pointerdown', 'pointerup/tap', 'movement threshold', 'consecutive detail=2 taps', 'async event drain'],
  volatileFields: [],
  async run({ Patchmap, Transformer }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    patchmap.transformer = new Transformer();
    const draw = captureDraw(patchmap, [
      {
        type: 'group', id: 'int-outer', label: 'outer', attrs: { x: 30, y: 30 }, children: [
          {
            type: 'group', id: 'int-inner-group-explicit', label: 'inner-group', children: [
              { type: 'rect', id: 'int-target', label: 'target', size: 48, fill: '#0c73bf' },
              { type: 'rect', id: 'int-filtered', label: 'filtered', size: 36, fill: '#ef4444', attrs: { x: 70 } },
            ],
          },
        ],
      },
    ]);
    await waitForRenderedFrame(patchmap);
    const target = findById(patchmap, 'int-target');
    const filtered = findById(patchmap, 'int-filtered');
    const trace = [];
    const callback = (name) => (...args) => {
      trace.push({ callback: name, args: args.map(normalizeInteractionArg) });
    };
    const callbacks = {
      onDown: callback('onDown'),
      onUp: callback('onUp'),
      onClick: callback('onClick'),
      onDoubleClick: callback('onDoubleClick'),
      onRightClick: callback('onRightClick'),
      onDragStart: callback('onDragStart'),
      onDrag: callback('onDrag'),
      onDragEnd: callback('onDragEnd'),
      onOver: callback('onOver'),
    };
    const stateCalls = [];
    stateCalls.push({
      name: 'defaults-omitted',
      call: capturePublicCall({ options: 'callbacks-only' }, () => patchmap.stateManager.setState('selection', callbacks)),
    });
    trace.push({ boundary: 'default-tap' });
    await dispatchTap(patchmap, eventPoint(target));

    stateCalls.push({
      name: 'closest-group-filter',
      call: capturePublicCall({ selectUnit: 'closestGroup', draggable: true }, () => patchmap.stateManager.setState('selection', {
        ...callbacks,
        draggable: true,
        selectUnit: 'closestGroup',
        filter: (value) => {
          trace.push({ filter: publicIdentity(value) });
          return value?.id !== 'int-filtered';
        },
      })),
    });
    trace.push({ boundary: 'filtered-tap' });
    await dispatchTap(patchmap, eventPoint(filtered));
    trace.push({ boundary: 'drag' });
    const dragStart = eventPoint(target);
    const dragEnd = { x: dragStart.x + 30, y: dragStart.y + 20 };
    dispatchPointer(patchmap.app.canvas, 'pointerdown', dragStart, { buttons: 1 });
    dispatchPointer(patchmap.app.canvas, 'pointermove', dragEnd, { buttons: 1 });
    dispatchPointer(patchmap.app.canvas, 'pointerup', dragEnd, { buttons: 0 });
    await waitForAsyncEvents(patchmap);

    stateCalls.push({
      name: 'drill-deep-paint',
      call: capturePublicCall({ drillDown: true, deepSelect: true, paintSelection: true }, () => patchmap.stateManager.setState('selection', {
        ...callbacks,
        drillDown: true,
        deepSelect: true,
        paintSelection: true,
      })),
    });
    trace.push({ boundary: 'drill-first' });
    await dispatchTap(patchmap, eventPoint(target), { detail: 1 });
    trace.push({ boundary: 'drill-second-detail-two' });
    await dispatchTap(patchmap, eventPoint(target), { detail: 2 });
    trace.push({ boundary: 'deep-meta' });
    await dispatchTap(patchmap, eventPoint(target), { metaKey: true });
    trace.push({ boundary: 'right-click' });
    await dispatchTap(patchmap, eventPoint(target), { button: 2 });
    const finalTarget = snapshotElement(target);
    patchmap.destroy();
    return {
      draw,
      stateCalls,
      trace,
      finalTarget,
    };
  },
};

const evt101 = {
  id: 'EVT-101',
  level: 1,
  title: 'Canvas event registration methods expose returns, callbacks, enablement and draw teardown',
  questions: ['Q5'],
  invocation: [
    'draw one explicit rect and register element plus canvas events with public event.add',
    'exercise get/getAll/off/on/remove and dispatch public pointer events',
    'redraw and observe whether registrations remain',
  ],
  timingBoundaries: ['registration return', 'pointer dispatch', 'redraw return', 'async drain'],
  volatileFields: [
    {
      field: 'auto-generated event id',
      replacement: 'type/length only',
      reason: 'Exact generated strings are non-normative.',
    },
    {
      field: 'synthetic click detail',
      replacement: '<browser-consecutive-click-count>',
      reason: 'The browser-derived consecutive-click counter varies with dispatch timing; callback order and other public event fields remain normative.',
    },
  ],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, [{ type: 'rect', id: 'evt-target', size: 50, fill: '#0c73bf', attrs: { x: 50, y: 50 } }]);
    await waitForRenderedFrame(patchmap);
    const trace = [];
    const listener = (name) => (...args) => trace.push({
      callback: name,
      args: args.map((value) => {
        const normalized = normalizeInteractionArg(value);
        if (normalized.kind === 'event' && normalized.type === 'click') {
          normalized.detail = '<browser-consecutive-click-count>';
        }
        return normalized;
      }),
    });
    const addElement = capturePublicCall(
      { id: 'evt-element', path: '$..children[?(@.id==="evt-target")]', action: 'pointerdown click' },
      () => patchmap.event.add({
        id: 'evt-element',
        path: '$..children[?(@.id==="evt-target")]',
        action: 'pointerdown click',
        fn: listener('element'),
      }),
    );
    const autoIdOutcome = outcomeOf(() => patchmap.event.add({ path: '$', action: 'pointerdown', fn: listener('canvas') }), (value) => ({
      kind: typeof value,
      length: typeof value === 'string' ? value.length : null,
    }));
    const getSnapshot = (id) => {
      const value = patchmap.event.get(id);
      return value
        ? {
            id: value.id ?? null,
            path: value.path ?? null,
            action: value.action ?? null,
            enabled: value.enabled ?? null,
            fnType: typeof value.fn,
          }
        : null;
    };
    const snapshotAll = () => {
      const value = patchmap.event.getAll();
      if (Array.isArray(value)) {
        return { kind: 'array', length: value.length };
      }
      if (value instanceof Map) {
        return {
          kind: 'map',
          size: value.size,
          keys: [...value.keys()]
            .map((key) => String(key))
            .map((key) => key === 'evt-element' ? key : '<generated-event-id>')
            .sort(),
        };
      }
      return {
        kind: value === null ? 'null' : typeof value,
        size: Number.isFinite(value?.size) ? value.size : null,
        keys: value && typeof value === 'object'
          ? Object.keys(value)
              .map((key) => key === 'evt-element' ? key : '<generated-event-id>')
              .sort()
          : [],
      };
    };
    const afterAdd = {
      explicit: getSnapshot('evt-element'),
      all: snapshotAll(),
    };
    const target = findById(patchmap, 'evt-target');
    trace.push({ boundary: 'enabled-dispatch' });
    await dispatchTap(patchmap, eventPoint(target));
    const off = capturePublicCall({ ids: 'evt-element' }, () => patchmap.event.off('evt-element'));
    trace.push({ boundary: 'disabled-dispatch' });
    await dispatchTap(patchmap, eventPoint(target));
    const on = capturePublicCall({ ids: 'evt-element' }, () => patchmap.event.on('evt-element'));
    trace.push({ boundary: 'reenabled-dispatch' });
    await dispatchTap(patchmap, eventPoint(target));
    const remove = capturePublicCall({ ids: 'evt-element' }, () => patchmap.event.remove('evt-element'));
    const afterRemove = { explicit: getSnapshot('evt-element'), all: snapshotAll() };
    const redraw = captureDraw(patchmap, [{ type: 'text', id: 'evt-after', text: 'after' }]);
    const afterRedraw = { all: snapshotAll() };
    patchmap.destroy();
    return { draw, addElement, autoIdOutcome, afterAdd, off, on, remove, afterRemove, redraw, afterRedraw, trace };
  },
};

const normalizeHistoryArg = (value) => {
  if (value && typeof value === 'object' && typeof value.id === 'string') {
    return { kind: 'command', id: value.id };
  }
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return { kind: 'null' };
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return { kind: typeof value, value };
  }
  if (Array.isArray(value)) {
    return { kind: 'array', length: value.length };
  }
  return { kind: typeof value };
};

const captureHistoryCall = (manager, input, invoke) =>
  captureHistoryCallWithCommand(manager, input, invoke, null);

const captureHistoryCallWithCommand = (manager, input, invoke, command) => {
  const inputBefore = JSON.parse(JSON.stringify(input));
  try {
    const value = invoke();
    const inputAfter = JSON.parse(JSON.stringify(input));
    return {
      outcome: {
        returned: value === undefined
          ? { kind: 'undefined' }
          : value === null
            ? { kind: 'null' }
            : ['string', 'number', 'boolean'].includes(typeof value)
              ? { kind: typeof value, value }
              : {
                  kind: typeof value,
                  equalsManager: value === manager,
                  equalsCommand: command === null ? null : value === command,
                },
      },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  } catch (error) {
    const inputAfter = JSON.parse(JSON.stringify(input));
    return {
      outcome: { threw: normalizeError(error) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  }
};

const his101 = {
  id: 'HIS-101',
  level: 1,
  title: 'Undo/redo returns, events, grouping and async command outcomes are public observations',
  questions: ['Q5', 'Q18'],
  invocation: [
    'execute authored synchronous Command subclasses and record manager state, returns and ordered events',
    'undo, redo, clear and destroy through public methods',
    'execute authored async resolve/reject Commands and compare return-time vs settled state',
    'execute two commands with the same public historyId and observe grouped undo state',
  ],
  timingBoundaries: ['synchronous manager return', 'promise settlement', 'undo/redo return'],
  volatileFields: [],
  async run({ Command, UndoRedoManager }) {
    const state = { value: 0, trace: [] };
    class FixtureCommand extends Command {
      constructor(id, delta) {
        super(id);
        this.delta = delta;
      }

      execute() {
        state.value += this.delta;
        state.trace.push(`execute:${this.id}:${this.delta}`);
        return state.value;
      }

      undo() {
        state.value -= this.delta;
        state.trace.push(`undo:${this.id}:${this.delta}`);
        return state.value;
      }
    }

    class AsyncResolveCommand extends Command {
      constructor() {
        super('async-resolve');
      }

      execute() {
        this.settlement = (async () => {
          state.value += 1;
          state.trace.push('async-resolve:start');
          await Promise.resolve();
          state.value += 1;
          state.trace.push('async-resolve:end');
          return state.value;
        })();
        return this.settlement;
      }

      async undo() {
        state.value -= 2;
        return state.value;
      }
    }

    class AsyncRejectCommand extends Command {
      constructor() {
        super('async-reject');
      }

      execute() {
        this.settlement = (async () => {
          state.value += 10;
          state.trace.push('async-reject:partial');
          await Promise.resolve();
          throw new Error('fixture async rejection');
        })();
        this.settlement.catch(() => {});
        return this.settlement;
      }

      async undo() {
        state.value -= 10;
        return state.value;
      }
    }

    const manager = new UndoRedoManager();
    const eventTrace = [];
    for (const event of [
      'history:executed',
      'history:undone',
      'history:redone',
      'history:cleared',
      'history:destroyed',
      'history:*',
    ]) {
      manager.on(event, (...args) => {
        eventTrace.push({ event, args: args.map(normalizeHistoryArg) });
      });
    }
    const managerState = () => ({
      value: state.value,
      commandsLength: manager.commands.length,
      canUndo: manager.canUndo(),
      canRedo: manager.canRedo(),
      commandIds: manager.commands.map((command) => command?.id ?? null),
      authoredTrace: [...state.trace],
    });
    const timeline = [];
    timeline.push({ name: 'initial', state: managerState() });
    const syncA = new FixtureCommand('sync-a', 2);
    timeline.push({
      name: 'execute-sync-a',
      call: captureHistoryCallWithCommand(manager, { id: 'sync-a', delta: 2 }, () => manager.execute(syncA), syncA),
      state: managerState(),
    });
    const syncB = new FixtureCommand('sync-b', 3);
    timeline.push({
      name: 'execute-sync-b',
      call: captureHistoryCallWithCommand(manager, { id: 'sync-b', delta: 3 }, () => manager.execute(syncB), syncB),
      state: managerState(),
    });
    timeline.push({ name: 'undo', call: captureHistoryCall(manager, {}, () => manager.undo()), state: managerState() });
    timeline.push({ name: 'redo', call: captureHistoryCall(manager, {}, () => manager.redo()), state: managerState() });

    const groupedManager = new UndoRedoManager();
    const groupedState = { value: 0 };
    class GroupCommand extends Command {
      constructor(id, delta) {
        super(id);
        this.delta = delta;
      }
      execute() { groupedState.value += this.delta; return groupedState.value; }
      undo() { groupedState.value -= this.delta; return groupedState.value; }
    }
    const grouped = [];
    const groupFirst = new GroupCommand('group-first', 1);
    grouped.push({ name: 'first', call: captureHistoryCallWithCommand(groupedManager, { historyId: 'fixture-group' }, () => groupedManager.execute(groupFirst, { historyId: 'fixture-group' }), groupFirst), commandsLength: groupedManager.commands.length, value: groupedState.value });
    const groupSecond = new GroupCommand('group-second', 2);
    grouped.push({ name: 'second', call: captureHistoryCallWithCommand(groupedManager, { historyId: 'fixture-group' }, () => groupedManager.execute(groupSecond, { historyId: 'fixture-group' }), groupSecond), commandsLength: groupedManager.commands.length, value: groupedState.value });
    grouped.push({ name: 'undo', call: captureHistoryCall(groupedManager, {}, () => groupedManager.undo()), commandsLength: groupedManager.commands.length, value: groupedState.value, canRedo: groupedManager.canRedo() });

    const asyncManager = new UndoRedoManager();
    const settleAuthoredPromise = async (promise) => {
      try {
        return { fulfilled: normalizePublicValue(await promise) };
      } catch (error) {
        return { rejected: normalizeError(error) };
      }
    };
    const beforeAsyncResolve = { value: state.value, commandsLength: asyncManager.commands.length };
    const resolveCommand = new AsyncResolveCommand();
    const asyncResolveManagerReturn = captureHistoryCallWithCommand(asyncManager, { id: resolveCommand.id }, () => asyncManager.execute(resolveCommand), resolveCommand);
    const asyncResolveAtReturn = { value: state.value, commandsLength: asyncManager.commands.length, canUndo: asyncManager.canUndo() };
    const asyncResolveSettlement = await settleAuthoredPromise(resolveCommand.settlement);
    const afterAsyncResolve = { value: state.value, commandsLength: asyncManager.commands.length, canUndo: asyncManager.canUndo(), trace: [...state.trace] };
    const beforeAsyncReject = { value: state.value, commandsLength: asyncManager.commands.length };
    const rejectCommand = new AsyncRejectCommand();
    const asyncRejectManagerReturn = captureHistoryCallWithCommand(asyncManager, { id: rejectCommand.id }, () => asyncManager.execute(rejectCommand), rejectCommand);
    const asyncRejectAtReturn = { value: state.value, commandsLength: asyncManager.commands.length, canUndo: asyncManager.canUndo() };
    const asyncRejectSettlement = await settleAuthoredPromise(rejectCommand.settlement);
    const afterAsyncReject = { value: state.value, commandsLength: asyncManager.commands.length, canUndo: asyncManager.canUndo(), trace: [...state.trace] };

    await new Promise((resolve) => setTimeout(resolve, 0));
    const eventsBeforeClear = [...eventTrace];
    const clear = captureHistoryCall(manager, {}, () => manager.clear());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const eventsAfterClear = [...eventTrace];
    const afterClear = managerState();
    const destroy = captureHistoryCall(manager, {}, () => manager.destroy());
    const afterDestroy = {
      commandsLength: manager.commands?.length ?? null,
      canUndo: outcomeOf(() => manager.canUndo()),
      canRedo: outcomeOf(() => manager.canRedo()),
    };
    groupedManager.destroy();
    asyncManager.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      timeline,
      grouped,
      beforeAsyncResolve,
      asyncResolveManagerReturn,
      asyncResolveAtReturn,
      asyncResolveSettlement,
      afterAsyncResolve,
      beforeAsyncReject,
      asyncRejectManagerReturn,
      asyncRejectAtReturn,
      asyncRejectSettlement,
      afterAsyncReject,
      clear,
      eventsBeforeClear,
      eventsAfterClear,
      afterClear,
      destroy,
      afterDestroy,
      eventTrace,
    };
  },
};

const ast101 = {
  id: 'AST-101',
  level: 1,
  title: 'Omitted assets expose built-in aliases, natural sizes, failure and teardown timing',
  questions: ['Q15'],
  invocation: [
    'initialize without an assets option',
    'draw documented device/loading aliases as images and item icons',
    'observe materialized props and live dimensions at return and after settled frames',
    'draw an unknown local alias without external network and observe public failure-side state and teardown',
  ],
  timingBoundaries: ['draw return', 'settled frames', 'replacement draw return', 'destroy return'],
  volatileFields: [],
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const defaultAssetSurface = {
      assetType: patchmap.asset === null ? 'null' : typeof patchmap.asset,
      members: readNamedSurface(patchmap.asset, ['get', 'load', 'unload', 'add', 'remove']),
    };
    const validDraw = captureDraw(patchmap, [
      { type: 'image', id: 'ast-device-image', source: 'device', attrs: { x: 20, y: 20 } },
      { type: 'image', id: 'ast-loading-image', source: 'loading', attrs: { x: 120, y: 20 } },
      {
        type: 'item', id: 'ast-item', size: 80, attrs: { x: 240, y: 20 }, components: [
          { type: 'icon', id: 'ast-device-icon-explicit', source: 'device', size: 24 },
          { type: 'icon', id: 'ast-loading-icon', source: 'loading', size: 20, placement: 'bottom' },
        ],
      },
    ]);
    const atReturn = snapshotManagedScene(patchmap.world);
    await waitForRenderedFrame(patchmap);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const settled = snapshotManagedScene(patchmap.world);
    const priorHandles = [
      findById(patchmap, 'ast-device-image'),
      findById(patchmap, 'ast-loading-image'),
      findById(patchmap, 'ast-device-icon-explicit'),
      findById(patchmap, 'ast-loading-icon'),
    ];
    const missingDraw = captureDraw(patchmap, [
      { type: 'image', id: 'ast-missing', source: 'oracle-local-missing-asset' },
    ]);
    const priorAtReplacementReturn = priorHandles.map((value) => ({
      identity: publicIdentity(value),
      destroyed: value?.destroyed ?? null,
      parentIsNull: value?.parent === null,
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await waitForRenderedFrame(patchmap);
    const missingSettled = snapshotManagedScene(patchmap.world);
    const missingHandle = findById(patchmap, 'ast-missing');
    patchmap.destroy();
    const afterDestroy = {
      missing: {
        identity: publicIdentity(missingHandle),
        destroyed: missingHandle?.destroyed ?? null,
        parentIsNull: missingHandle?.parent === null,
      },
    };
    return {
      defaultAssetSurface,
      validDraw,
      atReturn,
      settled,
      missingDraw,
      priorAtReplacementReturn,
      missingSettled,
      afterDestroy,
      eventTrace: [],
    };
  },
};

const s2Input = () => [
  {
    type: 'group',
    id: 's2-product-zone-explicit',
    label: 'maintained-product-zone',
    attrs: { x: 24, y: 24 },
    children: [
      {
        type: 'grid',
        id: 's2-rack',
        label: 'rack-a',
        cells: [
          ['A1', 'A2', 'A3', 0],
          ['B1', 'B2', 0, 'B4'],
          ['C1', 0, 'C3', 'C4'],
        ],
        gap: { x: 4, y: 6 },
        inactiveCellStrategy: 'hide',
        item: {
          size: { width: 64, height: 88 },
          padding: 5,
          components: [
            { type: 'background', source: { type: 'rect', fill: '#f8fafc', borderWidth: 1, borderColor: '#94a3b8', radius: 4 } },
            { type: 'bar', source: { type: 'rect', fill: '#ffffff' }, size: { width: '72%', height: '22%' }, tint: '#0c73bf', animation: false },
            { type: 'icon', source: 'device', size: 18, placement: 'top' },
            { type: 'text', text: 'slot', placement: 'bottom', style: { fontSize: 9, fill: '#1e293b' } },
          ],
        },
      },
      { type: 'text', id: 's2-title', text: 'S2 PRODUCT VIEW', style: { fontSize: 18, fill: '#0f172a' }, attrs: { x: 300, y: 10 } },
      { type: 'rect', id: 's2-legend', size: { width: 80, height: 28 }, fill: '#dbeafe', attrs: { x: 300, y: 48 } },
    ],
  },
];

const countPublicSceneNodes = (root) => {
  const byType = {};
  let allDescendants = 0;
  let visible = 0;
  let renderable = 0;
  const visit = (children) => {
    for (const child of children ?? []) {
      allDescendants += 1;
      if (child.visible) visible += 1;
      if (child.renderable) renderable += 1;
      const type = typeof child.type === 'string' ? child.type : '<no-public-type>';
      byType[type] = (byType[type] ?? 0) + 1;
      visit(child.children);
    }
  };
  visit(root?.children);
  return { allDescendants, visible, renderable, byType };
};

const s2101 = {
  id: 'S2-101',
  level: 1,
  title: 'Clean-room-safe maintained-product S2 fixture defines public scene counting',
  questions: ['Q12', 'Q21'],
  invocation: [
    'draw an independently authored 3x4 product-style grid with hidden inactive cells and four component kinds',
    'count every descendant reachable through public world.children recursively, grouped by each public child.type',
    'separately count visible and renderable public descendants and managed scene handles',
    'do not inspect renderer internals or claim a backend primitive/draw-call count',
  ],
  timingBoundaries: ['synchronous draw return', 'settled frame'],
  volatileFields: [
    {
      field: 'generated item/component ids',
      replacement: '<generated-id:n>',
      reason: 'Exact generated strings are non-normative.',
    },
  ],
  evidencePolicy: {
    publicBehaviorStateGeometryCounting: {
      normative: true,
      definition: 'Recursive public world.children descendant count, visible/renderable count, and managed public scene snapshot.',
    },
    backendPrimitiveCount: {
      normative: false,
      status: 'public-api-unavailable',
      reason: 'No renderer-internal cache, pipe, batcher or primitive enumeration is permitted or exposed through the reference public API.',
    },
    pixel: {
      normative: false,
      status: 'provisional-non-windows',
      reason: 'Current macOS headless SwiftShader capture is environment provenance only.',
      requiredConfirmation: 'Reconfirm native/headed Windows before normative cross-environment pixel comparison.',
    },
  },
  screenshot: true,
  async run({ Patchmap }) {
    const { patchmap } = await createInitializedPatchmap(Patchmap);
    const draw = captureDraw(patchmap, s2Input());
    const atReturn = {
      publicCounts: countPublicSceneNodes(patchmap.world),
      managedScene: snapshotManagedScene(patchmap.world),
    };
    await waitForRenderedFrame(patchmap);
    patchmap.app.render();
    const settled = {
      publicCounts: countPublicSceneNodes(patchmap.world),
      managedScene: snapshotManagedScene(patchmap.world),
    };
    preserveCanvasSnapshot(patchmap.app.canvas, 'oracle-settled-snapshot');
    return {
      observed: { draw, countingDefinition: s2101.evidencePolicy.publicBehaviorStateGeometryCounting.definition, atReturn, settled, eventTrace: [] },
      cleanup: () => patchmap.destroy(),
    };
  },
};

export const extendedFixtures = [
  api102,
  abi101,
  sch101,
  upx101,
  drx101,
  trn101,
  int101,
  evt101,
  his101,
  ast101,
  s2101,
];
