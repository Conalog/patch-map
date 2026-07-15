import type { EntityInput, EntityKind, SceneDocument } from '../../../src/core-v1/contracts';

export const SYNTHETIC_WORKLOAD_SIZES = [100, 500, 1_000, 2_000, 5_000] as const;

export type SyntheticWorkloadSize = (typeof SYNTHETIC_WORKLOAD_SIZES)[number];

export interface SyntheticWorkloadStats {
  readonly requestedEntities: number;
  readonly drawableEntities: number;
  readonly relationEntities: number;
  readonly kinds: Readonly<Record<EntityKind, number>>;
}

export interface SyntheticWorkload {
  readonly document: SceneDocument;
  readonly stats: SyntheticWorkloadStats;
}

function stableId(prefix: 'entity' | 'relation', index: number): string {
  return `synthetic:${prefix}:${String(index).padStart(5, '0')}`;
}

export function createSyntheticWorkload(entityCount: number): SyntheticWorkload {
  if (!Number.isSafeInteger(entityCount) || entityCount < 2) {
    throw new RangeError('entityCount must be a safe integer of at least 2');
  }

  const relationCount = Math.max(1, Math.floor(entityCount / 8));
  const drawableCount = entityCount - relationCount;
  const columns = Math.ceil(Math.sqrt(drawableCount));
  const entities: EntityInput[] = [];
  const kinds: Record<EntityKind, number> = {
    rect: 0,
    text: 0,
    image: 0,
    bar: 0,
    relation: 0,
  };

  for (let index = 0; index < drawableCount; index += 1) {
    const id = stableId('entity', index);
    const x = (index % columns) * 38;
    const y = Math.floor(index / columns) * 30;
    const common = {
      id,
      x,
      y,
      width: 32,
      height: 24,
      interactive: true,
      zIndex: index % 3,
      tags: ['synthetic', `lane:${index % 8}`],
    } as const;

    switch (index % 8) {
      case 1:
      case 5:
        entities.push({
          kind: 'bar',
          ...common,
          value: ((index * 37) % 101) / 100,
          min: 0,
          max: 1,
          fill: 0x22c55eff,
          trackFill: 0xdbe4eaff,
          radius: 2,
        });
        kinds.bar += 1;
        break;
      case 3:
        entities.push({
          kind: 'text',
          ...common,
          text: `N${index}`,
          color: 0x172033ff,
          fontSize: 11,
          align: 'center',
          maxLines: 1,
        });
        kinds.text += 1;
        break;
      case 7:
        entities.push({
          kind: 'image',
          ...common,
          source: `synthetic:asset:${index % 4}`,
          tint: 0xffffffff,
          fit: 'contain',
        });
        kinds.image += 1;
        break;
      default:
        entities.push({
          kind: 'rect',
          ...common,
          fill: index % 2 === 0 ? 0x2563ebff : 0x0ea5e9ff,
          stroke: 0x0f172aff,
          strokeWidth: 1,
          radius: 3,
        });
        kinds.rect += 1;
    }
  }

  for (let index = 0; index < relationCount; index += 1) {
    const fromIndex = index % drawableCount;
    const toIndex = (index * 17 + 1) % drawableCount;
    entities.push({
      kind: 'relation',
      id: stableId('relation', index),
      from: stableId('entity', fromIndex),
      to: stableId('entity', toIndex),
      color: 0x64748bff,
      lineWidth: 1,
      interactive: false,
      zIndex: -1,
      tags: ['synthetic', 'relation'],
    });
    kinds.relation += 1;
  }

  return {
    document: {
      version: 1,
      entities,
      background: 0xf8fafcff,
      view: { x: 12, y: 12, scale: 1 },
    },
    stats: {
      requestedEntities: entityCount,
      drawableEntities: drawableCount,
      relationEntities: relationCount,
      kinds,
    },
  };
}
