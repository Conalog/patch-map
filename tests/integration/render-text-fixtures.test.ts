import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PATCH_MAP_RENDER_TEXT_SPECIMEN_IDS,
  createPatchMapRenderTextSpecimens,
} from '../../lab/contract/render-text-fixtures';
import { materializePatchMapDataset } from '../../src/semantic/dataset';

describe('PatchMap REN-011 supplemental text specimens', () => {
  it('creates seven deterministic deep-frozen fresh PATCH MAP arrays with stable identities', () => {
    const first = createPatchMapRenderTextSpecimens();
    const second = createPatchMapRenderTextSpecimens();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first).toHaveLength(7);
    expect(first.map(({ id }) => id)).toEqual(PATCH_MAP_RENDER_TEXT_SPECIMEN_IDS);
    expect(new Set(first.map(({ datasetId }) => datasetId)).size).toBe(first.length);
    expect(new Set(first.map(({ target }) => `${target.ownerId}:${target.id}`)).size).toBe(first.length);

    first.forEach((entry, index) => {
      expect(entry).not.toBe(second[index]);
      expect(entry.dataset).not.toBe(second[index]?.dataset);
      expectDeepFrozen(entry);

      const materialized = materializePatchMapDataset(entry.dataset);
      expect(materialized.rootIds).toEqual([entry.target.ownerId]);
      expect(materialized.componentTypes).toEqual(['text']);
      expect(materialized.dataset[0]).toMatchObject({
        type: 'item',
        id: entry.target.ownerId,
        components: [{ type: 'text', id: entry.target.id }],
      });
    });
  });

  it('preserves the independently authored source, frame, placement, paint, and layout controls', () => {
    const specimens = new Map(createPatchMapRenderTextSpecimens().map((entry) => [entry.id, entry]));

    expect(authoredItem(specimens, 'placed')).toEqual({
      type: 'item',
      id: 'patch-map-ren011-placed',
      size: { width: 240, height: 160 },
      components: [{
        type: 'text',
        id: 'placed',
        text: 'AB',
        style: baseStyle(),
        placement: 'right-bottom',
        margin: 5,
        tint: '#ff0000',
      }],
    });
    expect(authoredItem(specimens, 'auto')).toEqual({
      type: 'item',
      id: 'patch-map-ren011-auto',
      size: { width: 32, height: 20 },
      components: [{
        type: 'text',
        id: 'auto',
        text: 'ABCD',
        style: { ...baseStyle(), autoFont: { min: 8, max: 18 } },
      }],
    });
    expect(authoredItem(specimens, 'wrap')).toEqual({
      type: 'item',
      id: 'patch-map-ren011-wrap',
      size: { width: 240, height: 160 },
      components: [{
        type: 'text',
        id: 'wrap',
        text: 'ABCDEFGHIJ',
        style: {
          ...baseStyle(),
          wordWrap: true,
          breakWords: true,
          wordWrapWidth: 32,
        },
      }],
    });

    for (const overflow of ['visible', 'hidden', 'ellipsis'] as const) {
      const id = `overflow-${overflow}` as const;
      expect(authoredItem(specimens, id)).toEqual({
        type: 'item',
        id: `patch-map-ren011-${id}`,
        size: { width: 32, height: 20 },
        components: [{
          type: 'text',
          id,
          text: 'ABCDEFGHIJ',
          style: { ...baseStyle(), overflow },
        }],
      });
    }

    expect(authoredItem(specimens, 'upright')).toEqual({
      type: 'item',
      id: 'patch-map-ren011-upright',
      size: { width: 240, height: 160 },
      components: [{
        type: 'text',
        id: 'upright',
        text: 'AB',
        style: baseStyle(),
        placement: 'center',
      }],
      attrs: { angle: 37 },
      contentOrientation: 'upright',
    });
  });

  it('cannot be influenced by arbitrary output-shaped objects passed through an untyped boundary', () => {
    const baseline = createPatchMapRenderTextSpecimens();
    const poison = {
      chosen: -9,
      lines: ['poison'],
      visibleText: 'poison',
      layoutBounds: [999, 999, 999, 999],
      screenAngle: 123,
      rgba: '#00ff00ff',
      itemTextContractMatrix: [{ id: 'placed', source: 'poison' }],
    };
    const untypedFactory = createPatchMapRenderTextSpecimens as unknown as (
      ...untrusted: readonly unknown[]
    ) => ReturnType<typeof createPatchMapRenderTextSpecimens>;

    expect(untypedFactory(poison, structuredClone(poison))).toEqual(baseline);
    poison.itemTextContractMatrix[0]!.source = 'mutated-after-call';
    expect(createPatchMapRenderTextSpecimens()).toEqual(baseline);
  });

  it('has no imports or references to approved expected artifacts', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../lab/contract/render-text-fixtures.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toMatch(/catalog-normalized-expected|catalog-fixtures|catalog-typed-cases/u);
    expect(source).not.toMatch(/itemTextContractMatrix|chosen|visibleText|layoutBounds|screenAngle|rgba/u);
  });
});

type Specimens = ReturnType<typeof createPatchMapRenderTextSpecimens>;
type SpecimenId = Specimens[number]['id'];

function authoredItem(specimens: Map<SpecimenId, Specimens[number]>, id: SpecimenId): unknown {
  return specimens.get(id)?.dataset[0];
}

function baseStyle(): Readonly<Record<string, unknown>> {
  return {
    fontFamily: 'Unifont',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  };
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
