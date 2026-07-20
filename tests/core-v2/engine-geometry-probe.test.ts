import { describe, expect, it } from 'vitest';

import type { SceneSnapshot } from '../../src/core-v1/contracts';
import { createCoreV2SurfaceGeometrySnapshot } from '../../src/core-v2/engine';

describe('CoreV2Engine renderer-aligned geometry probe', () => {
  it('projects entity, relation, and selected bounds through the active view', () => {
    const snapshot: SceneSnapshot = {
      revision: 7,
      view: { x: 112, y: 84, scale: 2, rotation: 0 },
      entityCount: 4,
      entities: [
        {
          ref: { slot: 0, generation: 1 },
          id: 'item-a',
          kind: 'rect',
          bounds: { x: 10, y: 20, width: 100, height: 80 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 1,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 1, generation: 1 },
          id: 'rect-b',
          kind: 'rect',
          bounds: { x: 160, y: 40, width: 40, height: 30 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 2,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 2, generation: 1 },
          id: 'text-c',
          kind: 'text',
          bounds: { x: 40, y: 140, width: 80, height: 20 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 0,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 3, generation: 1 },
          id: 'links:0',
          kind: 'relation',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: false,
          zIndex: 0,
          tags: [],
          data: { from: 'item-a', to: 'rect-b' },
        },
      ],
      selection: {
        revision: 1,
        refs: [{ slot: 1, generation: 1 }],
      },
    };

    const geometry = createCoreV2SurfaceGeometrySnapshot(snapshot);

    expect(geometry.entities).toHaveLength(3);
    expect(geometry.entities[1]).toMatchObject({
      id: 'rect-b',
      worldBounds: [160, 40, 40, 30],
      screenBounds: [432, 164, 80, 60],
    });
    expect(geometry.relations).toEqual([
      {
        id: 'links:0',
        sourceId: 'item-a',
        targetId: 'rect-b',
        worldEndpoints: [[60, 60], [180, 55]],
        screenEndpoints: [[232, 204], [472, 194]],
      },
    ]);
    expect(geometry.selectionOverlay).toEqual({
      screenBounds: [432, 164, 80, 60],
    });
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry.relations[0]?.screenEndpoints)).toBe(true);
    expect(Object.isFrozen(geometry.selectionOverlay?.screenBounds)).toBe(true);
  });

  it('uses stable ref identity and omits dangling relation endpoints', () => {
    const snapshot: SceneSnapshot = {
      revision: 1,
      view: { x: 0, y: 0, scale: 1, rotation: 0 },
      entityCount: 2,
      entities: [
        {
          ref: { slot: 0, generation: 2 },
          id: 'rect-a',
          kind: 'rect',
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          rotation: 45,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 0,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 1, generation: 1 },
          id: 'dangling',
          kind: 'relation',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: false,
          zIndex: 0,
          tags: [],
          data: { from: 'rect-a', to: 'missing' },
        },
      ],
      selection: {
        revision: 1,
        refs: [{ slot: 0, generation: 1 }],
      },
    };

    const geometry = createCoreV2SurfaceGeometrySnapshot(snapshot);

    expect(geometry.relations).toEqual([]);
    expect(geometry.selectionOverlay).toBeNull();
    expect(geometry.entities[0]?.screenBounds[2]).toBeCloseTo(Math.sqrt(200), 9);
    expect(geometry.entities[0]?.screenBounds[3]).toBeCloseTo(Math.sqrt(200), 9);
  });
});
