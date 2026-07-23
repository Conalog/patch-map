import { describe, expect, it } from 'vitest';

import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/core-v1/renderer/types';
import { CoreV2PresentationStoreView } from '../../src/core-v2/renderers/presentation-store';
import type { CoreV2ResolvedPresentationPolicy } from '../../src/core-v2/presentation-policy';

describe('Core v2 renderer presentation store', () => {
  it('applies highlight emphasis and hidden-layer visibility without mutating dense input', () => {
    const base = store();
    const beforeFlags = Array.from(base.flags);
    const beforeOpacity = Array.from(base.opacity);
    const view = new CoreV2PresentationStoreView(base, policy({
      highlightedEntityIds: ['item-a'],
      hiddenEntityIds: ['links:0'],
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
    });
    expect(view.entityProbe('text-c')).toEqual({
      emphasis: 0.2,
      visible: true,
      renderObjectCount: 1,
    });
    expect(view.entityProbe('links:0')).toEqual({
      emphasis: 0.2,
      visible: false,
      renderObjectCount: 0,
    });
    expect(Array.from(base.flags)).toEqual(beforeFlags);
    expect(Array.from(base.opacity)).toEqual(beforeOpacity);
  });

  it('updates only declared dirty ranges while retaining one renderer view identity', () => {
    const base = store();
    const view = new CoreV2PresentationStoreView(base, policy({
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
    const view = new CoreV2PresentationStoreView(store(), policy({
      highlightedEntityIds: [],
      deEmphasisAlpha: 0.35,
    }));

    expect([...view.opacity].slice(0, 3)).toEqual([
      expect.closeTo(0.35, 6),
      expect.closeTo(0.35, 6),
      expect.closeTo(0.35, 6),
    ]);
  });
});

function policy(
  overrides: Partial<CoreV2ResolvedPresentationPolicy> = {},
): CoreV2ResolvedPresentationPolicy {
  return Object.freeze({
    revision: overrides.revision ?? 1,
    highlightedEntityIds: overrides.highlightedEntityIds ?? null,
    deEmphasisAlpha: overrides.deEmphasisAlpha ?? 0.2,
    hiddenEntityIds: overrides.hiddenEntityIds ?? Object.freeze([]),
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
