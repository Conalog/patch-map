import normalizedExpectedCatalog from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';

import type { JsonRecord } from './contract-render-text-values';

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly operator: string;
      readonly value?: unknown;
    }>[];
  }>;
  readonly volatileFields: readonly string[];
}

interface CompareResult {
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
    readonly failure: Readonly<{ readonly code: string }> | null;
  }>[];
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: ExpectedCase;
      actual: Readonly<JsonRecord>;
      fixtures: Readonly<JsonRecord>;
      captures: Readonly<JsonRecord>;
    }>,
  ): CompareResult;
}

const compareRuntime: CompareRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../../scripts/verification/core-v2-contract/compare.mjs',
    import.meta.url,
  ).href
) as CompareRuntime;

export const { compareObservation } = compareRuntime;

export function approvedExpectedCase(caseId: 'REN-006' | 'REN-011'): ExpectedCase {
  const record = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find((candidate) => candidate.id === caseId);
  if (!record) throw new Error(`Missing approved expected ${caseId}`);
  return record;
}
