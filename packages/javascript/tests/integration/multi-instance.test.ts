import { afterEach, describe, expect, it } from 'vitest';

import type { PatchMap } from '../../src/engine';
import { createPatchMapApi } from '../../src/public';
import { createEngine } from '../support/engine-update-transaction-surface';

describe('PatchMap independent instances', () => {
  const engines: PatchMap[] = [];
  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('isolates data selection history and destruction for identical target IDs', async () => {
    const first = await createEngine(engines, 'independent-first');
    const second = await createEngine(engines, 'independent-second');
    const a = createPatchMapApi(first.engine);
    const b = createPatchMapApi(second.engine);
    for (const map of [a, b]) {
      map.data.replace([{ type: 'rect', id: 'shared-id', size: 20 }], { fit: false });
    }
    const untouched = b.data.serialize();
    const history = b.history.state;
    expect(a.update({ id: 'shared-id', changes: { attrs: { x: 30 } } }).status).toBe('committed');
    expect(a.selection.set('shared-id')).toEqual(['shared-id']);
    expect(b.data.serialize()).toEqual(untouched);
    expect(b.selection.ids).toEqual([]);
    expect(b.history.state).toEqual(history);
    expect(a.history.undo()).toMatchObject({ status: 'committed', changed: true });
    expect(b.data.serialize()).toEqual(untouched);
    await first.engine.destroy();
    expect(b.update({ id: 'shared-id', changes: { attrs: { x: 50 } } }).status).toBe('committed');
    expect(JSON.parse(b.data.serialize())).toMatchObject([{ id: 'shared-id', attrs: { x: 50 } }]);
    expect(second.surface.destroyed).toBe(false);
  });
});
