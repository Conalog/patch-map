import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface ObserverResult {
  readonly observation: Readonly<Record<string, unknown>>;
  readonly actualSemanticSha256: string;
  readonly actualObservationSha256: string;
}

interface AssertionFailure {
  readonly code: string;
  readonly path: string;
}

interface AssertionResult {
  readonly index: number;
  readonly path: string;
  readonly operator: string;
  readonly passed: boolean;
  readonly matches: number;
  readonly failure: AssertionFailure | null;
}

interface ComparisonResult {
  readonly assertions: readonly AssertionResult[];
  readonly passed: number;
  readonly failed: number;
  readonly firstFailure: AssertionResult | null;
  readonly stableActualSha256: string;
  readonly comparisonSha256: string;
}

interface ObserverRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: unknown }>,
  ): ObserverResult;
}

interface ComparatorRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: unknown;
      actual: unknown;
      fixtures?: Readonly<Record<string, unknown>>;
      captures?: Readonly<Record<string, unknown>>;
    }>,
  ): ComparisonResult;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [observerRuntime, comparatorRuntime] = await Promise.all([
  loadRuntime<ObserverRuntime>('../../scripts/verification/patch-map-contract/observe.mjs'),
  loadRuntime<ComparatorRuntime>('../../scripts/verification/patch-map-contract/compare.mjs'),
]);

const { createSemanticObservation } = observerRuntime;
const { compareObservation } = comparatorRuntime;

function actualObservation(): Record<string, unknown> {
  return {
    $schema: 'patch-map-semantic-observation/1',
    case: { params: { seed: 319 }, id: 'TST-001' },
    provenance: {
      expectedEvidenceOpaqueBinding: 'opaque-a',
      packedPackageSha256: 'package-a',
      codeCommit: 'commit-a',
    },
    environment: { browserVersion: 'Chrome 140', backend: 'webgl2' },
    revisions: { interaction: 0, scene: 1, view: 0 },
    scene: {
      identity: 'stable-id',
      order: ['item-a', 'rect-b'],
      nested: { owner: { id: 'item-a', kind: 'item' }, ignored: true },
    },
    geometry: { finite: 1.25 },
    text: { value: 'hello' },
    paint: { rgba: [255, 0, 0, 255] },
    interaction: { selected: ['rect-b'] },
    events: { ordered: ['down', 'up', 'click'] },
    history: { depth: 0 },
    accessibility: { invalidNodeCount: 0 },
    outcome: {
      status: 'ok',
      message: 'alpha beta gamma',
      identity: 'fixture-identity',
      nestedReference: { copy: 'fixture-identity' },
      matrix: [{ count: 1 }, { count: 1 }],
      emptyMatrix: [],
    },
    resources: {
      zero: 0,
      leaks: { listeners: 0, nested: { ticker: 0 }, texture: 1 },
      allZero: { listener: 0, nested: { ticker: 0 } },
    },
  };
}

function expectedCase(
  assertions: readonly Readonly<Record<string, unknown>>[],
  volatileFields: readonly string[] = [],
): Record<string, unknown> {
  return {
    id: 'TST-001',
    caseType: 'capability',
    expected: {
      assertions,
      observationDomains: ['scene', 'outcome', 'resources'],
      semanticObservationRevision: 'patch-map-semantic-observation/1',
      implementationNeutral: true,
    },
    volatileFields,
  };
}

