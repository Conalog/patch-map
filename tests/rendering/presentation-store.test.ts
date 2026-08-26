import { describe, expect, it } from 'vitest';

import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/dense/renderer-types';
import {
  PatchMapPresentationStoreView,
  type PatchMapRendererEntityPresentationOverride,
} from '../../src/rendering/contracts/presentation-store';
import type { PatchMapResolvedPresentationPolicy } from '../../src/presentation/policy';

describe('PatchMap renderer presentation store', () => {
  it('applies highlight emphasis and hidden-layer visibility without mutating dense input', () => {
    const base = store();
    const beforeFlags = Array.from(base.flags);
    const beforeOpacity = Array.from(base.opacity);
    const view = new PatchMapPresentationStoreView(base, policy({
      highlightedEntityIds: ['item-a'],
      hiddenEntityIds: ['links:0'],
      fillOverrides: [{ id: 'item-a', packedColor: 0x00aa66ff }],
    }));

    expect([...view.flags]).toEqual([
      RenderFlags.Visible,
      RenderFlags.Visible,
      0,
      0,
    ]);
    expect(view.opacity[0]).toBe(1);
    expect(view.opacity[1]).toBeCloseTo(0.2, 6);
    expect(view.opacity[2]).toBeCloseTo(0.2, 6);
    expect(view.opacity[3]).toBe(0);
    expect(view.entityProbe('item-a')).toEqual({
      emphasis: 1,
      visible: true,
      renderObjectCount: 1,
      packedFill: 0x00aa66ff,
    });
    expect(view.entityProbe('text-c')).toEqual({
      emphasis: 0.2,
      visible: true,
      renderObjectCount: 1,
      packedFill: 0,
    });
    expect(view.entityProbe('links:0')).toEqual({
      emphasis: 0.2,
      visible: false,
      renderObjectCount: 0,
      packedFill: 0,
    });
    expect(view.fill[0]).toBe(0x00aa66ff);
    expect(base.fill[0]).toBe(0);
    expect(Array.from(base.flags)).toEqual(beforeFlags);
    expect(Array.from(base.opacity)).toEqual(beforeOpacity);
  });

  it('updates only declared dirty ranges while retaining one renderer view identity', () => {
    const base = store();
    const view = new PatchMapPresentationStoreView(base, policy({
      highlightedEntityIds: ['item-a'],
    }));
    (base.opacity as Float32Array)[1] = 0.5;
    (base.opacity as Float32Array)[2] = 0.25;

    view.synchronize(base, policy({
      revision: 2,
      highlightedEntityIds: ['item-a'],
    }), [{ start: 1, end: 2 }]);

    expect(view.opacity[1]).toBeCloseTo(0.1, 6);
    expect(view.opacity[2]).toBeCloseTo(0.2, 6);
    expect(view.revision).toBe(base.revision);
    expect(view.renderOrder()).toBe(base.renderOrder());
  });

  it('treats an empty highlight set as intentional global de-emphasis', () => {
    const view = new PatchMapPresentationStoreView(store(), policy({
      highlightedEntityIds: [],
      deEmphasisAlpha: 0.35,
    }));

    expect([...view.opacity].slice(0, 3)).toEqual([
      expect.closeTo(0.35, 6),
      expect.closeTo(0.35, 6),
      expect.closeTo(0.35, 6),
    ]);
  });

  it('multiplies keyed alpha after authored, live override, and existing policy alpha', () => {
    const base = store();
    (base.opacity as Float32Array)[0] = 0.8;
    (base.opacity as Float32Array)[1] = 0.5;
    const multipliers = new Float32Array([0.5, 0, 1, 1]);
    const view = new PatchMapPresentationStoreView(
      base,
      policy({ highlightedEntityIds: ['item-a'] }),
      new Map([['item-a', Object.freeze({ opacity: 0.6 })]]),
      multipliers,
    );

    expect(view.opacity[0]).toBeCloseTo(0.3, 6);
    expect(view.opacity[1]).toBe(0);
    expect(view.entityProbe('item-a')).toMatchObject({ emphasis: 0.5, visible: true });
    expect(view.entityProbe('text-c')).toMatchObject({ emphasis: 0, visible: false });
    expect(base.opacity[0]).toBeCloseTo(0.8, 6);
    expect(base.opacity[1]).toBeCloseTo(0.5, 6);

    multipliers[0] = 0.25;
    multipliers[1] = 0.75;
    view.synchronize(
      base,
      policy({ highlightedEntityIds: ['item-a'] }),
      [{ start: 0, end: 1 }],
      new Map([['item-a', Object.freeze({ opacity: 0.6 })]]),
      multipliers,
    );
    expect(view.opacity[0]).toBeCloseTo(0.15, 6);
    expect(view.opacity[1]).toBe(0);
  });

  it('synchronizes keyed alpha without rewriting unrelated presentation columns', () => {
    const base = store();
    const multipliers = new Float32Array([0.5, 1, 1, 1]);
    const view = new PatchMapPresentationStoreView(
      base,
      null,
      new Map([['item-a', Object.freeze({ fill: 0x2563ebff })]]),
      multipliers,
    );
    const fill = view.fill[0];
    (base.fill as Uint32Array)[0] = 0xef4444ff;
    multipliers[0] = 0.25;

    view.synchronizeAlphaMultipliers(multipliers, [{ start: 0, end: 1 }]);

    expect(view.opacity[0]).toBeCloseTo(0.25, 6);
    expect(view.fill[0]).toBe(fill);
  });

  it('projects sparse instance bar and icon values without mutating dense columns', () => {
    const base = store();
    (base.kind as Uint8Array)[0] = RenderKind.Bar;
    (base.kind as Uint8Array)[1] = RenderKind.Image;
    (base.flags as Uint8Array)[1] = 0;
    const before = Object.freeze({
      flags: Array.from(base.flags),
      fill: Array.from(base.fill),
      source: [...base.source],
      tint: Array.from(base.tint),
    });
    const view = new PatchMapPresentationStoreView(
      base,
      null,
      new Map<string, PatchMapRendererEntityPresentationOverride>([
      ['item-a', Object.freeze({ fill: 0x2563ebff, trackFill: 0xffffffff, radius: 6 })],
      ['text-c', Object.freeze({ visible: true, source: 'ess', tint: 0xef4444ff })],
      ]),
    );

    expect(view.fill[0]).toBe(0x2563ebff);
    expect(view.trackFill[0]).toBe(0xffffffff);
    expect(view.radius[0]).toBe(6);
    expect(view.flags[1]! & RenderFlags.Visible).toBe(RenderFlags.Visible);
    expect(view.source[1]).toBe('ess');
    expect(view.tint[1]).toBe(0xef4444ff);
    expect(Array.from(base.flags)).toEqual(before.flags);
    expect(Array.from(base.fill)).toEqual(before.fill);
    expect(base.source).toEqual(before.source);
    expect(Array.from(base.tint)).toEqual(before.tint);
  });

  it('restores every owned column and retained presentation input from a checkpoint', () => {
    const base = store();
    const originalPolicy = policy({
      highlightedEntityIds: ['item-a'],
      fillOverrides: [{ id: 'item-a', packedColor: 0x2563ebff }],
    });
    const originalOverrides = new Map<string, PatchMapRendererEntityPresentationOverride>([
      ['item-a', Object.freeze({ source: 'before', radius: 3 })],
    ]);
    const originalAlpha = new Float32Array([0.4, 1, 1, 1]);
    const view = new PatchMapPresentationStoreView(
      base,
      originalPolicy,
      originalOverrides,
      originalAlpha,
    );
    const checkpoint = view.captureCheckpoint();

    const replacement = store();
    const replacementOverrides = new Map<string, PatchMapRendererEntityPresentationOverride>([
      ['item-a', Object.freeze({
        kind: RenderKind.Bar,
        visible: false,
        opacity: 0.75,
        fill: 0xef4444ff,
        stroke: 0x111111ff,
        strokeWidth: 7,
        radius: 9,
        source: 'after',
        tint: 0xabcdef12,
        trackFill: 0x12345678,
        align: RenderAlign.Justify,
      })],
    ]);
    view.synchronize(
      replacement,
      policy({ revision: 2, hiddenEntityIds: ['item-a'] }),
      undefined,
      replacementOverrides,
      new Float32Array([1, 0.5, 0.25, 1]),
    );
    expect(view.source[0]).toBe('after');
    expect(view.align[0]).toBe(RenderAlign.Justify);
    expect(view.opacity[0]).not.toBeCloseTo(checkpoint.opacity[0] ?? 0, 6);

    view.restoreCheckpoint(checkpoint);
    const restored = view.captureCheckpoint();
    expect(restored.base).toBe(base);
    expect(restored.policy).toBe(originalPolicy);
    expect(restored.overrides).toBe(originalOverrides);
    expect(restored.alphaMultipliers).toBe(originalAlpha);
    expect(restored.highlighted).toEqual(checkpoint.highlighted);
    expect(restored.hidden).toEqual(checkpoint.hidden);
    expect(restored.fillOverrides).toEqual(checkpoint.fillOverrides);
    expect(restored.kind).toEqual(checkpoint.kind);
    expect(restored.flags).toEqual(checkpoint.flags);
    expect(restored.opacity).toEqual(checkpoint.opacity);
    expect(restored.fill).toEqual(checkpoint.fill);
    expect(restored.stroke).toEqual(checkpoint.stroke);
    expect(restored.strokeWidth).toEqual(checkpoint.strokeWidth);
    expect(restored.radius).toEqual(checkpoint.radius);
    expect(restored.source).toEqual(checkpoint.source);
    expect(restored.tint).toEqual(checkpoint.tint);
    expect(restored.trackFill).toEqual(checkpoint.trackFill);
    expect(restored.align).toEqual(checkpoint.align);
  });

});

