import { describe, expect, it } from 'vitest';

import type {
  EntityInput,
  SceneDocument,
} from '../../src/patch-map/dense/contracts';
import { NoopRenderer } from '../../src/patch-map/dense/noop-renderer';
import { PatchMapScene } from '../../src/patch-map/scene';

describe('PatchMapScene cooperative candidate load', () => {
  it('preserves authored slot order and logical revisions across bounded chunks', async () => {
    const document = sceneDocument(300, 100, 200);
    const scene = new PatchMapScene({
      initialCapacity: document.entities.length,
      renderer: new NoopRenderer(),
      historyLimit: 0,
      eventLimit: 0,
    });
    let boundaryCount = 0;

    const loaded = await scene.loadCooperatively(document, () => {
      boundaryCount += 1;
    });

    expect(boundaryCount).toBeGreaterThan(1);
    expect(loaded).toMatchObject({
      revision: 1,
      entityCount: document.entities.length,
      capacity: 512,
      changedRanges: [{ start: 0, end: document.entities.length }],
    });
    expect(scene.revision).toBe(1);
    expect(scene.snapshot()).toMatchObject({
      revision: 1,
      entityCount: document.entities.length,
      selection: { revision: 1, refs: [] },
    });
    expect(scene.snapshot().entities.map(({ id, ref }) => [id, ref.slot])).toEqual(
      document.entities.map(({ id }, slot) => [id, slot]),
    );

    const committed = scene.commit({
      operations: [{
        type: 'patch',
        target: 'rect-0',
        changes: { x: 42 },
      }],
    });
    expect(committed.revision).toBe(2);
    expect(scene.revision).toBe(2);
    expect(scene.snapshot()).toMatchObject({
      revision: 2,
      selection: { revision: 2 },
    });
    expect(scene.get('rect-0')?.bounds.x).toBe(42);
    expect(scene.destroy()).toBe(true);
  });

  it('falls back to one canonical load when preserving a forward relation exceeds the chunk cap', async () => {
    const document = sceneDocument(700, 1, 699);
    const scene = new PatchMapScene({
      initialCapacity: document.entities.length,
      renderer: new NoopRenderer(),
      eventLimit: 0,
    });
    let boundaryCount = 0;

    const loaded = await scene.loadCooperatively(document, () => {
      boundaryCount += 1;
    });

    expect(boundaryCount).toBe(0);
    expect(loaded).toMatchObject({
      revision: 1,
      entityCount: document.entities.length,
      capacity: 1024,
    });
    expect(scene.snapshot().entities.map(({ id, ref }) => [id, ref.slot])).toEqual(
      document.entities.map(({ id }, slot) => [id, slot]),
    );
    expect(scene.destroy()).toBe(true);
  });
});

function sceneDocument(
  rectCount: number,
  relationIndex: number,
  relationTargetIndex: number,
): SceneDocument {
  const entities: EntityInput[] = [];
  for (let index = 0; index < rectCount; index += 1) {
    if (index === relationIndex) {
      entities.push({
        kind: 'relation',
        id: 'relation-0',
        from: 'rect-0',
        to: `rect-${relationTargetIndex}`,
        color: 0x334455ff,
      });
    }
    entities.push({
      kind: 'rect',
      id: `rect-${index}`,
      x: index,
      y: index % 10,
      width: 10,
      height: 10,
      fill: 0x112233ff,
    });
  }
  return Object.freeze({
    version: 1,
    entities: Object.freeze(entities),
  });
}