describe('actual-only PatchMap semantic observer', () => {
  it('canonicalizes and hashes detached actual data without provenance in the semantic digest', () => {
    const input = actualObservation();
    const result = createSemanticObservation({ observation: input });
    const changedExecution = structuredClone(input);
    const provenance = changedExecution.provenance as Record<string, unknown>;
    const environment = changedExecution.environment as Record<string, unknown>;
    provenance.codeCommit = 'commit-b';
    provenance.expectedEvidenceOpaqueBinding = 'opaque-b';
    environment.browserVersion = 'Chrome 141';
    const changed = createSemanticObservation({ observation: changedExecution });

    expect(result.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.actualSemanticSha256).toBe(result.actualSemanticSha256);
    expect(changed.actualObservationSha256).not.toBe(result.actualObservationSha256);
    expect(Object.keys(result.observation)).toEqual([...Object.keys(input)].sort());
    expect(Object.isFrozen(result.observation)).toBe(true);
    expect(input).toEqual(actualObservation());
  });

  it('keeps versioned extensions outside the semantic digest but inside the actual digest', () => {
    const base = actualObservation();
    const withExtension = {
      ...base,
      extensions: { telemetry: { $schema: 'patch-map/telemetry/1', sample: 1 } },
    };
    const changedExtension = {
      ...base,
      extensions: { telemetry: { $schema: 'patch-map/telemetry/1', sample: 2 } },
    };
    const first = createSemanticObservation({ observation: withExtension });
    const second = createSemanticObservation({ observation: changedExtension });

    expect(second.actualSemanticSha256).toBe(first.actualSemanticSha256);
    expect(second.actualObservationSha256).not.toBe(first.actualObservationSha256);
  });

  it('rejects unknown keys, missing domains, extension collisions, and unversioned extensions', () => {
    expect(() => createSemanticObservation({
      observation: { ...actualObservation(), unknown: true },
    })).toThrow(/unknown top-level key/);

    const missing = actualObservation();
    delete missing.history;
    expect(() => createSemanticObservation({ observation: missing })).toThrow(/required domain history/);

    expect(() => createSemanticObservation({
      observation: {
        ...actualObservation(),
        extensions: { scene: { $schema: 'patch-map/scene-extension/1' } },
      },
    })).toThrow(/collides with observation field scene/);

    expect(() => createSemanticObservation({
      observation: {
        ...actualObservation(),
        extensions: { telemetry: { sample: 1 } },
      },
    })).toThrow(/versioned \$schema/);

    expect(() => createSemanticObservation({
      observation: {
        ...actualObservation(),
        extensions: {
          first: { $schema: 'patch-map/telemetry/1' },
          second: { $schema: 'patch-map/telemetry/1' },
        },
      },
    })).toThrow(/duplicate extension schema/);

    const sparse = actualObservation();
    const sparseArray: unknown[] = [];
    sparseArray.length = 1;
    (sparse.scene as Record<string, unknown>).order = sparseArray;
    expect(() => createSemanticObservation({ observation: sparse })).toThrow(/dense JSON array/);
  });

  it('keeps executor control sources behind the expected-evidence dependency firewall', async () => {
    const forbiddenStem = ['normalized', 'expected'].join('-');
    const controlSources = await Promise.all([
      '../../scripts/verification/patch-map-contract/observe.mjs',
      '../../scripts/verification/patch-map-contract/catalog.mjs',
      '../../scripts/verification/patch-map-contract/materialize.mjs',
      '../../scripts/verification/patch-map-contract/action-registry.mjs',
    ].map(async (relativePath) => readFile(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      'utf8',
    )));

    for (const source of controlSources) {
      expect(source).not.toContain(forbiddenStem);
      expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
    }
  });
});

