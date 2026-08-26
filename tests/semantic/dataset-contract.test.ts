import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import datasets from '../fixtures/datasets/index';
import { describe, expect, it } from 'vitest';

import {
  assembleOwnedPatchMapDataset,
  assembleOwnedPatchMapPreviewDataset,
  assembleOwnedPatchMapSparsePreviewDataset,
  materializePatchMapDataset,
  ownedPatchMapExactPatchIndices,
  ownedPatchMapMaterialization,
  ownedPatchMapPreviewPatchIndices,
} from '../../src/semantic/dataset';
import type { PatchMapDatasetError } from '../../src/semantic/dataset';

const largeGridFixturePath = fileURLToPath(
  new URL('../fixtures/large-grid-scene.json', import.meta.url),
);
describe('PatchMap dataset foundation', () => {
  it('materializes every element and component discriminator in authored order', () => {
    const input = datasets['all-kinds-scene'];
    const before = JSON.stringify(input);

    const result = materializePatchMapDataset(input);

    expect(result.rootIds).toEqual([
      'group-a',
      'group-b',
      'grid-a',
      'links',
      'image-a',
      'text-c',
      'zone-a',
    ]);
    expect(result.elementTypes).toEqual([
      'group',
      'grid',
      'item',
      'relations',
      'image',
      'text',
      'rect',
    ]);
    expect(result.componentTypes).toEqual(['background', 'bar', 'icon', 'text']);
    expect(result.visibleBoundsFinite).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('accepts a large grid-heavy dataset without caller mutation', () => {
    const input = JSON.parse(readFileSync(largeGridFixturePath, 'utf8')) as unknown;
    const before = JSON.stringify(input);

    const result = materializePatchMapDataset(input);

    expect(result.rootIds).toHaveLength(458);
    expect(new Set(result.rootIds)).toHaveProperty('size', 458);
    expect(result.elementTypes).toContain('grid');
    expect(result.componentTypes).toEqual(['background', 'bar', 'icon']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('materializes a large flat dataset without retaining mutable aliases', () => {
    const input = Array.from({ length: 605 }, (_, index) => ({
      type: 'rect',
      id: `rect-${index}`,
      size: { width: 10, height: 10 },
    }));
    const before = JSON.stringify(input);

    const result = materializePatchMapDataset(input);

    expect(result.rootIds).toHaveLength(605);
    expect(result.dataset).not.toBe(input);
    expect(Object.isFrozen(result.dataset)).toBe(true);
    expect(result.dataset.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('accepts but discards compatibility background size', () => {
    const input = [{
      type: 'item',
      id: 'item',
      size: 100,
      components: [{
        type: 'background',
        id: 'bg',
        source: { type: 'rect' },
        size: { width: 40, height: 80 },
      }],
    }];
    const before = structuredClone(input);

    const result = materializePatchMapDataset(input);
    const item = result.dataset[0];
    const background = item?.type === 'item' ? item.components[0] : undefined;

    expect(background).toMatchObject({ type: 'background', id: 'bg' });
    expect(background).not.toHaveProperty('size');
    expect(input).toEqual(before);
  });

  it('normalizes only the relation style fields that rendering projects', () => {
    const input = [{
      type: 'relations',
      id: 'links',
      links: [{ source: 'links', target: 'links' }],
      style: { color: '#123456', width: 2, alpha: 0.4 },
    }];
    const before = structuredClone(input);

    const relation = materializePatchMapDataset(input).dataset[0];

    expect(relation?.type === 'relations' ? relation.style : null).toEqual({
      color: '#123456',
      width: 2,
      alpha: 0.4,
    });
    expect(relation?.type === 'relations' && Object.isFrozen(relation.style)).toBe(true);
    expect(input).toEqual(before);
  });

  it('accepts and discards non-projected relation stroke compatibility fields', () => {
    const relation = materializePatchMapDataset([{
      type: 'relations',
      id: 'links',
      links: [],
      style: {
        color: '#123456',
        alpha: 0.4,
        width: 2,
        cap: 'round',
        join: 'bevel',
        miterLimit: 12,
        alignment: 0.25,
        pixelLine: true,
        textureSpace: 'local',
        fill: '#ffffff',
        texture: { source: '/stroke.png' },
        matrix: [1, 0, 0, 1, 0, 0],
      },
    }]).dataset[0];

    expect(relation?.type === 'relations' ? relation.style : null).toEqual({
      color: '#123456',
      alpha: 0.4,
      width: 2,
    });
  });

  it('normalizes deprecated relation opacity to alpha', () => {
    const relation = materializePatchMapDataset([{
      type: 'relations',
      id: 'links',
      links: [],
      style: { opacity: 0.35 },
    }]).dataset[0];

    expect(relation?.type === 'relations' ? relation.style.alpha : null).toBe(0.35);
  });

  it('applies defaults without mutating caller data and is fresh-session deterministic', () => {
    const input = [
      {
        type: 'item',
        size: { width: 100, height: 80 },
        components: [
          { type: 'bar', source: { type: 'rect' }, size: { width: 30, height: 10 } },
          { type: 'text' },
        ],
      },
    ];
    const before = JSON.stringify(input);

    const first = materializePatchMapDataset(input);
    const second = materializePatchMapDataset(input);
    const item = first.dataset[0];
    const components = item?.type === 'item' ? item.components : [];
    const bar = components[0];
    const text = components[1];

    expect(item).toMatchObject({ show: true, locked: false, contentOrientation: 'upright' });
    expect(item?.type === 'item' ? item.padding : null).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(bar).toMatchObject({ type: 'bar', placement: 'bottom', animation: true, animationDuration: 200 });
    expect(text).toMatchObject({ type: 'text', split: 0 });
    expect(first.semanticHash).toBe(second.semanticHash);
    expect(first.semanticHash).toBe(referenceSemanticHash(first.dataset));
    expect(JSON.stringify(input)).toBe(before);
  });

  it('recovers canonical owned materializations but excludes transient preview hashes', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
    ]);
    const assembled = assembleOwnedPatchMapDataset(current, current.dataset);
    const preview = assembleOwnedPatchMapPreviewDataset(current, current.dataset);

    expect(ownedPatchMapMaterialization(current.dataset)).toBe(current);
    expect(ownedPatchMapMaterialization(assembled.dataset)).toBe(assembled);
    expect(ownedPatchMapMaterialization(preview.dataset)).toBeNull();
  });

  it('defers exact shared-candidate hashing until the digest is observed', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
    ]);
    const replacement = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 20, height: 10 } },
    ]).dataset[0]!;
    const assembled = assembleOwnedPatchMapDataset(current, [replacement]);
    const descriptor = Object.getOwnPropertyDescriptor(assembled, 'semanticHash');

    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.get).toBeTypeOf('function');
    expect(assembled.semanticHash).toBe(referenceSemanticHash(assembled.dataset));
    expect(assembled.semanticHash).toBe(referenceSemanticHash(assembled.dataset));
  });

  it('retains exact sparse preview lineage without accepting a different base', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
      { type: 'rect', id: 'two', size: { width: 20, height: 20 } },
    ]);
    const replacement = materializePatchMapDataset([
      { type: 'rect', id: 'two', size: { width: 24, height: 20 } },
    ]).dataset[0]!;
    const preview = assembleOwnedPatchMapSparsePreviewDataset(current, [
      { index: 1, root: replacement },
    ]);
    const other = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
      { type: 'rect', id: 'two', size: { width: 20, height: 20 } },
    ]);

    expect(preview.dataset[0]).toBe(current.dataset[0]);
    expect(preview.dataset[1]).toBe(replacement);
    expect(ownedPatchMapPreviewPatchIndices(preview.dataset, current.dataset)).toEqual([1]);
    expect(ownedPatchMapPreviewPatchIndices(preview.dataset, other.dataset)).toBeNull();
    expect(ownedPatchMapMaterialization(preview.dataset)).toBeNull();
  });

  it('retains exact authoritative patch lineage only for its validated base', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
      { type: 'rect', id: 'two', size: { width: 20, height: 20 } },
    ]);
    const replacement = materializePatchMapDataset([
      { type: 'rect', id: 'two', size: { width: 24, height: 20 } },
    ]).dataset[0]!;
    const assembled = assembleOwnedPatchMapDataset(current, [
      current.dataset[0]!,
      replacement,
    ]);
    const other = materializePatchMapDataset([
      { type: 'rect', id: 'one', size: { width: 10, height: 10 } },
      { type: 'rect', id: 'two', size: { width: 20, height: 20 } },
    ]);

    expect(ownedPatchMapExactPatchIndices(assembled.dataset, current.dataset)).toEqual([1]);
    expect(ownedPatchMapExactPatchIndices(assembled.dataset, other.dataset)).toBeNull();
    expect(ownedPatchMapPreviewPatchIndices(assembled.dataset, current.dataset)).toBeNull();
    expect(ownedPatchMapMaterialization(assembled.dataset)).toBe(assembled);
  });

  it('rejects an unsupported discriminator atomically with the closed diagnostic code', () => {
    const input = [{ type: 'rect', id: 'safe', size: 10 }, { type: 'unsupported' }];
    const before = JSON.stringify(input);

    expect(() => materializePatchMapDataset(input)).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_RECORD_KIND',
        datasetPath: '$[1].type',
        category: 'INVALID_INPUT',
      }),
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects unknown closed-schema keys while preserving open attrs values', () => {
    expect(() => materializePatchMapDataset([{ type: 'rect', size: 10, surprise: true }])).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$[0].surprise',
      }),
    );

    const result = materializePatchMapDataset([
      { type: 'rect', id: 'open-attrs', size: 10, attrs: { display: 'fixture', nested: { ok: true } } },
    ]);
    expect(result.dataset[0]?.attrs).toEqual({ display: 'fixture', nested: { ok: true } });
  });

  it('detaches prototype-sensitive attrs as own frozen data without polluting prototypes', () => {
    const input = JSON.parse(
      '[{"type":"rect","id":"prototype-safe","size":10,"attrs":{"__proto__":{"polluted":true}}}]',
    ) as unknown;
    const before = JSON.stringify(input);

    const attrs = materializePatchMapDataset(input).dataset[0]?.attrs;

    expect(Object.prototype.hasOwnProperty.call(attrs, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
    expect((attrs as Readonly<Record<string, unknown>>)['__proto__']).toEqual({ polluted: true });
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.isFrozen(attrs)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('reports the same deterministic first closed-schema error before scalar validation', () => {
    expect(() => materializePatchMapDataset([
      { type: 'rect', size: -1, zUnknown: true, aUnknown: true },
    ])).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$[0].aUnknown',
      }),
    );
  });

  it('rejects invalid direct colors while preserving unresolved dotted theme paths', () => {
    expect(() => materializePatchMapDataset([
      { type: 'rect', id: 'bad-color', size: 10, fill: 'not-a-color' },
    ])).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].fill',
      }),
    );

    const result = materializePatchMapDataset([
      { type: 'rect', id: 'themed', size: 10, fill: 'primary.default' },
    ]);
    expect(result.dataset[0]?.fill).toBe('primary.default');
  });
});

function referenceSemanticHash(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of stableSerialize(value)) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('reference hash only accepts canonical JSON');
}
