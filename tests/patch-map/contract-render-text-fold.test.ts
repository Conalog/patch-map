import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  fold,
  RENDER_TEXT_FOLD_REVISION,
  selectedCase,
} from './support/contract-render-text-fold-harness';
import {
  approvedExpectedCase,
  compareObservation,
} from './support/contract-render-text-fold-comparison';
import {
  itemTextExecution,
  standaloneExecution,
} from './support/contract-render-text-fold-fixtures';

describe('PatchMap REN-006 / REN-011 actual-only fold', () => {
  it('is browser-safe, import-free, and independent of answer evidence', async () => {
    const [source, actualSupport] = await Promise.all([
      readFile(fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-text.mjs',
        import.meta.url,
      )), 'utf8'),
      Promise.all([
        './support/contract-render-text-fold-harness.ts',
        './support/contract-render-text-fold-fixtures.ts',
        './support/contract-render-text-values.ts',
      ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
        .then((sources) => sources.join('\n')),
    ]);
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_TEXT_FOLD_REVISION).toBe('core-v2-render-text-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(/node:/u);
    expect(actualSupport).not.toContain(forbiddenEvidenceName);
    expect(actualSupport).not.toContain('compare.mjs');
  });

  it('matches the immutable approved REN-006 and REN-011 catalogs exactly', () => {
    const cases = [
      ['REN-006', standaloneExecution(), 30],
      ['REN-011', itemTextExecution(), 20],
    ] as const;
    for (const [caseId, execution, count] of cases) {
      const folded = fold(selectedCase(caseId), execution);
      const comparison = compareObservation({
        expectedCase: approvedExpectedCase(caseId),
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });
      const failures = comparison.assertions.filter(({ passed }) => !passed);
      expect(comparison, JSON.stringify(failures)).toMatchObject({ passed: count, failed: 0 });
      expect(comparison.assertions.every(({ passed, failure }) => passed && failure === null))
        .toBe(true);
    }
  });
});