describe('post-run PatchMap observation comparator', () => {
  it('evaluates the closed assertion language, references, and non-empty wildcards', () => {
    const expected = expectedCase([
      { path: '/outcome/status', operator: 'eq', value: 'ok' },
      { path: '/events/ordered', operator: 'orderedEq', value: ['down', 'up', 'click'] },
      { path: '/geometry/finite', operator: 'finite', value: true },
      { path: '/geometry/finite', operator: 'lte', value: 2 },
      { path: '/geometry/finite', operator: 'gte', value: 1 },
      { path: '/scene/identity', operator: 'unchanged', value: { $ref: '/captures/before/identity' } },
      { path: '/resources/zero', operator: 'zero', value: 0 },
      { path: '/outcome/message', operator: 'contains', value: 'beta' },
      { path: '/scene/order', operator: 'contains', value: ['rect-b'] },
      { path: '/scene/nested', operator: 'contains', value: { owner: { id: 'item-a' } } },
      { path: '/outcome/identity', operator: 'sameIdentity', value: { $ref: '/fixtures/identity' } },
      { path: '/resources/leaks', operator: 'noLeak', value: { listeners: 0, nested: { ticker: 0 } } },
      { path: '/resources/allZero', operator: 'noLeak' },
      { path: '/outcome/matrix[*]/count', operator: 'eq', value: 1 },
      {
        path: '/outcome/nestedReference',
        operator: 'eq',
        value: { copy: { $ref: '/fixtures/identity' } },
      },
    ]);
    const result = compareObservation({
      expectedCase: expected,
      actual: actualObservation(),
      fixtures: { identity: 'fixture-identity' },
      captures: { before: { identity: 'stable-id' } },
    });

    expect(result.assertions).toHaveLength(15);
    expect(result.passed).toBe(15);
    expect(result.failed).toBe(0);
    expect(result.firstFailure).toBeNull();
    expect(result.assertions.at(13)?.matches).toBe(2);
    expect(result.stableActualSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.comparisonSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves ordered failures for wrong types, unresolved paths, empty wildcards, refs, and leaks', () => {
    const expected = expectedCase([
      { path: '/outcome/status', operator: 'finite' },
      { path: '/outcome/missing', operator: 'eq', value: true },
      { path: '/outcome/emptyMatrix[*]/count', operator: 'eq', value: 1 },
      { path: '/outcome/status', operator: 'eq', value: { $ref: '/fixtures/missing' } },
      { path: '/resources/leaks', operator: 'noLeak', value: { texture: 0 } },
    ]);
    const result = compareObservation({ expectedCase: expected, actual: actualObservation() });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(5);
    expect(result.assertions.map((assertion) => assertion.failure?.code)).toEqual([
      'WRONG_OBSERVED_TYPE',
      'UNRESOLVED_PATH',
      'EMPTY_WILDCARD',
      'UNRESOLVED_PATH',
      'LEAK_NONZERO',
    ]);
    expect(result.assertions.map((assertion) => assertion.index)).toEqual([0, 1, 2, 3, 4]);
    expect(result.firstFailure?.failure?.code).toBe('WRONG_OBSERVED_TYPE');
  });

  it('masks exactly the expected record volatile fields in the stable digest', () => {
    const expected = expectedCase(
      [{ path: '/outcome/status', operator: 'eq', value: 'ok' }],
      ['provenance.codeCommit'],
    );
    const firstActual = actualObservation();
    const secondActual = structuredClone(firstActual);
    (secondActual.provenance as Record<string, unknown>).codeCommit = 'commit-b';
    const thirdActual = structuredClone(secondActual);
    (thirdActual.environment as Record<string, unknown>).browserVersion = 'Chrome 141';

    const first = compareObservation({ expectedCase: expected, actual: firstActual });
    const second = compareObservation({ expectedCase: expected, actual: secondActual });
    const third = compareObservation({ expectedCase: expected, actual: thirdActual });

    expect(second.stableActualSha256).toBe(first.stableActualSha256);
    expect(second.comparisonSha256).not.toBe(first.comparisonSha256);
    expect(third.stableActualSha256).not.toBe(first.stableActualSha256);
    expect(third.comparisonSha256).not.toBe(first.comparisonSha256);

    const fullyMaskedExpected = expectedCase(
      [{ path: '/outcome/status', operator: 'eq', value: 'ok' }],
      ['provenance.codeCommit', 'environment.browserVersion'],
    );
    const fullyMaskedFirst = compareObservation({
      expectedCase: fullyMaskedExpected,
      actual: firstActual,
    });
    const fullyMaskedThird = compareObservation({
      expectedCase: fullyMaskedExpected,
      actual: thirdActual,
    });
    expect(fullyMaskedThird.stableActualSha256).toBe(fullyMaskedFirst.stableActualSha256);
    expect(fullyMaskedThird.comparisonSha256).not.toBe(fullyMaskedFirst.comparisonSha256);
  });

  it('rejects malformed expected contracts and unresolved volatile declarations', () => {
    expect(() => compareObservation({
      expectedCase: expectedCase([{ path: '/outcome/status', operator: 'maybe', value: 'ok' }]),
      actual: actualObservation(),
    })).toThrow(/unknown operator/);

    expect(() => compareObservation({
      expectedCase: expectedCase([{ path: '/outcome/status', operator: 'orderedEq', value: 'ok' }]),
      actual: actualObservation(),
    })).toThrow(/orderedEq operand/);

    expect(() => compareObservation({
      expectedCase: expectedCase(
        [{ path: '/outcome/status', operator: 'eq', value: 'ok' }],
        ['environment.missing'],
      ),
      actual: actualObservation(),
    })).toThrow(/volatile field does not resolve/);

    const wrongCase = actualObservation();
    (wrongCase.case as Record<string, unknown>).id = 'TST-002';
    expect(() => compareObservation({
      expectedCase: expectedCase([{ path: '/outcome/status', operator: 'eq', value: 'ok' }]),
      actual: wrongCase,
    })).toThrow(/actual case ID/);

    const wrongExpectedBinding = actualObservation();
    (wrongExpectedBinding.provenance as Record<string, unknown>).expectedRecordSha256 = '0'.repeat(64);
    expect(() => compareObservation({
      expectedCase: expectedCase([{ path: '/outcome/status', operator: 'eq', value: 'ok' }]),
      actual: wrongExpectedBinding,
    })).toThrow(/bind the exact expected record/);
  });
});
