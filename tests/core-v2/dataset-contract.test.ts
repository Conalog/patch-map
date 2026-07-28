import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';
import type { CoreV2DatasetError } from '../../src/core-v2/semantic/dataset';

const productionFixturePath = fileURLToPath(
  new URL('../../lab/fixtures/production-like.json', import.meta.url),
);

describe('Core v2 approved dataset foundation', () => {
  it('materializes every approved element and component discriminator in authored order', () => {
    const input = catalogProfiles.datasets['all-kinds-scene'];
    const before = JSON.stringify(input);

    const result = materializeCoreV2Dataset(input);

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

  it('accepts the existing production PATCH MAP JSON directly without caller mutation', () => {
    const input = JSON.parse(readFileSync(productionFixturePath, 'utf8')) as unknown;
    const before = JSON.stringify(input);

    const result = materializeCoreV2Dataset(input);

    expect(result.rootIds).toHaveLength(458);
    expect(new Set(result.rootIds)).toHaveProperty('size', 458);
    expect(result.elementTypes).toContain('grid');
    expect(result.componentTypes).toEqual(['background', 'bar', 'icon']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('applies approved defaults without mutating caller data and is fresh-session deterministic', () => {
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

    const first = materializeCoreV2Dataset(input);
    const second = materializeCoreV2Dataset(input);
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

  it('rejects an unsupported discriminator atomically with the closed diagnostic code', () => {
    const input = [{ type: 'rect', id: 'safe', size: 10 }, { type: 'unsupported' }];
    const before = JSON.stringify(input);

    expect(() => materializeCoreV2Dataset(input)).toThrowError(
      expect.objectContaining<Partial<CoreV2DatasetError>>({
        code: 'INVALID_RECORD_KIND',
        datasetPath: '$[1].type',
        category: 'INVALID_INPUT',
      }),
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects unknown closed-schema keys while preserving open attrs values', () => {
    expect(() => materializeCoreV2Dataset([{ type: 'rect', size: 10, surprise: true }])).toThrowError(
      expect.objectContaining<Partial<CoreV2DatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$[0].surprise',
      }),
    );

    const result = materializeCoreV2Dataset([
      { type: 'rect', id: 'open-attrs', size: 10, attrs: { display: 'fixture', nested: { ok: true } } },
    ]);
    expect(result.dataset[0]?.attrs).toEqual({ display: 'fixture', nested: { ok: true } });
  });

  it('rejects invalid direct colors while preserving unresolved dotted theme paths', () => {
    expect(() => materializeCoreV2Dataset([
      { type: 'rect', id: 'bad-color', size: 10, fill: 'not-a-color' },
    ])).toThrowError(
      expect.objectContaining<Partial<CoreV2DatasetError>>({
        code: 'INVALID_VALUE',
        datasetPath: '$[0].fill',
      }),
    );

    const result = materializeCoreV2Dataset([
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