function policy(
  overrides: Partial<PatchMapResolvedPresentationPolicy> = {},
): PatchMapResolvedPresentationPolicy {
  return Object.freeze({
    revision: overrides.revision ?? 1,
    highlightedEntityIds: overrides.highlightedEntityIds ?? null,
    deEmphasisAlpha: overrides.deEmphasisAlpha ?? 0.2,
    hiddenEntityIds: overrides.hiddenEntityIds ?? Object.freeze([]),
    fillOverrides: overrides.fillOverrides ?? Object.freeze([]),
  });
}

function store(): RenderStoreView {
  const order = new Uint32Array([0, 1, 2]);
  return {
    capacity: 4,
    liveCount: 3,
    revision: 7,
    alive: new Uint8Array([1, 1, 1, 0]),
    kind: new Uint8Array([RenderKind.Rect, RenderKind.Text, RenderKind.Relation, 0]),
    flags: new Uint8Array([
      RenderFlags.Visible,
      RenderFlags.Visible,
      RenderFlags.Visible,
      0,
    ]),
    zIndex: new Int32Array(4),
    x: new Float64Array(4),
    y: new Float64Array(4),
    width: new Float64Array(4),
    height: new Float64Array(4),
    rotation: new Float32Array(4),
    opacity: new Float32Array([1, 1, 1, 0]),
    fill: new Uint32Array(4),
    stroke: new Uint32Array(4),
    strokeWidth: new Float32Array(4),
    radius: new Float32Array(4),
    text: ['item', 'text', '', ''],
    color: new Uint32Array(4),
    fontSize: new Float32Array(4),
    fontFamily: ['', '', '', ''],
    fontWeight: new Uint32Array(4),
    align: new Uint8Array(4),
    maxLines: new Uint32Array(4),
    source: ['', '', '', ''],
    tint: new Uint32Array(4),
    fit: new Uint8Array(4),
    value: new Float64Array(4),
    min: new Float64Array(4),
    max: new Float64Array(4),
    trackFill: new Uint32Array(4),
    relationFrom: new Int32Array(4),
    relationTo: new Int32Array(4),
    lineWidth: new Float32Array(4),
    ids: ['item-a', 'text-c', 'links:0', ''],
    view: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
    background: 0xffffffff,
    renderOrder: () => order,
  };
}
