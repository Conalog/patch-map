import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_FIXTURE_IDENTITY,
  SYNTHETIC_WORKLOAD_SIZES,
  assertProductionFixtureBytes,
  convertProductionFixture,
  createSyntheticWorkload,
  formatProductionConversionStats,
} from '../../lab/performance-v1/workloads';
import type { RelationEntityInput } from '../../src/core-v1/contracts';
import { createCoreScene } from '../../src/core-v1/scene';
import { normalizeDocument } from '../../src/core-v1/validation';

const fixturePath = fileURLToPath(
  new URL('../../lab/fixtures/production-like.json', import.meta.url),
);
const fixtureManifestPath = fileURLToPath(
  new URL('../../lab/fixtures/production-like.manifest.json', import.meta.url),
);

function productionFixture(): unknown {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
}

describe('Core v1 production workload adapter', () => {
  it('independently verifies the preserved fixture bytes and manifest', async () => {
    const bytes = readFileSync(fixturePath);
    const manifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8')) as {
      bytes: number;
      sha256: string;
      topLevelElements: number;
    };
    const independentSha = createHash('sha256').update(bytes).digest('hex');

    expect(bytes.byteLength).toBe(PRODUCTION_FIXTURE_IDENTITY.bytes);
    expect(independentSha).toBe(PRODUCTION_FIXTURE_IDENTITY.sha256);
    expect(manifest).toMatchObject(PRODUCTION_FIXTURE_IDENTITY);
    await expect(assertProductionFixtureBytes(bytes)).resolves.toEqual({
      bytes: PRODUCTION_FIXTURE_IDENTITY.bytes,
      sha256: PRODUCTION_FIXTURE_IDENTITY.sha256,
    });

    const changed = Uint8Array.from(bytes.subarray(0, 64));
    changed[0] = (changed[0] ?? 0) ^ 1;
    await expect(assertProductionFixtureBytes(changed)).rejects.toThrow(
      'production fixture identity mismatch',
    );
  });

  it('expands cells, components, and links without mutating caller input', () => {
    const input = productionFixture();
    const before = JSON.stringify(input);
    const workload = convertProductionFixture(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(workload.stats).toEqual({
      source: {
        topLevelElements: 458,
        grids: 40,
        items: 29,
        relationGroups: 389,
      },
      expanded: {
        gridCells: 9_336,
        directItems: 29,
        components: 18_759,
        relationLinks: 8_947,
      },
      output: {
        entities: 37_071,
        rects: 18_730,
        bars: 9_365,
        images: 29,
        texts: 0,
        relations: 8_947,
      },
    });
    expect(formatProductionConversionStats(workload.stats)).toBe(
      '458 source records · 9336 cells · 18759 components · 8947 links · 37071 Core v1 entities',
    );

    const normalized = normalizeDocument(workload.document);
    expect(normalized).toHaveLength(37_071);
  });

  it('generates stable unique IDs and resolvable relation endpoints', () => {
    const first = convertProductionFixture(productionFixture()).document;
    const second = convertProductionFixture(productionFixture()).document;
    const firstIds = first.entities.map((entity) => entity.id);
    const secondIds = second.entities.map((entity) => entity.id);
    const ids = new Set(firstIds);

    expect(secondIds).toEqual(firstIds);
    expect(ids.size).toBe(first.entities.length);
    for (const relation of first.entities.filter(
      (entity): entity is RelationEntityInput => entity.kind === 'relation',
    )) {
      expect(ids.has(relation.from)).toBe(true);
      expect(ids.has(relation.to)).toBe(true);
    }
  });

  it('loads and tears down the fully expanded production document headlessly', () => {
    const workload = convertProductionFixture(productionFixture());
    const scene = createCoreScene({ initialCapacity: workload.document.entities.length });

    expect(scene.load(workload.document).entityCount).toBe(37_071);
    expect(scene.snapshot().entityCount).toBe(37_071);
    expect(scene.destroy()).toBe(true);
  });
});

describe('Core v1 synthetic acceptance workloads', () => {
  it.each(SYNTHETIC_WORKLOAD_SIZES)(
    'creates an exact deterministic %i-entity document',
    (size) => {
      const first = createSyntheticWorkload(size);
      const second = createSyntheticWorkload(size);

      expect(first.document.entities).toHaveLength(size);
      expect(first.stats.requestedEntities).toBe(size);
      expect(first.stats.drawableEntities + first.stats.relationEntities).toBe(size);
      expect(second).toEqual(first);
      expect(normalizeDocument(first.document)).toHaveLength(size);
      expect(new Set(first.document.entities.map((entity) => entity.id)).size).toBe(size);
      expect(first.stats.kinds.bar).toBeGreaterThan(0);
      expect(first.stats.kinds.relation).toBeGreaterThan(0);
    },
  );

  it('rejects invalid sizes deterministically', () => {
    expect(() => createSyntheticWorkload(1)).toThrow(
      'entityCount must be a safe integer of at least 2',
    );
    expect(() => createSyntheticWorkload(Number.NaN)).toThrow(
      'entityCount must be a safe integer of at least 2',
    );
  });
});
