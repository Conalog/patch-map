import { describe, expect, it } from 'vitest';

import {
  PatchMapSemanticHistory,
  type PatchMapSemanticHistoryCommandInput,
} from '../../src/patch-map/history';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { planPatchMapPaintOrder } from '../../src/patch-map/semantic/paint-order';

interface StackNode {
  id: string;
  zIndex: number;
}

interface CompanionState {
  selection: string[];
  mode: string;
}

type StackDataset = readonly StackNode[];

describe('PatchMap semantic history', () => {
  it('restores the exact LAY-003 initial, patched, undo, and redo paint order', () => {
    const initial = stackingDataset();
    const patched = initial.map((entry) => (
      entry.id === 'low' ? { ...entry, zIndex: 6 } : { ...entry }
    ));
    const history = new PatchMapSemanticHistory<StackDataset, CompanionState>();
    let current: StackDataset = patched;

    expect(renderOrder(initial)).toEqual([
      'low',
      'first',
      'second',
      'high',
      'selection',
      'transformer',
    ]);
    expect(history.record(command(
      'lay-003-z-order',
      initial,
      patched,
      { selection: ['first'], mode: 'select' },
      { selection: ['low'], mode: 'transform' },
    ))).toBe('recorded');
    expect(renderOrder(current)).toEqual([
      'first',
      'second',
      'low',
      'high',
      'selection',
      'transformer',
    ]);

    initial[0]!.zIndex = 999;
    patched[0]!.zIndex = -999;
    const undo = history.undo((transition) => {
      expect(history.state().cursor).toBe(1);
      current = transition.snapshot.dataset;
      return true;
    });
    expect(undo).toMatchObject({
      direction: 'undo',
      cursorBefore: 1,
      cursorAfter: 0,
      snapshot: { companion: { selection: ['first'], mode: 'select' } },
    });
    expect(renderOrder(current)).toEqual([
      'low',
      'first',
      'second',
      'high',
      'selection',
      'transformer',
    ]);

    const redo = history.redo((transition) => {
      current = transition.snapshot.dataset;
      return true;
    });
    expect(redo).toMatchObject({
      direction: 'redo',
      cursorBefore: 0,
      cursorAfter: 1,
      snapshot: { companion: { selection: ['low'], mode: 'transform' } },
    });
    expect(renderOrder(current)).toEqual([
      'first',
      'second',
      'low',
      'high',
      'selection',
      'transformer',
    ]);
    expect(current.map((entry) => entry.id)).toEqual(['low', 'first', 'second', 'high']);
    expect(current).not.toBe(patched);
    expect(Object.isFrozen(current)).toBe(true);
    expect(current.every(Object.isFrozen)).toBe(true);
  });

  it('moves the cursor only after an atomic apply accepts', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const before = singleDataset('box', 0);
    const after = singleDataset('box', 1);
    history.record({ id: 'move', before: { dataset: before }, after: { dataset: after } });

    expect(history.undo(() => false)).toBeNull();
    expect(history.state()).toMatchObject({ cursor: 1, undoDepth: 1, redoDepth: 0 });
    expect(() => history.undo(() => {
      throw new Error('reconcile failed');
    })).toThrow('reconcile failed');
    expect(history.state()).toMatchObject({ cursor: 1, undoDepth: 1, redoDepth: 0 });
    expect(() => history.undo(() => {
      history.clear();
      return true;
    })).toThrow('a history transition is active');
    expect(history.state()).toMatchObject({ cursor: 1, undoDepth: 1, redoDepth: 0 });

    expect(history.undo(() => true)).not.toBeNull();
    expect(history.state()).toMatchObject({ cursor: 0, undoDepth: 0, redoDepth: 1 });
    expect(history.redo(() => true)).not.toBeNull();
    expect(history.state()).toMatchObject({ cursor: 1, undoDepth: 1, redoDepth: 0 });
  });

  it('preserves redo for no-op/refused attempts and clears it for a new commit', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const branch = singleDataset('box', 20);
    history.record(simpleCommand('one', zero, one));
    history.record(simpleCommand('two', one, two));
    history.undo(() => true);

    expect(history.state()).toMatchObject({ depth: 2, cursor: 1, redoDepth: 1 });
    expect(history.record(simpleCommand('declared-no-op', one, branch), 'no-op')).toBe('no-op');
    expect(history.record(simpleCommand('refused', one, branch), 'refused')).toBe('refused');
    expect(history.record(simpleCommand('equal', one, structuredClone(one)))).toBe('no-op');
    expect(history.state()).toMatchObject({ depth: 2, cursor: 1, redoDepth: 1 });

    expect(history.record(simpleCommand('branch', one, branch))).toBe('recorded');
    expect(history.state()).toMatchObject({ depth: 2, cursor: 2, redoDepth: 0 });
    expect(history.canRedo).toBe(false);
    expect(history.redo(() => true)).toBeNull();
    expect(history.inspect().commands.map((entry) => entry.id)).toEqual(['one', 'branch']);
  });

  it('preflights detached history state before surface publication and commits without rereading input', () => {
    const history = new PatchMapSemanticHistory<StackDataset, CompanionState>({ capacity: 2 });
    const before = singleDataset('box', 0) as StackNode[];
    const after = singleDataset('box', 1) as StackNode[];
    const beforeCompanion = { selection: ['box'], mode: 'select' };
    const afterCompanion = { selection: ['box'], mode: 'transform' };
    const prepared = history.prepareRecord(command(
      'prepared',
      before,
      after,
      beforeCompanion,
      afterCompanion,
    ));

    before[0]!.zIndex = 100;
    after[0]!.zIndex = 200;
    beforeCompanion.selection.push('late');
    afterCompanion.mode = 'late';

    expect(prepared).toMatchObject({ plannedStatus: 'recorded', baseEpoch: 0, baseCursor: 0 });
    expect(history.state()).toMatchObject({ depth: 0, cursor: 0 });
    expect(history.commitPrepared(prepared)).toBe('recorded');
    expect(history.inspect().commands[0]).toMatchObject({
      before: {
        dataset: [{ id: 'box', zIndex: 0 }],
        companion: { selection: ['box'], mode: 'select' },
      },
      after: {
        dataset: [{ id: 'box', zIndex: 1 }],
        companion: { selection: ['box'], mode: 'transform' },
      },
    });
    expect(history.commitPrepared(prepared)).toBe('stale');
  });

  it('retains Engine-owned frozen changed snapshots without cloning them', () => {
    const history = new PatchMapSemanticHistory<
      ReturnType<typeof materializePatchMapDataset>['dataset'],
      CompanionState
    >();
    const before = materializePatchMapDataset([{
      type: 'rect',
      id: 'box',
      size: { width: 10, height: 10 },
      attrs: { zIndex: 0 },
    }]).dataset;
    const after = materializePatchMapDataset([{
      type: 'rect',
      id: 'box',
      size: { width: 10, height: 10 },
      attrs: { zIndex: 1 },
    }]).dataset;
    const beforeCompanion = Object.freeze({
      selection: Object.freeze(['box']) as unknown as string[],
      mode: 'select',
    });
    const afterCompanion = Object.freeze({
      selection: Object.freeze(['box']) as unknown as string[],
      mode: 'transform',
    });
    const prepared = history.prepareOwnedChangedRecord({
      id: 'owned',
      before: { dataset: before, companion: beforeCompanion },
      after: { dataset: after, companion: afterCompanion },
    });

    expect(prepared.plannedStatus).toBe('recorded');
    expect(history.commitPrepared(prepared)).toBe('recorded');
    const recorded = history.inspect().commands[0]!;
    expect(recorded.before.dataset).toBe(before);
    expect(recorded.after.dataset).toBe(after);
    expect(recorded.before.companion).toBe(beforeCompanion);
    expect(recorded.after.companion).toBe(afterCompanion);
    expect(() => history.prepareOwnedChangedRecord({
      id: 'unowned',
      before: { dataset: Object.freeze([...before]) },
      after: { dataset: after },
    })).toThrow('Engine-owned materialized array');
    expect(() => history.prepareOwnedChangedRecord({
      id: 'shallow-companion',
      before: {
        dataset: before,
        companion: Object.freeze({ selection: ['box'], mode: 'select' }),
      },
      after: { dataset: after, companion: afterCompanion },
    })).toThrow('deeply frozen');
  });

  it('fails stale and foreign prepared tokens closed without replacing a newer branch', () => {
    const history = new PatchMapSemanticHistory<StackDataset>({ capacity: 2 });
    const foreign = new PatchMapSemanticHistory<StackDataset>({ capacity: 2 });
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const branch = singleDataset('box', 20);
    history.record(simpleCommand('one', zero, one));
    history.record(simpleCommand('two', one, two));
    history.undo(() => true);

    const preparedBranch = history.prepareRecord(simpleCommand('branch', one, branch));
    const preparedSibling = history.prepareRecord(simpleCommand('sibling', one, zero));
    expect(preparedBranch).toMatchObject({ plannedStatus: 'recorded', baseCursor: 1 });
    expect(foreign.commitPrepared(preparedBranch)).toBe('invalid');
    expect(history.commitPrepared(preparedSibling)).toBe('recorded');
    expect(history.commitPrepared(preparedBranch)).toBe('stale');
    expect(history.inspect().commands.map((entry) => entry.id)).toEqual(['one', 'sibling']);
    expect(history.state()).toMatchObject({ depth: 2, cursor: 2, redoDepth: 0 });
  });

  it('cancels refused surface commits and validates every fallible record value during preflight', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const cancelled = history.prepareRecord(simpleCommand('cancelled', zero, one));

    expect(history.cancelPrepared(cancelled)).toBe(true);
    expect(history.cancelPrepared(cancelled)).toBe(false);
    expect(history.commitPrepared(cancelled)).toBe('cancelled');
    expect(history.state()).toMatchObject({ depth: 0, cursor: 0 });

    const cyclic: StackNode & { self?: unknown } = { id: 'cycle', zIndex: 2 };
    cyclic.self = cyclic;
    expect(() => history.prepareRecord({
      id: 'invalid',
      before: { dataset: zero },
      after: { dataset: [cyclic] },
    })).toThrow('must not contain cycles');
    expect(history.state()).toMatchObject({ depth: 0, cursor: 0 });

    const invalidCommand = null as unknown as PatchMapSemanticHistoryCommandInput<StackDataset>;
    const refused = history.prepareRecord(invalidCommand, 'refused');
    expect(history.commitPrepared(refused)).toBe('refused');
    expect(history.record(invalidCommand, 'no-op')).toBe('no-op');
  });

  it('keeps terminal token status while releasing every retained command branch', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const committed = history.prepareRecord(simpleCommand('committed', zero, one));

    expect(history.commitPrepared(committed)).toBe('recorded');
    expect(history.commitPrepared(committed)).toBe('stale');
    expect(history.cancelPrepared(committed)).toBe(false);
    expect(preparedPlanProbe(history, committed)).toEqual({
      phase: 'committed',
      baseEntries: null,
      nextEntries: null,
    });

    const cancelled = history.prepareRecord(simpleCommand('cancelled', one, two));
    expect(history.cancelPrepared(cancelled)).toBe(true);
    expect(history.cancelPrepared(cancelled)).toBe(false);
    expect(history.commitPrepared(cancelled)).toBe('cancelled');
    expect(preparedPlanProbe(history, cancelled)).toEqual({
      phase: 'cancelled',
      baseEntries: null,
      nextEntries: null,
    });

    const pending = history.prepareRecord(simpleCommand('pending', one, two));
    expect(history.destroy()).toBe(true);
    expect(history.commitPrepared(pending)).toBe('stale');
    expect(history.cancelPrepared(pending)).toBe(false);
    expect(preparedPlanProbe(history, pending)).toEqual({
      phase: 'stale',
      baseEntries: null,
      nextEntries: null,
    });
    expect(pendingPreparedPlanCount(history)).toBe(0);
  });

  it('rejects non-JSON array structure without invoking accessors', () => {
    const history = new PatchMapSemanticHistory<readonly unknown[]>();
    const before = Object.freeze([{ id: 'box', zIndex: 0 }]);
    let accessorReads = 0;
    const accessorDataset: unknown[] = [];
    Object.defineProperty(accessorDataset, 0, {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return { id: 'box', zIndex: 1 };
      },
    });
    expect(() => history.prepareRecord({
      id: 'accessor',
      before: { dataset: before },
      after: { dataset: accessorDataset },
    })).toThrow('$.after.dataset[0] must be an enumerable data property');
    expect(accessorReads).toBe(0);

    const sparse = new Array<unknown>(1);
    expect(() => history.prepareRecord({
      id: 'sparse',
      before: { dataset: before },
      after: { dataset: sparse },
    })).toThrow('$.after.dataset[0] must not be sparse');

    const symbolic = [{ id: 'box', zIndex: 1 }];
    Object.defineProperty(symbolic, Symbol('metadata'), {
      enumerable: true,
      value: 'hidden',
    });
    expect(() => history.prepareRecord({
      id: 'symbolic',
      before: { dataset: before },
      after: { dataset: symbolic },
    })).toThrow('$.after.dataset must not contain symbol keys');

    const extra = [{ id: 'box', zIndex: 1 }];
    Object.defineProperty(extra, 'metadata', {
      enumerable: true,
      value: 'extra',
    });
    expect(() => history.prepareRecord({
      id: 'extra',
      before: { dataset: before },
      after: { dataset: extra },
    })).toThrow('$.after.dataset.metadata must not be an extra array property');
    expect(history.state()).toMatchObject({ depth: 0, cursor: 0 });
  });

  it('rejects structurally invalid owned companions without invoking accessors', () => {
    const before = materializePatchMapDataset([{
      type: 'rect',
      id: 'box',
      size: { width: 10, height: 10 },
    }]).dataset;
    const after = materializePatchMapDataset([{
      type: 'rect',
      id: 'box',
      size: { width: 20, height: 20 },
    }]).dataset;
    const history = new PatchMapSemanticHistory<typeof before, unknown>();
    let accessorReads = 0;
    const accessor = Object.freeze(Object.defineProperty({}, 'hidden', {
      enumerable: false,
      get: () => {
        accessorReads += 1;
        return 'hidden';
      },
    }));
    const sparse = Object.freeze(new Array<unknown>(1));
    const symbolic = Object.freeze(Object.defineProperty({}, Symbol('metadata'), {
      enumerable: true,
      value: 'hidden',
    }));
    const extraArray = ['value'];
    Object.defineProperty(extraArray, 'metadata', {
      enumerable: true,
      value: 'extra',
    });
    Object.freeze(extraArray);

    for (const [id, companion] of [
      ['accessor', accessor],
      ['sparse', sparse],
      ['symbolic', symbolic],
      ['extra-array', extraArray],
      ['non-finite', Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => history.prepareOwnedChangedRecord({
        id,
        before: { dataset: before, companion },
        after: { dataset: after, companion: null },
      })).toThrow('$.before.companion must be Engine-owned and deeply frozen');
    }
    expect(accessorReads).toBe(0);
    expect(history.state()).toMatchObject({ depth: 0, cursor: 0 });
  });

  it('precomputes redo truncation and capacity eviction before commit', () => {
    const history = new PatchMapSemanticHistory<StackDataset>({ capacity: 2 });
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const three = singleDataset('box', 3);
    history.record(simpleCommand('one', zero, one));
    history.record(simpleCommand('two', one, two));
    const atCapacity = history.prepareRecord(simpleCommand('three', two, three));

    expect(history.inspect().commands.map((entry) => entry.id)).toEqual(['one', 'two']);
    expect(history.commitPrepared(atCapacity)).toBe('recorded');
    expect(history.inspect().commands.map((entry) => entry.id)).toEqual(['two', 'three']);

    const afterDestroy = history.prepareRecord(simpleCommand('late', three, zero));
    history.destroy();
    expect(history.commitPrepared(afterDestroy)).toBe('stale');
  });

  it('evicts oldest commands at capacity and supports disabled recording', () => {
    const history = new PatchMapSemanticHistory<StackDataset>({ capacity: 2 });
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const three = singleDataset('box', 3);
    history.record(simpleCommand('one', zero, one));
    history.record(simpleCommand('two', one, two));
    history.record(simpleCommand('three', two, three));

    expect(history.inspect().commands.map((entry) => entry.id)).toEqual(['two', 'three']);
    expect(history.state()).toEqual({
      capacity: 2,
      depth: 2,
      cursor: 2,
      undoDepth: 2,
      redoDepth: 0,
      canUndo: true,
      canRedo: false,
      destroyed: false,
    });
    const restored: number[] = [];
    history.undo((transition) => {
      restored.push(transition.snapshot.dataset[0]!.zIndex);
      return true;
    });
    history.undo((transition) => {
      restored.push(transition.snapshot.dataset[0]!.zIndex);
      return true;
    });
    expect(restored).toEqual([2, 1]);
    expect(history.undo(() => true)).toBeNull();

    const disabled = new PatchMapSemanticHistory<StackDataset>({ capacity: 0 });
    expect(disabled.record(simpleCommand('ignored', zero, one))).toBe('disabled');
    expect(disabled.state()).toMatchObject({ capacity: 0, depth: 0, canUndo: false });
    expect(() => new PatchMapSemanticHistory({ capacity: -1 })).toThrow(RangeError);
  });

  it('coalesces consecutive records with one action ID and honors explicit barriers', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const zero = singleDataset('box', 0);
    const one = singleDataset('box', 1);
    const two = singleDataset('box', 2);
    const three = singleDataset('box', 3);

    expect(history.record(simpleCommand('drag-1', zero, one))).toBe('recorded');
    expect(history.record(simpleCommand('drag-1', one, two))).toBe('recorded');
    expect(history.inspect().commands).toMatchObject([
      {
        id: 'drag-1',
        recordCount: 2,
        records: [
          {
            before: { dataset: [{ id: 'box', zIndex: 0 }] },
            after: { dataset: [{ id: 'box', zIndex: 1 }] },
          },
          {
            before: { dataset: [{ id: 'box', zIndex: 1 }] },
            after: { dataset: [{ id: 'box', zIndex: 2 }] },
          },
        ],
        before: { dataset: [{ id: 'box', zIndex: 0 }] },
        after: { dataset: [{ id: 'box', zIndex: 2 }] },
      },
    ]);
    expect(history.state()).toMatchObject({ depth: 1, cursor: 1 });

    expect(history.closeActionGroup()).toBe(true);
    expect(history.closeActionGroup()).toBe(false);
    expect(history.record(simpleCommand('drag-1', two, three))).toBe('recorded');
    expect(history.inspect().commands.map(({ id, recordCount }) => ({
      id,
      recordCount,
    }))).toEqual([
      { id: 'drag-1', recordCount: 2 },
      { id: 'drag-1', recordCount: 1 },
    ]);

    expect(history.undo((transition) => (
      transition.snapshot.dataset[0]?.zIndex === 2
    ))).not.toBeNull();
    expect(history.undo((transition) => (
      transition.snapshot.dataset[0]?.zIndex === 0
    ))).not.toBeNull();
  });

  it('reconfigures retention atomically with exact oldest-action eviction', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    for (let index = 0; index < 52; index += 1) {
      history.record(simpleCommand(
        `a-${String(index).padStart(2, '0')}`,
        singleDataset('box', index),
        singleDataset('box', index + 1),
      ));
    }

    expect(history.inspect().commands.map(({ id }) => id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `a-${String(index + 2).padStart(2, '0')}`),
    );
    const decrease = history.setCapacity(2);
    expect(decrease).toMatchObject({
      changed: true,
      previousCapacity: 50,
      capacity: 2,
      retainedActionIds: ['a-50', 'a-51'],
      state: { depth: 2, cursor: 2 },
    });
    expect(decrease.evictedActionIds).toHaveLength(48);
    expect(decrease.evictedActionIds.at(0)).toBe('a-02');
    expect(decrease.evictedActionIds.at(-1)).toBe('a-49');

    expect(history.setCapacity(51)).toMatchObject({
      changed: true,
      previousCapacity: 2,
      capacity: 51,
      evictedActionIds: [],
      retainedActionIds: ['a-50', 'a-51'],
      state: { depth: 2, cursor: 2 },
    });
    expect(history.setCapacity(0)).toMatchObject({
      changed: true,
      previousCapacity: 51,
      capacity: 0,
      evictedActionIds: ['a-50', 'a-51'],
      retainedActionIds: [],
      state: { depth: 0, cursor: 0 },
    });
    const disabledState = history.inspect();
    expect(() => history.setCapacity(-1)).toThrow(RangeError);
    expect(history.inspect()).toEqual(disabledState);
  });

  it('clears all retained snapshots on destroy and rejects later mutation', () => {
    const history = new PatchMapSemanticHistory<StackDataset>();
    const before = singleDataset('box', 0);
    const after = singleDataset('box', 1);
    history.record(simpleCommand('one', before, after));
    const retained = history.inspect();

    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(retained.commands)).toBe(true);
    expect(Object.isFrozen(retained.commands[0]?.before.dataset)).toBe(true);
    expect(history.destroy()).toBe(true);
    expect(history.destroy()).toBe(false);
    expect(history.state()).toEqual({
      capacity: 50,
      depth: 0,
      cursor: 0,
      undoDepth: 0,
      redoDepth: 0,
      canUndo: false,
      canRedo: false,
      destroyed: true,
    });
    expect(history.inspect().commands).toEqual([]);
    expect(() => history.record(simpleCommand('late', before, after))).toThrow('is destroyed');
    expect(() => history.undo(() => true)).toThrow('is destroyed');
  });
});

