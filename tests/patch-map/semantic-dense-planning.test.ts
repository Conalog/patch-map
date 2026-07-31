import { describe, expect, it } from 'vitest';

import type { ParsePatchMapResult } from '../../src/patch-map/contracts';
import {
  denseReconcileOptions,
  resolvePresentationFillOverrides,
  semanticPresentationFillDenseIds,
  semanticSelectionDenseIds,
} from '../../src/patch-map/core/semantic-dense-planning';
import { indexPatchMapComponentProbeTargets } from '../../src/patch-map/core/product-probe-reader';
import { parsePatchMapV010 } from '../../src/patch-map/parser';

describe('PatchMap semantic-to-dense planning', () => {
  it('maps caller-visible component and element identities without mutating selection input', () => {
    const parsed = parseFixture();
    const semanticIds = Object.freeze([
      'item-a/bar-a',
      'rect-b',
      'item-a/bar-a',
    ]);
    const barId = componentId(parsed, 'bar-a');

    const denseIds = semanticSelectionDenseIds(
      parsed,
      semanticIds,
      indexPatchMapComponentProbeTargets(parsed),
    );

    expect(denseIds).toEqual([barId, 'rect-b']);
    expect(semanticIds).toEqual(['item-a/bar-a', 'rect-b', 'item-a/bar-a']);
    expect(Object.isFrozen(denseIds)).toBe(true);
    expect(() => semanticSelectionDenseIds(parsed, [''])).toThrow(
      'selectionIds[0] must be a non-empty string',
    );
  });

  it('targets item backgrounds deterministically and lets the last semantic override win', () => {
    const parsed = parseFixture();
    const backgroundIds = Object.values(parsed.projection.componentsByEntityId ?? {})
      .filter((component) => component.renderRole === 'background-geometry')
      .map((component) => component.entityId)
      .sort();
    const overrides = Object.freeze([
      Object.freeze({ id: 'item-a', packedColor: 0x112233ff }),
      Object.freeze({ id: 'rect-b', packedColor: 0x445566ff }),
      Object.freeze({ id: 'item-a', packedColor: 0x778899ff }),
    ]);

    expect(semanticPresentationFillDenseIds(parsed, 'item-a')).toEqual(backgroundIds);
    const resolved = resolvePresentationFillOverrides(parsed, overrides);

    expect(resolved).toEqual([
      ...backgroundIds.map((id) => ({ id, packedColor: 0x778899ff })),
      { id: 'rect-b', packedColor: 0x445566ff },
    ].sort((left, right) => left.id.localeCompare(right.id)));
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved.every(Object.isFrozen)).toBe(true);
    expect(overrides[0]).toEqual({ id: 'item-a', packedColor: 0x112233ff });
  });

  it('preserves dense reconcile metadata while projecting order and no-op selection scope', () => {
    const current = parseFixture();
    const candidate = parseFixture();
    const selectionIds = semanticSelectionDenseIds(candidate, ['rect-b']);
    const elementOrderIds = expectedElementOrderIds(candidate, ['item-a', 'rect-b']);
    const componentOrderIds = expectedComponentOrderIds(candidate, 'item-a');

    const options = denseReconcileOptions({
      id: 'semantic-transaction',
      recordHistory: false,
      selectionIds: ['rect-b'],
      allowedRetainedOrderIds: ['manual-dense-id'],
      allowedElementOrderIds: ['item-a', 'rect-b'],
      allowedComponentOrderOwners: ['item-a'],
    }, current, candidate, selectionIds);

    expect(options).toEqual({
      id: 'semantic-transaction',
      recordHistory: false,
      allowedRetainedOrderIds: [
        'manual-dense-id',
        ...elementOrderIds,
        ...elementOrderIds,
        ...componentOrderIds,
        ...componentOrderIds,
      ],
    });
    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options.allowedRetainedOrderIds)).toBe(true);
  });
});

function parseFixture(): ParsePatchMapResult {
  return parsePatchMapV010([
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [
        {
          type: 'background',
          id: 'background-b',
          source: { type: 'rect', fill: '#ffffffff' },
        },
        {
          type: 'bar',
          id: 'bar-a',
          source: { type: 'rect', fill: '#2563ebff' },
          size: { width: 40, height: 12 },
          placement: 'bottom',
        },
        {
          type: 'background',
          id: 'background-a',
          source: { type: 'rect', fill: '#000000ff' },
        },
      ],
    },
    {
      type: 'rect',
      id: 'rect-b',
      size: { width: 20, height: 10 },
    },
  ]);
}

function componentId(parse: ParsePatchMapResult, componentId: string): string {
  const component = Object.values(parse.projection.barsByEntityId ?? {})
    .find((candidate) => candidate.componentId === componentId);
  if (component === undefined) throw new Error(`Missing component ${componentId}`);
  return component.entityId;
}

function expectedElementOrderIds(
  parse: ParsePatchMapResult,
  sourceIds: readonly string[],
): readonly string[] {
  return [...new Set(sourceIds.flatMap(
    (sourceId) => parse.identity.entityIdsBySourceId[sourceId] ?? [],
  ))].sort();
}

function expectedComponentOrderIds(
  parse: ParsePatchMapResult,
  sourceId: string,
): readonly string[] {
  return [...new Set(parse.identity.components
    .filter((component) => component.sourceElementId === sourceId)
    .flatMap((component) => component.entityIds))].sort();
}
