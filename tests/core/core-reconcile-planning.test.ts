import { describe, expect, it } from 'vitest';

import type {
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../../src/patch-map/contracts';
import {
  changedProjectionEntityIds,
  directBarEntityIds,
  directElementAngleEntityIds,
  directTextEntityIds,
  directTextParseTargetHints,
  incrementalDenseEntityIds,
  structuralTargetMappingsReusable,
} from '../../src/patch-map/core/reconcile-planning';
import {
  indexPatchMapComponentProbeTargets,
  indexPatchMapTextProbeTargets,
} from '../../src/patch-map/core/product-probe-reader';
import { parsePatchMap } from '../../src/patch-map/parser';

describe('PatchMap core reconcile target planning', () => {
  it('resolves indexed bar and text updates without changing update order or identity', () => {
    const parsed = parseFixture();
    const componentTargets = indexPatchMapComponentProbeTargets(parsed);
    const textTargets = indexPatchMapTextProbeTargets(parsed);
    const bar = Object.values(parsed.projection.barsByEntityId ?? {})[0];
    const text = Object.values(parsed.projection.textsByEntityId ?? {})
      .find((candidate) => candidate.componentId === 'label-a');
    if (bar === undefined || text === undefined) throw new Error('Expected component projections');
    const barUpdates = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'bar-a', height: 12 }),
      Object.freeze({ ownerId: 'item-a', componentId: 'bar-a', height: 20 }),
    ]);
    const textUpdates = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'label-a', text: 'After' }),
    ]);
    const indexedTextComponent = [...componentTargets.values()]
      .find((candidate) => candidate?.entityId === text.entityId);

    const barIds = directBarEntityIds(barUpdates, componentTargets);
    const textIds = directTextEntityIds(textUpdates, textTargets);
    const textHints = directTextParseTargetHints(textUpdates, componentTargets);

    expect(barIds).toEqual([bar.entityId]);
    expect(textIds).toEqual([text.entityId]);
    expect(textHints).toEqual([indexedTextComponent]);
    expect(textHints?.[0]).toBe(indexedTextComponent);
    expect(Object.isFrozen(barIds)).toBe(true);
    expect(Object.isFrozen(textIds)).toBe(true);
    expect(Object.isFrozen(textHints)).toBe(true);
    expect(barUpdates[0]).toEqual({
      ownerId: 'item-a',
      componentId: 'bar-a',
      height: 12,
    });
    expect(directTextEntityIds([
      { ownerId: 'missing', componentId: 'label-a', text: 'After' },
    ], textTargets)).toBeUndefined();
  });

  it('deduplicates dense scope in caller order and refuses incomplete direct roots', () => {
    const parsed = parseFixture();
    const sourceIds = ['item-a', 'rect-b'] as const;
    const expected = expectedEntityIds(parsed, sourceIds);

    const incrementalIds = incrementalDenseEntityIds(
      parsed,
      ['item-a', 'rect-b', 'item-a'],
    );
    const angleIds = directElementAngleEntityIds(parsed, [
      { id: 'item-a', angle: 15 },
      { id: 'rect-b', angle: 30 },
      { id: 'item-a', angle: 45 },
    ]);

    expect(incrementalIds).toEqual(expected);
    expect(angleIds).toEqual(expected);
    expect(Object.isFrozen(incrementalIds)).toBe(true);
    expect(Object.isFrozen(angleIds)).toBe(true);
    expect(directElementAngleEntityIds(parsed, [
      { id: 'missing', angle: 15 },
    ])).toBeUndefined();
    expect(directElementAngleEntityIds(parsed, [])).toBeUndefined();
  });

  it('keeps structural target reuse separate from referential presentation deltas', () => {
    const current = parseFixture();
    const reordered = parsePatchMap([...fixtureInput()].reverse());
    const replacement = parsePatchMap([
      fixtureInput()[0],
      { type: 'rect', id: 'rect-c', size: { width: 20, height: 10 } },
    ]);
    const changed = withChangedProjection(current.projection, 'rect-b');

    expect(structuralTargetMappingsReusable(current, reordered, {
      allowedElementOrderIds: ['item-a', 'rect-b'],
    })).toBe(true);
    expect(structuralTargetMappingsReusable(current, reordered, {})).toBe(false);
    expect(structuralTargetMappingsReusable(current, replacement, {
      allowedElementOrderIds: ['item-a', 'rect-b'],
    })).toBe(false);
    expect(changedProjectionEntityIds(current.projection, current.projection)).toEqual([]);
    const changedIds = changedProjectionEntityIds(current.projection, changed);
    expect(changedIds).toEqual(['rect-b']);
    expect(Object.isFrozen(changedIds)).toBe(true);
  });
});

function parseFixture(): ParsePatchMapResult {
  return parsePatchMap(fixtureInput());
}

function fixtureInput(): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [
        {
          type: 'bar',
          id: 'bar-a',
          source: { type: 'rect', fill: '#2563ebff' },
          size: { width: 40, height: 12 },
          placement: 'bottom',
        },
        {
          type: 'text',
          id: 'label-a',
          text: 'Before',
          placement: 'center',
          style: { fill: '#111111ff', fontSize: 12 },
        },
      ],
    },
    {
      type: 'rect',
      id: 'rect-b',
      size: { width: 20, height: 10 },
    },
  ];
}

function expectedEntityIds(
  parse: ParsePatchMapResult,
  sourceIds: readonly string[],
): readonly string[] {
  return [...new Set(sourceIds.flatMap(
    (sourceId) => parse.identity.entityIdsBySourceId[sourceId] ?? [],
  ))];
}

function withChangedProjection(
  projection: PatchMapProjectionIndex,
  entityId: string,
): PatchMapProjectionIndex {
  const entity = projection.byEntityId[entityId];
  if (entity === undefined) throw new Error(`Missing projection ${entityId}`);
  return Object.freeze({
    ...projection,
    byEntityId: Object.freeze({
      ...projection.byEntityId,
      [entityId]: Object.freeze({ ...entity }),
    }),
  });
}
