import { readFile } from 'node:fs/promises';

import { invariant } from './assertions.mjs';
import {
  DECLARED_IMMUTABLE_CONFLICT_TOTAL,
  EXPECTED_ASSERTION_FAILURE_TOTAL,
  EXPECTED_ASSERTION_PASS_TOTAL,
  EXPECTED_ASSERTION_TOTAL,
  EXPECTED_PERFORMANCE_DEFICIT_TOTAL,
  RENDER_CASES,
} from './catalog.mjs';

export async function loadExpectedCases(expectedPath) {
  const document = JSON.parse(await readFile(expectedPath, 'utf8'));
  invariant(Array.isArray(document.cases), 'normalized expected cases array');
  const selected = new Map();
  for (const caseSpec of RENDER_CASES) {
    const expectedCase = document.cases.find((record) => record?.id === caseSpec.id);
    invariant(expectedCase !== undefined, `${caseSpec.id} normalized expected record`);
    invariant(
      expectedCase.expected?.assertions?.length === caseSpec.expectedAssertions,
      `${caseSpec.id} normalized expected assertion count`,
    );
    selected.set(caseSpec.id, expectedCase);
  }
  invariant(
    sum(RENDER_CASES, (record) => record.expectedAssertions) === EXPECTED_ASSERTION_TOTAL,
    'render checkpoint assertion inventory must remain 1991',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedFailures?.length ?? 0) ===
      EXPECTED_ASSERTION_FAILURE_TOTAL,
    'render checkpoint observed immutable conflict inventory must remain 26',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedDeficits?.length ?? 0) ===
      EXPECTED_PERFORMANCE_DEFICIT_TOTAL,
    'render checkpoint measured performance deficit inventory must remain 14',
  );
  invariant(
    EXPECTED_ASSERTION_TOTAL
      - EXPECTED_ASSERTION_FAILURE_TOTAL
      - EXPECTED_PERFORMANCE_DEFICIT_TOTAL
      === EXPECTED_ASSERTION_PASS_TOTAL,
    'render checkpoint passing assertion inventory must remain 1951',
  );
  invariant(
    sum(
      RENDER_CASES,
      (record) => (record.expectedFailures?.length ?? 0) + (record.latentConflicts?.length ?? 0),
    ) === DECLARED_IMMUTABLE_CONFLICT_TOTAL,
    'render checkpoint declared immutable conflict inventory must remain 28',
  );
  return selected;
}
function sum(records, select) {
  return records.reduce((total, record) => total + select(record), 0);
}