function renderOrder(dataset: StackDataset): readonly string[] {
  return planPatchMapPaintOrder(
    dataset.map((entry, authoredOrder) => ({
      publicId: entry.id,
      entityId: `dense:${entry.id}`,
      kind: 'rect',
      lane: 'ordinary-geometry',
      zIndex: entry.zIndex,
      authoredOrder,
      pass: 0,
      visible: true,
      compatibilityKey: 'normal',
    })),
    { overlays: { selection: true, transformer: true } },
  ).renderOrder;
}

function stackingDataset(): StackNode[] {
  return [
    { id: 'low', zIndex: -1 },
    { id: 'first', zIndex: 4 },
    { id: 'second', zIndex: 4 },
    { id: 'high', zIndex: 10 },
  ];
}

function singleDataset(id: string, zIndex: number): StackDataset {
  return [{ id, zIndex }];
}

function simpleCommand(
  id: string,
  before: StackDataset,
  after: StackDataset,
): PatchMapSemanticHistoryCommandInput<StackDataset> {
  return { id, before: { dataset: before }, after: { dataset: after } };
}

function command(
  id: string,
  before: StackDataset,
  after: StackDataset,
  beforeCompanion: CompanionState,
  afterCompanion: CompanionState,
): PatchMapSemanticHistoryCommandInput<StackDataset, CompanionState> {
  return {
    id,
    before: { dataset: before, companion: beforeCompanion },
    after: { dataset: after, companion: afterCompanion },
  };
}

function preparedPlanProbe(
  history: PatchMapSemanticHistory<StackDataset>,
  token: object,
): Readonly<{
  readonly phase: string;
  readonly baseEntries: unknown;
  readonly nextEntries: unknown;
}> {
  const records = (history as unknown as Readonly<{
    preparedRecords: WeakMap<object, Readonly<{
      phase: string;
      baseEntries: unknown;
      nextEntries: unknown;
    }>>;
  }>).preparedRecords;
  const plan = records.get(token);
  if (plan === undefined) throw new Error('prepared plan is missing');
  return {
    phase: plan.phase,
    baseEntries: plan.baseEntries,
    nextEntries: plan.nextEntries,
  };
}

function pendingPreparedPlanCount(
  history: PatchMapSemanticHistory<StackDataset>,
): number {
  return (history as unknown as Readonly<{
    pendingPreparedRecords: ReadonlySet<unknown>;
  }>).pendingPreparedRecords.size;
}
