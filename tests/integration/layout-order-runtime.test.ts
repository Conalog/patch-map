import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import catalogTypedCases from '../../contracts/evidence/catalog-typed-cases.v1.json';
import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_LAYOUT_ORDER_ACTIVE_CASE_IDS,
  PATCH_MAP_LAYOUT_ORDER_CLEANUP_REVISION,
  PATCH_MAP_LAYOUT_ORDER_EXTENSION_CASE_IDS,
  PATCH_MAP_LAYOUT_ORDER_RUNTIME_REVISION,
  createPatchMapLayoutOrderRuntime,
} from '../../lab/contract/layout-order-runtime';

type JsonRecord = Record<string, unknown>;

interface Lay002Params {
  readonly item: Readonly<{
    readonly size: readonly [number, number];
    readonly padding: Readonly<JsonRecord>;
  }>;
  readonly componentSize: readonly [number, number];
  readonly margin: Readonly<JsonRecord>;
  readonly placements: readonly string[];
  readonly declaredTargetIds: readonly string[];
  readonly placementMatrix: unknown;
}

interface Lay003Params {
  readonly siblings: readonly Readonly<{ readonly id: string; readonly zIndex: number }>[];
  readonly overlays: readonly string[];
}

const params = caseParams<Lay002Params>('LAY-002');
const stackingParams = caseParams<Lay003Params>('LAY-003');

describe('PatchMap layout-order runtime', () => {
  it('builds one detached direct PATCH MAP dataset from authored parameters only', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../lab/contract/layout-order-runtime.ts',
        import.meta.url,
      )),
      'utf8',
    );
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    const input = authoredRequest(params);
    const before = structuredClone(input);
    const dataset = runtime.product.createPlacementDataset(input);
    const item = requireRecord(dataset[0], 'dataset item');
    const components = requireArray(item.components, 'dataset components');

    expect(PATCH_MAP_LAYOUT_ORDER_ACTIVE_CASE_IDS).toEqual(['LAY-002', 'LAY-003']);
    expect(PATCH_MAP_LAYOUT_ORDER_EXTENSION_CASE_IDS).toEqual([]);
    expect(item).toMatchObject({
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      padding: { top: 7, right: 11, bottom: 13, left: 17 },
      attrs: { x: 10, y: 20 },
      contentOrientation: 'follow-item',
    });
    expect(components).toHaveLength(9);
    expect(components.map((component) => requireRecord(component, 'component').id)).toEqual(
      params.placements,
    );
    expect(components.every((component) => {
      const record = requireRecord(component, 'component');
      return record.type === 'bar'
        && JSON.stringify(record.size) === JSON.stringify({ width: 30, height: 10 })
        && JSON.stringify(record.margin) === JSON.stringify(params.margin);
    })).toBe(true);
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(components)).toBe(true);
    expect(input).toEqual(before);
    expect(JSON.stringify(dataset)).not.toContain('placementMatrix');
    expect(JSON.stringify(dataset)).not.toContain('placement-matrix-oracle-poison');
    expect(source).not.toContain('catalog-normalized');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
  });

  it('uses the explicit authored scene origin without a canonical offset fallback', () => {
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    const request = authoredRequest(params);
    const dataset = runtime.product.createPlacementDataset({
      ...request,
      sceneOrigin: { x: 73, y: -11 },
    });
    const item = requireRecord(dataset[0], 'dataset item');

    expect(item.attrs).toEqual({ x: 73, y: -11 });
    expect(() => createPatchMapLayoutOrderRuntime('LAY-002').product.createPlacementDataset({
      ...request,
      sceneOrigin: undefined,
    })).toThrow(/scene origin/u);
  });

  it('ignores an adjacent answer-shaped field because it never enters the adapter request', () => {
    const clean = structuredClone(params);
    const poisoned: Lay002Params = {
      ...structuredClone(params),
      placementMatrix: { poison: 'placement-matrix-oracle-poison' },
    };
    const cleanRuntime = createPatchMapLayoutOrderRuntime('LAY-002');
    const poisonedRuntime = createPatchMapLayoutOrderRuntime('LAY-002');

    const cleanDataset = cleanRuntime.product.createPlacementDataset(authoredRequest(clean));
    const poisonedDataset = poisonedRuntime.product.createPlacementDataset(authoredRequest(poisoned));

    expect(poisonedDataset).toEqual(cleanDataset);
    expect(JSON.stringify(poisonedDataset)).not.toContain('oracle-poison');
  });

  it('reports zero ownership and releases deterministically and idempotently', () => {
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    runtime.product.createPlacementDataset(authoredRequest(params));
    const active = runtime.product.resourceProbe({ caseId: 'LAY-002' });
    expect(active).toMatchObject({
      revision: PATCH_MAP_LAYOUT_ORDER_RUNTIME_REVISION,
      caseId: 'LAY-002',
      ownership: zeroOwnership(),
      stats: { datasetBuildCount: 1, resourceProbeCount: 1 },
    });

    const cleanup = runtime.postDestroyProductProbe();
    expect(cleanup).toMatchObject({
      revision: PATCH_MAP_LAYOUT_ORDER_CLEANUP_REVISION,
      caseId: 'LAY-002',
      runtimeCounts: zeroOwnership(),
      stats: { datasetBuildCount: 1, resourceProbeCount: 1 },
    });
    expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    expect(() => runtime.product.resourceProbe({ caseId: 'LAY-002' })).toThrow(/active runtime/u);
    expect(() => runtime.product.createPlacementDataset(authoredRequest(params))).toThrow(
      /active runtime/u,
    );
  });

  it('builds the LAY-003 stacking specimen in the same detached runtime family', () => {
    const runtime = createPatchMapLayoutOrderRuntime('LAY-003');
    const request = authoredStackingRequest(stackingParams);
    const before = structuredClone(request);
    const dataset = runtime.product.createStackingDataset(request);

    expect(dataset.map((entry) => requireRecord(entry, 'stacking entry').id)).toEqual([
      'low',
      'first',
      'second',
      'high',
    ]);
    expect(dataset.map((entry) => requireRecord(
      requireRecord(entry, 'stacking entry').attrs,
      'stacking attrs',
    ).zIndex)).toEqual([-1, 4, 4, 10]);
    expect(dataset.every((entry) => {
      const record = requireRecord(entry, 'stacking entry');
      return record.type === 'rect'
        && JSON.stringify(record.size) === JSON.stringify({ width: 20, height: 20 });
    })).toBe(true);
    expect(request).toEqual(before);
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(runtime.product.resourceProbe({ caseId: 'LAY-003' })).toMatchObject({
      caseId: 'LAY-003',
      ownership: zeroOwnership(),
      stats: {
        datasetBuildCount: 0,
        stackingDatasetBuildCount: 1,
        resourceProbeCount: 1,
      },
    });
    expect(() => runtime.product.createPlacementDataset(authoredRequest(params))).toThrow(
      /placement dataset belongs to LAY-002/u,
    );
    expect(runtime.postDestroyProductProbe()).toMatchObject({
      caseId: 'LAY-003',
      runtimeCounts: zeroOwnership(),
    });
  });

  it('rejects answer-shaped or malformed LAY-003 runtime input', () => {
    const request = authoredStackingRequest(stackingParams);

    expect(() => createPatchMapLayoutOrderRuntime('LAY-003').product.createStackingDataset({
      ...request,
      renderOrder: ['high', 'low'],
    })).toThrow(/unknown key renderOrder/u);
    expect(() => createPatchMapLayoutOrderRuntime('LAY-003').product.createStackingDataset({
      ...request,
      overlays: ['transformer', 'selection'],
    })).toThrow(/selection then transformer/u);
  });

  it('fails closed for unsupported placement dataset shapes', () => {
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    const request = authoredRequest(params);

    expect(() => runtime.product.createPlacementDataset({
      ...request,
      placements: [...request.placements, 'diagonal'],
    })).toThrow(/unsupported value/u);
    expect(() => runtime.product.createPlacementDataset({
      ...request,
      componentSize: [Number.NaN, 10],
    })).toThrow(/must be finite/u);
    expect(() => runtime.product.createPlacementDataset({
      ...request,
      extra: true,
    })).toThrow(/unknown key extra/u);
  });
});

