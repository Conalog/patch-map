import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_PRESENTATION_DEFAULT_DURATION_MS,
  PatchMapPresentationController,
  PatchMapPresentationError,
  type PatchMapPresentationFrame,
  type PatchMapPresentationRetargetInput,
} from '../../src/patch-map/presentation';

describe('PatchMapPresentationController', () => {
  it('uses one manual flat controller without Pixi ticker or entity event ownership', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../src/patch-map/presentation.ts', import.meta.url)),
      'utf8',
    );

    expect(PATCH_MAP_PRESENTATION_DEFAULT_DURATION_MS).toBe(200);
    expect(source).not.toMatch(/from\s+['"]pixi(?:\.js)?['"]/u);
    expect(source).not.toContain('requestAnimationFrame');
    expect(source).not.toContain('addEventListener');
    expect(source).not.toContain('NON_MONOTONIC_TIME');
  });

  it('samples 10 to 40 with the default easeOutCubic at exact 0/100/200ms', () => {
    const controller = new PatchMapPresentationController({ lifecycleGeneration: 7 });
    const scheduled = controller.retarget(retarget('bar', 4, 1, 10, 40, 0));

    expect(scheduled).toMatchObject({
      lifecycleGeneration: 7,
      scheduled: true,
      replaced: false,
      startValue: 10,
      destinationValue: 40,
      durationMs: 200,
      activeCount: 1,
      published: false,
    });
    expect(valueAt(controller, controller.advance(0), 'bar')).toBe(10);
    expect(valueAt(controller, controller.advance(100), 'bar')).toBe(36.25);
    const terminal = controller.advance(200);
    expect(valueAt(controller, terminal, 'bar')).toBe(40);
    expect(terminal).toMatchObject({
      settledEntityIds: ['bar'],
      settledCount: 1,
      totalSettlementCount: 1,
      activeCount: 0,
    });
    expect(controller.probe('bar')).toBeNull();
  });

  it('retargets from the exact current visible sample without settling the replaced curve', () => {
    const controller = new PatchMapPresentationController();
    controller.retarget(retarget('bar', 2, 1, 10, 40, 0));

    const replaced = controller.retarget(retarget('bar', 2, 1, 10, 20, 100));
    expect(replaced).toMatchObject({
      replaced: true,
      scheduled: true,
      startValue: 36.25,
      settledCount: 0,
      totalSettlementCount: 0,
    });
    expect(valueAt(controller, replaced, 'bar')).toBe(36.25);
    expect(valueAt(controller, controller.advance(200), 'bar')).toBe(22.03125);
    const terminal = controller.advance(300);
    expect(valueAt(controller, terminal, 'bar')).toBe(20);
    expect(terminal.totalSettlementCount).toBe(1);
    expect(controller.snapshot()).toMatchObject({
      activeCount: 0,
      indexedCount: 0,
      totalSupersessionCount: 1,
    });
  });

  it('produces identical common-time samples for dense and sparse frame cadence', () => {
    const dense = sampledSchedule([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    const sparse = sampledSchedule([0, 100, 200]);

    expect([dense.get(0), dense.get(100), dense.get(200)])
      .toEqual([sparse.get(0), sparse.get(100), sparse.get(200)]);
    expect(sparse).toEqual(new Map([
      [0, 10],
      [100, 36.25],
      [200, 40],
    ]));
  });

  it('rejects backward time atomically with the closed INVALID_VALUE diagnostic', () => {
    const controller = new PatchMapPresentationController({ lifecycleGeneration: 9 });
    controller.retarget(retarget('bar', 1, 3, 10, 40, 0));
    controller.advance(100);
    const beforeSnapshot = controller.snapshot();
    const beforeProbe = controller.probe('bar');

    let failure: unknown;
    try {
      controller.advance(99);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PatchMapPresentationError);
    expect((failure as PatchMapPresentationError).diagnostic).toEqual({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'advance',
      lifecycleGeneration: 9,
      presentationRevision: 1,
      recoverable: true,
      retryable: true,
      field: 'timeMs',
    });
    expect(controller.snapshot()).toEqual(beforeSnapshot);
    expect(controller.probe('bar')).toEqual(beforeProbe);
  });

  it('settles once, removes terminal rows, and never emits a ghost update', () => {
    const controller = new PatchMapPresentationController();
    controller.retarget(retarget('bar', 6, 1, 10, 40, 0));
    expect(controller.advance(199)).toMatchObject({ settledCount: 0, activeCount: 1 });
    const terminal = controller.advance(200);
    const after = controller.advance(500);

    expect(terminal).toMatchObject({
      dirtyEntityIds: ['bar'],
      dirtyRanges: [{ start: 6, end: 7 }],
      settledEntityIds: ['bar'],
      totalSettlementCount: 1,
    });
    expect(after).toMatchObject({
      changedCount: 0,
      settledCount: 0,
      totalSettlementCount: 1,
      activeCount: 0,
      published: false,
    });
    expect(controller.snapshot()).toMatchObject({ activeCount: 0, indexedCount: 0 });
  });

  it('settles every active row at its destination when page time is suspended', () => {
    const controller = new PatchMapPresentationController();
    controller.retarget(retarget('bar-a', 4, 1, 10, 40, 0));
    controller.retarget(retarget('bar-b', 8, 2, 5, 25, 0));
    controller.advance(40);

    const settled = controller.settle(40);

    expect(settled).toMatchObject({
      activeCount: 0,
      changedCount: 2,
      settledCount: 2,
      settledEntityIds: ['bar-a', 'bar-b'],
      dirtyEntityIds: ['bar-a', 'bar-b'],
      dirtyRanges: [{ start: 4, end: 5 }, { start: 8, end: 9 }],
    });
    expect(settled.updates).toEqual([
      { entityId: 'bar-a', slot: 4, generation: 1, value: 40 },
      { entityId: 'bar-b', slot: 8, generation: 2, value: 25 },
    ]);
    expect(controller.snapshot()).toMatchObject({
      clockMs: 40,
      activeCount: 0,
      indexedCount: 0,
      totalSettlementCount: 2,
    });
  });

  it('cancels on hide/remove/replacement/destroy and cannot publish after destroy', () => {
    const controller = new PatchMapPresentationController();
    controller.retarget(retarget('hidden', 1, 1, 0, 10, 0));
    controller.retarget(retarget('removed', 2, 1, 0, 10, 0));
    controller.retarget(retarget('replaced', 3, 1, 0, 10, 0));

    expect(controller.cancel({
      entityId: 'hidden', generation: 1, timeMs: 20, reason: 'hide',
    })).toMatchObject({ cancelled: true, published: false });
    expect(controller.cancel({
      entityId: 'removed', generation: 1, timeMs: 20, reason: 'remove',
    })).toMatchObject({ cancelled: true, published: false });
    const replacement = controller.retarget(retarget('replaced', 3, 2, 4, 12, 20));
    expect(replacement).toMatchObject({ replaced: true, startValue: 4, settledCount: 0 });
    expect(controller.probe('replaced')).toMatchObject({ generation: 2, currentValue: 4 });

    const publishedBeforeDestroy = controller.snapshot().publishedFrameCount;
    expect(controller.destroy()).toMatchObject({
      destroyed: true,
      cancelledCount: 1,
      cancelledEntityIds: ['replaced'],
      published: false,
    });
    expect(controller.snapshot()).toMatchObject({
      destroyed: true,
      activeCount: 0,
      indexedCount: 0,
      capacity: 0,
      totalCancellationCount: 4,
      publishedFrameCount: publishedBeforeDestroy,
    });
    expect(() => controller.advance(40)).toThrowError(PatchMapPresentationError);
    expect(() => controller.retarget(retarget('late', 0, 1, 0, 1, 40)))
      .toThrowError(PatchMapPresentationError);
    expect(controller.snapshot().publishedFrameCount).toBe(publishedBeforeDestroy);
  });

  it('publishes zero-duration and disabled transitions immediately without active rows', () => {
    const controller = new PatchMapPresentationController();
    const zero = controller.retarget({
      ...retarget('zero', 8, 1, 10, 40, 0),
      durationMs: 0,
    });
    const disabled = controller.retarget({
      ...retarget('disabled', 9, 1, 5, 7, 0),
      enabled: false,
    });

    expect(zero).toMatchObject({
      scheduled: false,
      published: true,
      activeCount: 0,
      updates: [{ entityId: 'zero', slot: 8, generation: 1, value: 40 }],
      settledEntityIds: ['zero'],
    });
    expect(disabled).toMatchObject({
      scheduled: false,
      published: true,
      activeCount: 0,
      updates: [{ entityId: 'disabled', slot: 9, generation: 1, value: 7 }],
      settledEntityIds: ['disabled'],
      totalSettlementCount: 2,
    });
    expect(controller.snapshot()).toMatchObject({ activeCount: 0, indexedCount: 0 });
  });

  it('returns stable dirty IDs and coalesced dense ranges in slot order', () => {
    const controller = new PatchMapPresentationController();
    controller.retarget(retarget('slot-five', 5, 1, 0, 10, 0));
    controller.retarget(retarget('slot-three', 3, 1, 0, 10, 0));
    controller.retarget(retarget('slot-four', 4, 1, 0, 10, 0));

    const frame = controller.advance(100);
    expect(frame.dirtyEntityIds).toEqual(['slot-three', 'slot-four', 'slot-five']);
    expect(frame.dirtyRanges).toEqual([{ start: 3, end: 6 }]);
    expect(frame.updates.map(({ slot }) => slot)).toEqual([3, 4, 5]);
    expect(Object.isFrozen(frame.updates)).toBe(true);
    expect(Object.isFrozen(frame.dirtyRanges)).toBe(true);
  });

  it('does not mutate inputs and repeats deterministically', () => {
    const input = Object.freeze(retarget('bar', 12, 4, 10, 40, 0));
    const before = structuredClone(input);
    const first = new PatchMapPresentationController({ lifecycleGeneration: 3 });
    const second = new PatchMapPresentationController({ lifecycleGeneration: 3 });

    const firstResults = [
      first.retarget(input),
      first.advance(75),
      first.retarget(Object.freeze(retarget('bar', 12, 4, 10, 20, 75))),
      first.advance(275),
    ];
    const secondResults = [
      second.retarget(input),
      second.advance(75),
      second.retarget(Object.freeze(retarget('bar', 12, 4, 10, 20, 75))),
      second.advance(275),
    ];

    expect(input).toEqual(before);
    expect(firstResults).toEqual(secondResults);
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(Object.isFrozen(firstResults[3])).toBe(true);
  });

  it('keeps the internal reconcile kernel equivalent without public materialization', () => {
    const publicController = new PatchMapPresentationController({
      lifecycleGeneration: 5,
    });
    const internalController = new PatchMapPresentationController({
      lifecycleGeneration: 5,
    });

    const scheduled = publicController.retarget(
      retarget('bar', 12, 4, 10, 40, 0),
    );
    const internalScheduled = internalController.retargetForReconcile(
      'bar',
      12,
      4,
      10,
      40,
      0,
    );
    expect(internalScheduled).toMatchObject({
      found: true,
      scheduled: scheduled.scheduled,
      replaced: scheduled.replaced,
      startValue: scheduled.startValue,
      destinationValue: scheduled.destinationValue,
      durationMs: scheduled.durationMs,
      changed: scheduled.published,
      published: scheduled.published,
    });
    expect(internalController.snapshot()).toEqual(publicController.snapshot());
    expect(internalController.probe('bar')).toEqual(publicController.probe('bar'));

    const replaced = publicController.retarget(
      retarget('bar', 12, 4, 10, 20, 75),
    );
    const internalReplaced = internalController.retargetForReconcile(
      'bar',
      12,
      4,
      10,
      20,
      75,
    );
    expect(internalReplaced).toMatchObject({
      found: true,
      scheduled: replaced.scheduled,
      replaced: replaced.replaced,
      startValue: replaced.startValue,
      destinationValue: replaced.destinationValue,
      changedValue: replaced.updates[0]?.value,
      settled: false,
      published: replaced.published,
    });
    expect(Object.isFrozen(replaced)).toBe(true);
    expect(Object.isFrozen(replaced.updates)).toBe(true);
    expect(Object.isFrozen(replaced.updates[0])).toBe(true);
    expect(Object.isFrozen(replaced.dirtyEntityIds)).toBe(true);
    expect(Object.isFrozen(replaced.dirtyRanges)).toBe(true);
    expect(Object.isFrozen(replaced.dirtyRanges[0])).toBe(true);
    expect(Object.isFrozen(replaced.settledEntityIds)).toBe(true);
    expect(internalController.snapshot()).toEqual(publicController.snapshot());
    expect(internalController.probe('bar')).toEqual(publicController.probe('bar'));

    const disabled = publicController.retarget({
      ...retarget('bar', 12, 4, 10, 7, 100),
      enabled: false,
    });
    const internalDisabled = internalController.retargetForReconcile(
      'bar',
      12,
      4,
      10,
      7,
      100,
      undefined,
      false,
    );
    expect(internalDisabled).toMatchObject({
      found: false,
      scheduled: disabled.scheduled,
      replaced: disabled.replaced,
      startValue: disabled.startValue,
      destinationValue: disabled.destinationValue,
      changedValue: disabled.updates[0]?.value,
      settled: true,
      published: disabled.published,
    });
    expect(internalController.snapshot()).toEqual(publicController.snapshot());
    expect(internalController.probe('bar')).toEqual(publicController.probe('bar'));

    const equal = publicController.retarget(
      retarget('equal', 2, 1, 7, 7, 100),
    );
    const internalEqual = internalController.retargetForReconcile(
      'equal',
      2,
      1,
      7,
      7,
      100,
    );
    expect(internalEqual).toMatchObject({
      scheduled: false,
      changed: false,
      settled: false,
      published: equal.published,
    });
    const zeroDuration = publicController.retarget({
      ...retarget('zero', 3, 1, 2, 9, 100),
      durationMs: 0,
    });
    const internalZeroDuration = internalController.retargetForReconcile(
      'zero',
      3,
      1,
      2,
      9,
      100,
      0,
    );
    expect(internalZeroDuration).toMatchObject({
      scheduled: false,
      changed: true,
      changedValue: zeroDuration.updates[0]?.value,
      settled: true,
      published: zeroDuration.published,
    });
    expect(internalController.snapshot()).toEqual(publicController.snapshot());

    const scratch = internalController.readActiveForReconcile('missing');
    expect(internalController.readActiveForReconcile('bar')).toBe(scratch);
    internalController.retargetForReconcile('stable', 5, 1, 1, 4, 100);
    const before = internalController.snapshot();
    const beforeProbe = internalController.probe('stable');
    expect(() => internalController.retargetForReconcile(
      'invalid',
      0,
      1,
      0,
      Number.NaN,
      100,
    )).toThrow(TypeError);
    expect(internalController.snapshot()).toEqual(before);
    expect(internalController.probe('stable')).toEqual(beforeProbe);
  });

  it('preserves public validation order and canonicalizes negative zero time', () => {
    const controller = new PatchMapPresentationController();
    const reads: string[] = [];
    const invalid = {
      get entityId() {
        reads.push('entityId');
        return '';
      },
      get slot() {
        reads.push('slot');
        return 0;
      },
    } as PatchMapPresentationRetargetInput;

    expect(() => controller.retarget(invalid)).toThrow(TypeError);
    expect(reads).toEqual(['entityId']);

    const result = controller.retarget(retarget('zero-time', 1, 1, 5, 10, -0));
    expect(Object.is(result.timeMs, -0)).toBe(false);
    expect(Object.is(controller.snapshot().clockMs, -0)).toBe(false);
  });

  it('matches internal replacement, cancel no-op, and destroy cleanup semantics', () => {
    const publicController = new PatchMapPresentationController();
    const internalController = new PatchMapPresentationController();
    publicController.retarget(retarget('bar', 3, 1, 4, 12, 0));
    internalController.retargetForReconcile('bar', 3, 1, 4, 12, 0);

    const publicReplacement = publicController.retarget(
      retarget('bar', 7, 2, 6, 18, 20),
    );
    const internalReplacement = internalController.retargetForReconcile(
      'bar',
      7,
      2,
      6,
      18,
      20,
    );
    expect(internalReplacement).toMatchObject({
      scheduled: publicReplacement.scheduled,
      replaced: true,
      startValue: publicReplacement.startValue,
      published: publicReplacement.published,
    });
    expect(internalController.snapshot()).toEqual(publicController.snapshot());

    expect(publicController.cancel({
      entityId: 'bar',
      generation: 1,
      timeMs: 20,
      reason: 'replacement',
    }).cancelled).toBe(false);
    expect(internalController.cancelForReconcile(
      'bar',
      1,
      20,
      'replacement',
    )).toBe(false);
    expect(internalController.snapshot()).toEqual(publicController.snapshot());

    expect(publicController.cancel({
      entityId: 'bar',
      generation: 2,
      timeMs: 20,
      reason: 'replacement',
    }).cancelled).toBe(true);
    expect(internalController.cancelForReconcile(
      'bar',
      2,
      20,
      'replacement',
    )).toBe(true);
    expect(internalController.snapshot()).toEqual(publicController.snapshot());

    publicController.retarget(retarget('secret', 9, 3, 1, 5, 20));
    internalController.retargetForReconcile('secret', 9, 3, 1, 5, 20);
    const scratch = internalController.readActiveForReconcile('bar');
    expect(scratch).toMatchObject({ found: false, entityId: 'bar' });
    internalController.readActiveForReconcile('secret');
    expect(scratch).toMatchObject({ found: true, entityId: 'secret', generation: 3 });
    publicController.destroy();
    internalController.destroy();
    expect(scratch).toMatchObject({
      found: false,
      entityId: '',
      slot: 0,
      generation: 0,
      currentValue: 0,
    });
    expect(internalController.probe('secret')).toBeNull();
    expect(scratch.entityId).toBe('');
    expect(internalController.snapshot()).toEqual(publicController.snapshot());
  });

  it('publishes equivalent animation frames through reusable columnar storage', () => {
    const materialized = new PatchMapPresentationController({ lifecycleGeneration: 5 });
    const columnar = new PatchMapPresentationController({ lifecycleGeneration: 5 });
    for (const input of [
      retarget('slot-five', 5, 1, 0, 10, 0),
      retarget('slot-three', 3, 2, 5, 20, 0),
      retarget('slot-four', 4, 3, 10, 40, 0),
    ]) {
      materialized.retarget(input);
      columnar.retarget(input);
    }

    const expected = materialized.advance(100);
    const actual = columnar.advanceForReconcile(100);
    const rows = Array.from({ length: actual.changedCount }, (_, index) => ({
      entityId: actual.entityIds[index],
      slot: actual.slots[index],
      generation: actual.generations[index],
      value: actual.values[index],
    })).sort((left, right) => (left.slot ?? 0) - (right.slot ?? 0));

    expect(actual).toMatchObject({
      timeMs: expected.timeMs,
      activeCount: expected.activeCount,
      changedCount: expected.changedCount,
      settledCount: expected.settledCount,
      totalSettlementCount: expected.totalSettlementCount,
      published: expected.published,
    });
    expect(rows).toEqual(expected.updates);
    expect(columnar.snapshot()).toEqual(materialized.snapshot());

    const entityIds = actual.entityIds;
    const slots = actual.slots;
    const terminal = columnar.advanceForReconcile(200);
    const expectedTerminal = materialized.advance(200);
    expect(terminal).toBe(actual);
    expect(terminal.entityIds).toBe(entityIds);
    expect(terminal.slots).toBe(slots);
    expect(terminal).toMatchObject({
      activeCount: expectedTerminal.activeCount,
      changedCount: expectedTerminal.changedCount,
      settledCount: expectedTerminal.settledCount,
      totalSettlementCount: expectedTerminal.totalSettlementCount,
      published: expectedTerminal.published,
    });
    expect(columnar.snapshot()).toEqual(materialized.snapshot());
  });
});

function retarget(
  entityId: string,
  slot: number,
  generation: number,
  currentVisibleValue: number,
  destinationValue: number,
  timeMs: number,
): PatchMapPresentationRetargetInput {
  return { entityId, slot, generation, currentVisibleValue, destinationValue, timeMs };
}

function sampledSchedule(times: readonly number[]): Map<number, number> {
  const controller = new PatchMapPresentationController();
  controller.retarget(retarget('bar', 0, 1, 10, 40, 0));
  const samples = new Map<number, number>();
  for (const timeMs of times) {
    const frame = controller.advance(timeMs);
    samples.set(timeMs, valueAt(controller, frame, 'bar'));
  }
  return samples;
}

function valueAt(
  controller: PatchMapPresentationController,
  frame: PatchMapPresentationFrame,
  entityId: string,
): number {
  const update = frame.updates.find((entry) => entry.entityId === entityId);
  if (update !== undefined) return update.value;
  const probe = controller.probe(entityId);
  if (probe !== null) return probe.currentValue;
  throw new Error(`Missing presentation value for ${entityId}`);
}
