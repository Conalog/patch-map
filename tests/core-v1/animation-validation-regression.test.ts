import { describe, expect, it, vi } from 'vitest';

import type { AnimatableProperty, CoreOperation, SceneDocument } from '../../src/core-v1/contracts';
import { createCoreScene } from '../../src/core-v1/scene';
import { DenseStore } from '../../src/core-v1/store';
import { prepareTransaction } from '../../src/core-v1/transaction';
import { normalizeDocument } from '../../src/core-v1/validation';

const DOCUMENT: SceneDocument = {
  version: 1,
  entities: [
    {
      kind: 'rect',
      id: 'rect',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fill: 0x336699ff,
    },
    {
      kind: 'bar',
      id: 'bar',
      x: 30,
      y: 0,
      width: 100,
      height: 10,
      value: 5,
      min: 0,
      max: 10,
      fill: 0x22aa66ff,
    },
  ],
};

describe('Core v1 animation target validation', () => {
  it.each<{
    property: AnimatableProperty;
    target: string;
    to: number;
    error: string;
  }>([
    { property: 'x', target: 'rect', to: Number.NaN, error: 'expected a finite number' },
    { property: 'y', target: 'rect', to: Number.POSITIVE_INFINITY, error: 'expected a finite number' },
    { property: 'rotation', target: 'rect', to: Number.NEGATIVE_INFINITY, error: 'expected a finite number' },
    { property: 'width', target: 'rect', to: -1, error: 'expected a non-negative number' },
    { property: 'height', target: 'rect', to: -0.01, error: 'expected a non-negative number' },
    { property: 'opacity', target: 'rect', to: -0.01, error: 'expected a number between 0 and 1' },
    { property: 'opacity', target: 'rect', to: 1.01, error: 'expected a number between 0 and 1' },
  ])('rejects $property target $to without changing scene state', ({ property, target, to, error }) => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    scene.drainEvents();
    const before = scene.snapshot();
    const revision = scene.revision;

    expect(() =>
      scene.commit({
        operations: [{ type: 'animate', target, property, to, durationMs: 100 }],
      }),
    ).toThrow(error);

    expect(scene.snapshot()).toEqual(before);
    expect(scene.revision).toBe(revision);
    expect(scene.activeAnimations).toBe(0);
    expect(scene.drainEvents()).toEqual([]);
  });

  it('accepts inclusive constrained boundaries and finite bar values outside the display range', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);

    expect(() =>
      scene.commit({
        operations: [
          { type: 'animate', target: 'rect', property: 'width', to: 0, durationMs: 100 },
          { type: 'animate', target: 'rect', property: 'height', to: 0, durationMs: 100 },
          { type: 'animate', target: 'rect', property: 'opacity', to: 0, durationMs: 100 },
          { type: 'animate', target: 'bar', property: 'value', to: -5, durationMs: 100 },
          { type: 'animate', target: 'bar', property: 'value', to: 15, durationMs: 100 },
        ],
      }),
    ).not.toThrow();
    expect(scene.activeAnimations).toBe(4);
  });

  it('does not replace an active animation when a later commit fails validation', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    scene.commit({
      operations: [{ type: 'animate', target: 'rect', property: 'x', to: 100, durationMs: 100 }],
    });
    scene.drainEvents();
    const revision = scene.revision;

    expect(() =>
      scene.commit({
        operations: [
          { type: 'patch', target: 'rect', changes: { y: 90 } },
          { type: 'animate', target: 'rect', property: 'width', to: -1, durationMs: 0 },
        ],
      }),
    ).toThrow('$.operations[1].to: expected a non-negative number');

    expect(scene.revision).toBe(revision);
    expect(scene.get('rect')?.bounds).toMatchObject({ x: 0, y: 0, width: 20 });
    expect(scene.activeAnimations).toBe(1);
    expect(scene.drainEvents()).toEqual([]);
    scene.advance(100);
    expect(scene.get('rect')?.bounds.x).toBe(100);
  });

  it('rejects unknown runtime properties before scheduling', () => {
    const scene = createCoreScene();
    scene.load(DOCUMENT);
    const operation = {
      type: 'animate',
      target: 'rect',
      property: 'scale',
      to: 2,
      durationMs: 100,
    } as unknown as CoreOperation;

    expect(() => scene.commit({ operations: [operation] })).toThrow(
      '$.operations[0].property: expected x, y, width, height, rotation, opacity, or value',
    );
    expect(scene.activeAnimations).toBe(0);
  });

  it('rejects properties that do not apply to the target kind', () => {
    const scene = createCoreScene();
    scene.load({
      version: 1,
      entities: [
        ...DOCUMENT.entities,
        { kind: 'relation', id: 'edge', from: 'rect', to: 'bar', color: 0xffffffff },
      ],
    });

    expect(() =>
      scene.commit({
        operations: [{ type: 'animate', target: 'rect', property: 'value', to: 1, durationMs: 100 }],
      }),
    ).toThrow('$.operations[0].property: value animation requires a bar entity');
    expect(() =>
      scene.commit({
        operations: [{ type: 'animate', target: 'edge', property: 'x', to: 1, durationMs: 100 }],
      }),
    ).toThrow('$.operations[0].property: relations do not expose animatable geometry');
    expect(scene.activeAnimations).toBe(0);
  });
});

describe('Core v1 transaction canonicalization cache', () => {
  it('normalizes each original entity at most once per transaction', () => {
    const store = DenseStore.fromCanonical(normalizeDocument(DOCUMENT));
    const canonicalAt = vi.spyOn(store, 'canonicalAt');

    const prepared = prepareTransaction(
      store,
      {
        operations: [
          { type: 'patch', target: 'rect', changes: { x: 10 } },
          { type: 'patch', target: 'rect', changes: { y: 20 } },
          { type: 'animate', target: 'rect', property: 'opacity', to: 0.5, durationMs: 100 },
        ],
      },
      new Set(),
    );

    expect(canonicalAt).toHaveBeenCalledTimes(1);
    expect(prepared.before.get('rect')).toMatchObject({ x: 0, y: 0 });
    expect(prepared.after.get('rect')).toMatchObject({ x: 10, y: 20 });
    expect(prepared.animations).toHaveLength(1);
    store.destroy();
  });
});
