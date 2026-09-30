import { describe, expect, it } from 'vitest';

import { createPatchMapApi } from '../../src/public';
import { createHost } from './developer-api-host';

describe('PatchMap developer API updates', () => {
  it('lowers bar and icon concrete-cell presentation into one atomic columnar request', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack-grid.12.3'],
      bar: {
        componentId: 'usage',
        height: new Float32Array([64]),
        changes: {
          tint: ['#2563eb'],
          source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
          show: [true],
        },
      },
      icon: {
        componentId: 'status',
        changes: {
          show: [true],
          source: ['ess'],
          tint: ['#ef4444'],
        },
      },
    }, { animate: true })).toMatchObject({ status: 'committed', changed: true });

    expect(harness.lastInstanceRequest()).toEqual({
      bar: {
        targets: [{ id: 'rack-grid.12.3', componentId: 'usage' }],
        height: new Float32Array([64]),
        tint: ['#2563eb'],
        source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
        show: [true],
      },
      icon: {
        targets: [{ id: 'rack-grid.12.3', componentId: 'status' }],
        show: [true],
        source: ['ess'],
        tint: ['#ef4444'],
      },
      animate: true,
    });
  });

  it('commits mixed concrete animation policy with companion presentation atomically', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack-grid.12.3', 'rack-grid.12.4'],
      bar: {
        componentId: 'usage',
        height: new Float32Array([20, 80]),
        changes: { tint: ['#2563eb', '#22c55e'], show: [true, true] },
      },
      icon: {
        componentId: 'status',
        changes: { show: [false, true], source: ['warning', 'ess'] },
      },
    }, { animate: [false, true] })).toMatchObject({ status: 'committed', changed: true });

    expect(harness.lastInstanceRequest()).toEqual({
      bar: {
        targets: [
          { id: 'rack-grid.12.3', componentId: 'usage' },
          { id: 'rack-grid.12.4', componentId: 'usage' },
        ],
        height: new Float32Array([20, 80]),
        tint: ['#2563eb', '#22c55e'],
        show: [true, true],
      },
      icon: {
        targets: [
          { id: 'rack-grid.12.3', componentId: 'status' },
          { id: 'rack-grid.12.4', componentId: 'status' },
        ],
        show: [false, true],
        source: ['warning', 'ess'],
      },
      animate: true,
      animatedBarTargets: [{ id: 'rack-grid.12.4', componentId: 'usage' }],
    });
  });

  it('rejects malformed or meaningless batch animation columns before host commit', () => {
    const malformed = createHost();
    const malformedMap = createPatchMapApi(malformed.host);
    expect(() => malformedMap.updateBatch({
      targets: ['rack-grid.12.3', 'rack-grid.12.4'],
      bar: { componentId: 'usage', height: [20, 80] },
    }, { animate: [true] })).toThrow('options.animate column length must match 2 targets');
    expect(malformed.lastInstanceRequest()).toBeNull();

    const meaningless = createHost();
    const meaninglessMap = createPatchMapApi(meaningless.host);
    expect(() => meaninglessMap.updateBatch({
      targets: ['rack-grid.12.3', 'rack-grid.12.4'],
      icon: { componentId: 'status', changes: { show: [false, true] } },
    }, { animate: [false, true] })).toThrow(
      'options.animate columns require a direct bar-height batch',
    );
    expect(meaningless.lastInstanceRequest()).toBeNull();
  });

  it('lowers concrete background and text presentation without authored mutation', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.update({
      id: 'rack-grid.12.3',
      background: {
        componentId: 'surface',
        changes: {
          source: { type: 'rect', fill: '#0f172a', radius: 6 },
          tint: '#ffffff',
          show: true,
          attrs: { x: 2, alpha: 0.8 },
        },
      },
      text: {
        componentId: 'label',
        text: '83\n%',
        style: { fontSize: 18, align: 'center', fill: '#ffffff' },
        changes: {
          show: true,
          placement: 'center',
          margin: 4,
          tint: '#ffffff',
          split: 0,
          attrs: { y: 1 },
        },
      },
    })).toMatchObject({ status: 'committed', changed: true, appliedCount: 2 });

    expect(harness.lastInstanceRequest()).toEqual({
      background: {
        targets: [{ id: 'rack-grid.12.3', componentId: 'surface' }],
        changes: {
          source: [{ type: 'rect', fill: '#0f172a', radius: 6 }],
          tint: ['#ffffff'],
          show: [true],
          attrs: [{ x: 2, alpha: 0.8 }],
        },
      },
      text: {
        targets: [{ id: 'rack-grid.12.3', componentId: 'label' }],
        changes: {
          show: [true],
          placement: ['center'],
          margin: [4],
          tint: ['#ffffff'],
          split: [0],
          attrs: [{ y: 1 }],
        },
        text: ['83\n%'],
        style: [{ fontSize: 18, align: 'center', fill: '#ffffff' }],
      },
    });
  });

  it('validates concrete background and text batches before one atomic host commit', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack-grid.12.3', 'rack-grid.12.4'],
      background: {
        componentId: 'surface',
        changes: { source: ['#111827', '#172554'], show: [true, false] },
      },
      text: {
        componentId: 'label',
        text: ['83\n%', '41\n%'],
        style: [{ fontSize: 18 }, { fontSize: 14 }],
        changes: { margin: [4, 8], placement: ['center', 'right-bottom'] },
      },
    })).toMatchObject({ status: 'committed', changed: true, appliedCount: 4 });
    expect(harness.lastInstanceRequest()).toEqual({
      background: {
        targets: [
          { id: 'rack-grid.12.3', componentId: 'surface' },
          { id: 'rack-grid.12.4', componentId: 'surface' },
        ],
        changes: { source: ['#111827', '#172554'], show: [true, false] },
      },
      text: {
        targets: [
          { id: 'rack-grid.12.3', componentId: 'label' },
          { id: 'rack-grid.12.4', componentId: 'label' },
        ],
        changes: { margin: [4, 8], placement: ['center', 'right-bottom'] },
        text: ['83\n%', '41\n%'],
        style: [{ fontSize: 18 }, { fontSize: 14 }],
      },
    });

    expect(() => map.updateBatch({
      targets: ['rack-grid.12.3', 'rack-grid.12.4'],
      text: { componentId: 'label', text: ['only-one'] },
    })).toThrow('text.text column length must match 2 targets');
    expect(() => map.update({
      id: 'rack-grid.12.3',
      changes: { show: false },
      text: { componentId: 'label', text: 'mixed' },
    })).toThrow('does not support element changes');
    expect(() => map.update({
      id: 'rack-grid.12.3',
      text: { componentId: 'missing', text: 'missing' },
    })).toThrow('has no text component named missing');
  });

  it('rejects fields outside the concrete presentation contract before invoking the host', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.update({
      id: 'rack-grid.12.3',
      icon: { componentId: 'status', changes: { size: { width: 20 } } },
    })).toThrow('PATCH_MAP_GRID_INSTANCE_PRESENTATION_UNSUPPORTED');
    expect(harness.lastInstanceRequest()).toBeNull();
  });

  it('keeps the low-level ownerId translation behind the ergonomic bar API', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.update({
      id: 'rack',
      bar: { height: 44 },
    }, { actionId: 'refresh' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 1,
    });
    expect(harness.lastBarRequest()).toEqual({
      targets: [{ ownerId: 'rack', componentId: 'usage' }],
      heights: [44],
      actionId: 'refresh',
    });
  });

  it('requires componentId only when the component type is ambiguous', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.update({
      id: 'ambiguous',
      bar: { height: 44 },
    })).toThrow(
      'ambiguous has multiple bar components. Set bar.componentId to choose one.',
    );
    expect(map.update({
      id: 'ambiguous',
      bar: { componentId: 'secondary', height: 44 },
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastBarRequest()).toEqual({
      targets: [{ ownerId: 'ambiguous', componentId: 'secondary' }],
      heights: [44],
    });
  });

  it('rejects stale target sets instead of updating a new scene by accident', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const targets = map.targets.query({ type: 'bar', scope: 'instances' });
    harness.setReusable(false);

    expect(() => map.updateBatch({ targets, bar: { height: [30] } })).toThrow(
      'target set is stale; run targets.query() again after loading data',
    );
  });

  it('merges heterogeneous owner changes through one low-level atomic transaction', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.update({
      id: 'rack',
      changes: { attrs: { x: 40 } },
      bar: {
        changes: {
          size: { width: 88 },
          source: { fill: '#22c55e' },
        },
      },
      text: { text: '정상', style: { fill: '#ffffff' } },
    }, { actionId: 'refresh-rack' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 3,
    });

    expect(harness.lastTransactionRequest()).toEqual({
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rack' },
          changes: [{ path: ['attrs', 'x'], value: 40 }],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'usage' },
          changes: [
            { path: ['size', 'width'], value: 88 },
            { path: ['source', 'fill'], value: '#22c55e' },
          ],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'label' },
          changes: [
            { path: ['text'], value: '정상' },
            { path: ['style', 'fill'], value: '#ffffff' },
          ],
        },
      ],
      strict: true,
      actionId: 'refresh-rack',
    });
  });

  it('keeps columnar batches distinct from heterogeneous structural transactions', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack'],
      text: {
        text: ['점검 필요'],
        style: [{ fill: '#ef4444' }],
      },
    })).toMatchObject({ status: 'committed', appliedCount: 1 });
    expect(harness.lastTextRequest()).toEqual({
      targets: [{ ownerId: 'rack', componentId: 'label' }],
      texts: ['점검 필요'],
      styles: [{ fill: '#ef4444' }],
    });

    expect(map.transaction([
      {
        type: 'update',
        id: 'rack',
        bar: { changes: { source: { fill: '#f97316' } } },
      },
      { type: 'move', id: 'rack', parentId: null, index: 0 },
    ], {
      actionId: 'reorder-rack',
      selectedIds: ['rack'],
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastTransactionRequest()).toMatchObject({
      strict: true,
      actionId: 'reorder-rack',
      history: { selectedIds: ['rack'] },
      operations: [
        { op: 'merge', target: { kind: 'component', ownerId: 'rack', id: 'usage' } },
        { op: 'move', target: { kind: 'element', id: 'rack' }, parent: null, index: 0 },
      ],
    });
  });

  it('commits mixed authored-owner animation policy in one heterogeneous transaction', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.transaction([
      {
        type: 'update',
        id: 'rack',
        bar: { height: 28, changes: { source: { fill: '#2563eb' } } },
        text: { text: '즉시' },
      },
      {
        type: 'update',
        id: 'ambiguous',
        bar: {
          componentId: 'primary',
          height: 74,
          changes: { source: { fill: '#22c55e' } },
        },
      },
    ], {
      animate: [false, true],
      actionId: 'owner-live-state',
    })).toMatchObject({ status: 'committed', changed: true });

    expect(harness.lastTransactionRequest()).toMatchObject({
      strict: true,
      actionId: 'owner-live-state',
      animatedBarTargets: [{ ownerId: 'ambiguous', componentId: 'primary' }],
      operations: [
        { op: 'merge', target: { kind: 'component', ownerId: 'rack', id: 'usage' } },
        { op: 'merge', target: { kind: 'component', ownerId: 'rack', id: 'label' } },
        { op: 'merge', target: { kind: 'component', ownerId: 'ambiguous', id: 'primary' } },
      ],
    });
  });

  it('rejects a malformed transaction animation policy before lowering or commit', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    expect(() => map.transaction([
      { type: 'update', id: 'rack', bar: { height: 28 } },
      { type: 'update', id: 'ambiguous', bar: { componentId: 'primary', height: 74 } },
    ], { animate: [true] })).toThrow(
      'options.animate column length must match 2 targets',
    );
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('rejects malformed batch columns before committing any mutation', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { height: [20, 30] },
    })).toThrow('bar.height column length must match 1 targets');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('keeps non-hot-path bar fields behind component changes', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      bar: { fill: '#22c55e' },
    } as never)).toThrow('$.update.bar.fill is not a supported field');
    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { width: [92] },
    } as never)).toThrow('$.updateBatch.bar.width is not a supported field');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('keeps identity-bearing collections behind explicit structural transactions', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      changes: { components: [] },
    })).toThrow(
      'update() cannot change protected components; use transaction() for structural changes',
    );
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('reports mutation field typos instead of silently ignoring them', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      bar: { height: 40, colour: '#22c55e' },
    } as never)).toThrow('$.update.bar.colour is not a supported field');
    expect(() => map.updateBatch({
      targets: ['rack'],
      bars: { height: [40] },
    } as never)).toThrow('$.updateBatch.bars is not a supported field');
    expect(() => map.transaction([{
      type: 'reparent',
      id: 'rack',
    }] as never)).toThrow('$.transaction[0].type is not supported: reparent');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('rejects accessor-backed mutation envelopes without evaluating getters', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    let reads = 0;
    const input = { id: 'rack' } as Record<string, unknown>;
    Object.defineProperty(input, 'bar', {
      enumerable: true,
      get: () => {
        reads += 1;
        return { height: 40 };
      },
    });

    expect(() => map.update(input as never)).toThrow();
    expect(reads).toBe(0);
    expect(harness.lastBarRequest()).toBeNull();
  });

  it('rejects accessor-backed columns without evaluating them or committing', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    let reads = 0;
    const heights = { length: 1 };
    Object.defineProperty(heights, '0', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 20;
      },
    });

    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { height: heights as ArrayLike<number> },
    })).toThrow('bar.height[0] must be a present data property');
    expect(reads).toBe(0);
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('rejects accessor-backed concrete presentation column maps without evaluating them', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    let reads = 0;
    const changes = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(changes, 'source', {
      enumerable: true,
      get: () => {
        reads += 1;
        return ['#111827'];
      },
    });

    expect(() => map.updateBatch({
      targets: ['rack-grid.12.3'],
      background: { componentId: 'surface', changes },
    } as never)).toThrow('background.changes.source must be a data property');
    expect(reads).toBe(0);
    expect(harness.lastInstanceRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('lowers a heterogeneous columnar row into one strict commit', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack'],
      changes: { attrs: [{ x: 64 }] },
      bar: {
        changes: {
          size: [{ width: 92 }],
          source: [{ fill: '#16a34a' }],
        },
      },
      text: { text: ['가동'], style: [{ fill: '#f8fafc' }] },
    }, { actionId: 'columnar-rack' })).toMatchObject({
      status: 'committed',
      appliedCount: 3,
    });
    expect(harness.lastTransactionRequest()).toMatchObject({
      strict: true,
      actionId: 'columnar-rack',
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rack' },
          changes: [{ path: ['attrs', 'x'], value: 64 }],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'usage' },
          changes: [
            { path: ['size', 'width'], value: 92 },
            { path: ['source', 'fill'], value: '#16a34a' },
          ],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'label' },
          changes: [
            { path: ['text'], value: '가동' },
            { path: ['style', 'fill'], value: '#f8fafc' },
          ],
        },
      ],
    });
  });
});