function authoredRequest(
  value: Lay002Params,
): Readonly<JsonRecord> & { readonly placements: readonly string[] } {
  return {
    caseId: 'LAY-002',
    itemId: 'item',
    sceneOrigin: { x: 10, y: 20 },
    item: {
      size: structuredClone(value.item.size),
      padding: structuredClone(value.item.padding),
    },
    componentSize: structuredClone(value.componentSize),
    margin: structuredClone(value.margin),
    placements: structuredClone(value.placements),
  };
}

function authoredStackingRequest(value: Lay003Params): Readonly<JsonRecord> {
  return {
    caseId: 'LAY-003',
    siblings: structuredClone(value.siblings),
    overlays: structuredClone(value.overlays),
    specimen: {
      size: { width: 20, height: 20 },
      origin: { x: 0, y: 0 },
      fills: ['#111111ff', '#222222ff', '#333333ff', '#444444ff'],
    },
  };
}

function caseParams<T>(id: string): T {
  const cases = catalogTypedCases.cases as readonly Readonly<{
    id: string;
    fixture: Readonly<{ params: unknown }>;
  }>[];
  const selected = cases.find((entry) => entry.id === id);
  if (selected === undefined) throw new Error(`Missing approved case ${id}`);
  return selected.fixture.params as T;
}

function zeroOwnership(): Readonly<JsonRecord> {
  return {
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
  };
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${label}`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Missing ${label}`);
  return value;
}
