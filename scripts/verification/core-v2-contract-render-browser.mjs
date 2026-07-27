#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { compareObservation } from './core-v2-contract/compare.mjs';
import { maskVolatile } from './core-v2-contract/evidence.mjs';
import { inspectCoreV2UpdateConflictActuals } from './core-v2-contract/update-conflict-actuals.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EXPECTED_PATH = fileURLToPath(new URL(
  '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
  import.meta.url,
));
const VITE_CONFIG_PATH = path.join(ROOT, 'vite.core-v2-lab.config.ts');
const BRIDGE_NAME = '__PATCH_MAP_CORE_V2_CONTRACT_LAB__';
const GPU_PROBE_NAME = '__PATCH_MAP_CORE_V2_WEBGL_PROBE__';
const DATASET_SIZE = '100';
const SEED = 319;
const EXPECTED_ASSERTION_TOTAL = 1_821;
const EXPECTED_ASSERTION_PASS_TOTAL = 1_800;
const EXPECTED_ASSERTION_FAILURE_TOTAL = 21;
const DECLARED_IMMUTABLE_CONFLICT_TOTAL = 23;
const CASE_TIMEOUT_MS = 180_000;
const CHECKPOINT_TIMEOUT_MS = 30 * 60_000;
const REN_005_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/resources/images/alias',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/alias',
  }),
  Object.freeze({
    path: '/resources/images/data-uri',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/data-uri',
  }),
  Object.freeze({
    path: '/resources/images/url',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/url',
  }),
]);
const ANI_002_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/backwardTime/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/backwardTime/code',
  }),
]);
const UPD_003_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/invalidCrossScope/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/invalidCrossScope/code',
  }),
]);
const UPD_007_LATENT_IMMUTABLE_CONFLICTS = Object.freeze([
  Object.freeze({
    path: '/outcome/valid/queryRevision',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/valid/queryRevision',
  }),
  Object.freeze({
    path: '/outcome/valid/eventRevision',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/valid/eventRevision',
  }),
]);
const UPD_009_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/cycle/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/cycle/code',
  }),
]);
const QRY_001_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/queries/ambiguous-component/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/queries/ambiguous-component/code',
  }),
]);
const EVT_003_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/interaction/overlapRedrawTrace',
    code: 'VALUE_MISMATCH',
    failurePath: '/interaction/overlapRedrawTrace',
  }),
]);
const EVT_008_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/events/clickCounts',
    code: 'VALUE_MISMATCH',
    failurePath: '/events/clickCounts',
  }),
]);
const CSM_022_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/geometry/targets/item-a/worldBounds/x',
    code: 'VALUE_MISMATCH',
    failurePath: '/geometry/targets/item-a/worldBounds/x',
  }),
  Object.freeze({
    path: '/geometry/targets/rect-b/worldBounds/x',
    code: 'VALUE_MISMATCH',
    failurePath: '/geometry/targets/rect-b/worldBounds/x',
  }),
  Object.freeze({
    path: '/outcome/hostEngineSeam/failureRollback/conflictCode',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/failureRollback/conflictCode',
  }),
]);
const CSM_024_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/interaction/hitTarget',
    code: 'VALUE_MISMATCH',
    failurePath: '/interaction/hitTarget',
  }),
  Object.freeze({
    path: '/outcome/hostEngineSeam/engineReturns/transformedHitTarget',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/engineReturns/transformedHitTarget',
  }),
]);
const CSM_028_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/hostEngineSeam/engineReturns/firstDistributionHash',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/engineReturns/firstDistributionHash',
  }),
  Object.freeze({
    path: '/outcome/hostEngineSeam/engineReturns/secondDistributionHash',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/engineReturns/secondDistributionHash',
  }),
]);
const CSM_030_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/hostEngineSeam/engineReturns/movedTarget',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/engineReturns/movedTarget',
  }),
  Object.freeze({
    path: '/outcome/hostEngineSeam/engineReturns/parentId',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/engineReturns/parentId',
  }),
  Object.freeze({
    path: '/outcome/hostEngineSeam/finalState/parentById/rect-b',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/hostEngineSeam/finalState/parentById/rect-b',
  }),
  Object.freeze({
    path: '/scene/targets/rect-b/parentId',
    code: 'VALUE_MISMATCH',
    failurePath: '/scene/targets/rect-b/parentId',
  }),
]);
const AST_002_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/validation/cyclic/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/validation/cyclic/code',
  }),
]);
const RENDER_CASES = Object.freeze([
  Object.freeze({ id: 'LAY-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'LAY-002', expectedAssertions: 28 }),
  Object.freeze({ id: 'LAY-003', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-004', expectedAssertions: 10 }),
  Object.freeze({
    id: 'REN-005',
    expectedAssertions: 28,
    expectedFailures: REN_005_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'REN-006', expectedAssertions: 30 }),
  Object.freeze({ id: 'REN-003', expectedAssertions: 12 }),
  Object.freeze({ id: 'REN-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'LAY-005', expectedAssertions: 14 }),
  Object.freeze({ id: 'LAY-004', expectedAssertions: 11 }),
  Object.freeze({ id: 'REN-007', expectedAssertions: 26 }),
  Object.freeze({ id: 'REN-008', expectedAssertions: 10 }),
  Object.freeze({ id: 'REN-009', expectedAssertions: 13 }),
  Object.freeze({ id: 'REN-010', expectedAssertions: 11 }),
  Object.freeze({ id: 'REN-011', expectedAssertions: 20 }),
  Object.freeze({ id: 'ERR-001', expectedAssertions: 6 }),
  Object.freeze({ id: 'UPD-001', expectedAssertions: 8 }),
  Object.freeze({ id: 'UPD-002', expectedAssertions: 11 }),
  Object.freeze({
    id: 'UPD-003',
    expectedAssertions: 13,
    expectedFailures: UPD_003_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'UPD-004', expectedAssertions: 12 }),
  Object.freeze({ id: 'UPD-005', expectedAssertions: 10 }),
  Object.freeze({ id: 'UPD-006', expectedAssertions: 11 }),
  Object.freeze({
    id: 'UPD-007',
    expectedAssertions: 15,
    latentConflicts: UPD_007_LATENT_IMMUTABLE_CONFLICTS,
  }),
  Object.freeze({ id: 'UPD-008', expectedAssertions: 13 }),
  Object.freeze({
    id: 'UPD-009',
    expectedAssertions: 14,
    expectedFailures: UPD_009_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'UPD-010', expectedAssertions: 12 }),
  Object.freeze({ id: 'UPD-011', expectedAssertions: 10 }),
  Object.freeze({ id: 'UPD-012', expectedAssertions: 10 }),
  Object.freeze({ id: 'ANI-001', expectedAssertions: 14 }),
  Object.freeze({
    id: 'ANI-002',
    expectedAssertions: 11,
    expectedFailures: ANI_002_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'ANI-003', expectedAssertions: 14 }),
  Object.freeze({ id: 'UPD-013', expectedAssertions: 8 }),
  Object.freeze({ id: 'UPD-014', expectedAssertions: 10 }),
  Object.freeze({ id: 'CSM-005', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-006', expectedAssertions: 22 }),
  Object.freeze({ id: 'CSM-007', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-008', expectedAssertions: 19 }),
  Object.freeze({
    id: 'QRY-001',
    expectedAssertions: 13,
    expectedFailures: QRY_001_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'QRY-002', expectedAssertions: 10 }),
  Object.freeze({ id: 'SEL-001', expectedAssertions: 10 }),
  Object.freeze({ id: 'SEL-002', expectedAssertions: 11 }),
  Object.freeze({ id: 'SEL-003', expectedAssertions: 7 }),
  Object.freeze({ id: 'SEL-004', expectedAssertions: 4 }),
  Object.freeze({ id: 'EVT-001', expectedAssertions: 40 }),
  Object.freeze({ id: 'EVT-002', expectedAssertions: 10 }),
  Object.freeze({
    id: 'EVT-003',
    expectedAssertions: 7,
    expectedFailures: EVT_003_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'EVT-004', expectedAssertions: 8 }),
  Object.freeze({ id: 'EVT-005', expectedAssertions: 7 }),
  Object.freeze({ id: 'EVT-006', expectedAssertions: 24 }),
  Object.freeze({ id: 'EVT-007', expectedAssertions: 8 }),
  Object.freeze({
    id: 'EVT-008',
    expectedAssertions: 7,
    expectedFailures: EVT_008_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'EVT-009', expectedAssertions: 7 }),
  Object.freeze({ id: 'SEL-005', expectedAssertions: 9 }),
  Object.freeze({ id: 'SEL-006', expectedAssertions: 9 }),
  Object.freeze({ id: 'SEL-007', expectedAssertions: 10 }),
  Object.freeze({ id: 'SEL-008', expectedAssertions: 9 }),
  Object.freeze({ id: 'SEL-009', expectedAssertions: 13 }),
  Object.freeze({ id: 'HIS-001', expectedAssertions: 13 }),
  Object.freeze({ id: 'HIS-002', expectedAssertions: 11 }),
  Object.freeze({ id: 'HIS-003', expectedAssertions: 8 }),
  Object.freeze({ id: 'HIS-004', expectedAssertions: 6 }),
  Object.freeze({ id: 'HIS-005', expectedAssertions: 11 }),
  Object.freeze({ id: 'HIS-006', expectedAssertions: 13 }),
  Object.freeze({ id: 'VIE-001', expectedAssertions: 10 }),
  Object.freeze({ id: 'VIE-002', expectedAssertions: 6 }),
  Object.freeze({ id: 'VIE-003', expectedAssertions: 14 }),
  Object.freeze({ id: 'VIE-004', expectedAssertions: 17 }),
  Object.freeze({ id: 'VIE-005', expectedAssertions: 6 }),
  Object.freeze({ id: 'VIE-006', expectedAssertions: 11 }),
  Object.freeze({ id: 'VIE-007', expectedAssertions: 8 }),
  Object.freeze({ id: 'VIE-008', expectedAssertions: 11 }),
  Object.freeze({ id: 'TRN-001', expectedAssertions: 7 }),
  Object.freeze({ id: 'TRN-002', expectedAssertions: 6 }),
  Object.freeze({ id: 'TRN-003', expectedAssertions: 9 }),
  Object.freeze({ id: 'TRN-004', expectedAssertions: 16 }),
  Object.freeze({ id: 'TRN-005', expectedAssertions: 11 }),
  Object.freeze({ id: 'TRN-006', expectedAssertions: 13 }),
  Object.freeze({ id: 'TRN-007', expectedAssertions: 8 }),
  Object.freeze({ id: 'TRN-008', expectedAssertions: 10 }),
  Object.freeze({ id: 'TRN-009', expectedAssertions: 12 }),
  Object.freeze({ id: 'TRN-010', expectedAssertions: 7 }),
  Object.freeze({ id: 'CSM-009', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-010', expectedAssertions: 22 }),
  Object.freeze({ id: 'CSM-011', expectedAssertions: 17 }),
  Object.freeze({ id: 'CSM-012', expectedAssertions: 19 }),
  Object.freeze({ id: 'CSM-013', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-014', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-015', expectedAssertions: 19 }),
  Object.freeze({ id: 'CSM-016', expectedAssertions: 19 }),
  Object.freeze({ id: 'CSM-018', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-020', expectedAssertions: 18 }),
  Object.freeze({ id: 'CSM-021', expectedAssertions: 19 }),
  Object.freeze({
    id: 'CSM-022',
    expectedAssertions: 20,
    expectedFailures: CSM_022_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'CSM-023', expectedAssertions: 21 }),
  Object.freeze({
    id: 'CSM-024',
    expectedAssertions: 20,
    expectedFailures: CSM_024_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'CSM-025', expectedAssertions: 22 }),
  Object.freeze({ id: 'CSM-026', expectedAssertions: 19 }),
  Object.freeze({ id: 'CSM-027', expectedAssertions: 26 }),
  Object.freeze({ id: 'CSM-019', expectedAssertions: 21 }),
  Object.freeze({
    id: 'CSM-028',
    expectedAssertions: 18,
    expectedFailures: CSM_028_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'CSM-029', expectedAssertions: 24 }),
  Object.freeze({
    id: 'CSM-030',
    expectedAssertions: 21,
    expectedFailures: CSM_030_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'CSM-031', expectedAssertions: 25 }),
  Object.freeze({ id: 'ERR-002', expectedAssertions: 10 }),
  Object.freeze({ id: 'ERR-004', expectedAssertions: 12 }),
  Object.freeze({ id: 'ERR-005', expectedAssertions: 6 }),
  Object.freeze({ id: 'ERR-006', expectedAssertions: 6 }),
  Object.freeze({ id: 'PRF-007', expectedAssertions: 9 }),
  Object.freeze({ id: 'LIF-003', expectedAssertions: 19 }),
  Object.freeze({ id: 'CSM-002', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-004', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-017', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-036', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-037', expectedAssertions: 23 }),
  Object.freeze({ id: 'DET-001', expectedAssertions: 4 }),
  Object.freeze({ id: 'DET-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'DET-003', expectedAssertions: 5 }),
  Object.freeze({ id: 'DET-004', expectedAssertions: 5 }),
  Object.freeze({ id: 'PRF-008', expectedAssertions: 7 }),
  Object.freeze({ id: 'PIX-004', expectedAssertions: 6 }),
  Object.freeze({ id: 'CSM-035', expectedAssertions: 25 }),
  Object.freeze({ id: 'CSM-038', expectedAssertions: 27 }),
  Object.freeze({ id: 'ERR-003', expectedAssertions: 6 }),
  Object.freeze({
    id: 'AST-002',
    expectedAssertions: 9,
    expectedFailures: AST_002_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'AST-003', expectedAssertions: 10 }),
  Object.freeze({ id: 'SEC-001', expectedAssertions: 7 }),
  Object.freeze({ id: 'CSM-032', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-033', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-034', expectedAssertions: 23 }),
  Object.freeze({ id: 'LIF-006', expectedAssertions: 17 }),
]);
const FOCUSED_UI_CASES = new Set(['REN-005', 'REN-006', 'REN-008', 'REN-010', 'REN-011']);
const PRESENTATION_TRANCHE_CASES = new Set([
  'LAY-002',
  'LAY-003',
  'UPD-005',
  'REN-009',
  'ANI-001',
  'ANI-002',
]);
const UPDATE_TRANSACTION_TRANCHE_CASES = new Set([
  'ERR-001',
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'UPD-013',
  'UPD-014',
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
]);
const VIEWPORT_TRANCHE_CASES = new Set([
  'VIE-001',
  'VIE-002',
  'VIE-003',
  'VIE-004',
  'VIE-005',
  'VIE-006',
  'VIE-007',
  'VIE-008',
  'CSM-009',
  'CSM-010',
]);
const QUERY_SELECTION_TRANCHE_CASES = new Set([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
]);
const POINTER_SELECTION_TRANCHE_CASES = new Set([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-008',
  'SEL-005',
  'SEL-006',
  'SEL-007',
  'SEL-009',
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
  'TRN-010',
  'CSM-011',
  'CSM-012',
  'CSM-015',
  'CSM-016',
  'CSM-020',
  'CSM-021',
]);
const INTERACTION_EDITOR_TRANCHE_CASES = new Set([
  'CSM-013',
  'CSM-018',
  'CSM-022',
  'CSM-023',
  'CSM-024',
]);
const AUTHORING_TRANCHE_CASES = new Set([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
]);
const EDITOR_WORKFLOW_TRANCHE_CASES = new Set([
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-033',
  'CSM-034',
]);
const HISTORY_TRANCHE_CASES = new Set([
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
]);
const REPLACEMENT_RECOVERY_TRANCHE_CASES = new Set([
  'ERR-002',
  'ERR-005',
  'LIF-003',
  'CSM-002',
  'CSM-004',
  'CSM-037',
]);
const LIFECYCLE_INTERRUPTION_TRANCHE_CASES = new Set([
  'ERR-004',
  'ERR-006',
  'PRF-007',
  'CSM-017',
  'CSM-036',
]);
const DETERMINISM_LIFECYCLE_TRANCHE_CASES = new Set([
  'DET-001',
  'DET-002',
  'DET-003',
  'ANI-003',
  'LIF-006',
]);
const EXPORT_EXTRACTION_TRANCHE_CASES = new Set([
  'DET-004',
  'PIX-004',
  'PRF-008',
  'CSM-035',
  'CSM-038',
]);
const CONTROL_CASES = new Set([
  ...PRESENTATION_TRANCHE_CASES,
  ...UPDATE_TRANSACTION_TRANCHE_CASES,
  ...VIEWPORT_TRANCHE_CASES,
  ...QUERY_SELECTION_TRANCHE_CASES,
  ...POINTER_SELECTION_TRANCHE_CASES,
  ...INTERACTION_EDITOR_TRANCHE_CASES,
  ...AUTHORING_TRANCHE_CASES,
  ...EDITOR_WORKFLOW_TRANCHE_CASES,
  ...HISTORY_TRANCHE_CASES,
  ...REPLACEMENT_RECOVERY_TRANCHE_CASES,
  ...LIFECYCLE_INTERRUPTION_TRANCHE_CASES,
  ...DETERMINISM_LIFECYCLE_TRANCHE_CASES,
  ...EXPORT_EXTRACTION_TRANCHE_CASES,
]);
const DOM_CONTROL_CASES = new Set([...FOCUSED_UI_CASES, ...CONTROL_CASES]);
const GPU_EVIDENCE_CASES = new Set([
  'LAY-003',
  'REN-009',
  'ANI-001',
  'ANI-002',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'LIF-003',
  'CSM-037',
  ...DETERMINISM_LIFECYCLE_TRANCHE_CASES,
  ...AUTHORING_TRANCHE_CASES,
  ...EDITOR_WORKFLOW_TRANCHE_CASES,
]);

const options = parseArguments(process.argv.slice(2));
const headed = options.headed;
const selectedRenderCases = options.caseId === null
  ? RENDER_CASES
  : RENDER_CASES.filter((record) => record.id === options.caseId);
invariant(selectedRenderCases.length > 0, `unknown render case ${String(options.caseId)}`);
const selectedAssertionTotal = sum(selectedRenderCases, (record) => record.expectedAssertions);
const selectedObservedConflictTotal = sum(
  selectedRenderCases,
  (record) => record.expectedFailures?.length ?? 0,
);
const selectedDeclaredConflictTotal = sum(
  selectedRenderCases,
  (record) => (record.expectedFailures?.length ?? 0) + (record.latentConflicts?.length ?? 0),
);
const errors = { console: [], page: [], network: [], externalFixture: [] };
const report = {
  $schema: 'core-v2-contract-render-browser-checkpoint/1',
  status: 'failed',
  headed,
  scope: options.caseId === null ? 'full' : 'case',
  selectedCase: options.caseId,
  routeParams: { size: DATASET_SIZE, seed: SEED },
  activeCase: null,
  cases: [],
  assertions: {
    expected: selectedAssertionTotal,
    passed: 0,
    failed: selectedAssertionTotal,
    repeatPassed: 0,
    repeatFailed: selectedAssertionTotal,
    freshPassed: 0,
    freshFailed: selectedAssertionTotal,
  },
  conflicts: {
    declared: selectedDeclaredConflictTotal,
    observed: selectedObservedConflictTotal,
    latent: selectedDeclaredConflictTotal - selectedObservedConflictTotal,
    latentCases: selectedRenderCases
      .filter((record) => (record.latentConflicts?.length ?? 0) > 0)
      .map((record) => record.id),
  },
  errors,
  browser: null,
  failure: null,
};

let server = null;
let browser = null;
let lastFocusedUi = null;
let cleanupPromise = null;
let shutdownReason = null;

const checkpointDeadline = setTimeout(() => {
  requestShutdown('checkpoint-timeout');
}, CHECKPOINT_TIMEOUT_MS);
checkpointDeadline.unref();
const onInterrupt = () => requestShutdown('SIGINT');
const onTerminate = () => requestShutdown('SIGTERM');
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);

try {
  const expectedCases = await loadExpectedCases();
  server = await createServer({
    root: ROOT,
    configFile: VITE_CONFIG_PATH,
    logLevel: 'silent',
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  invariant(typeof baseUrl === 'string', 'Vite did not expose the Core v2 Lab URL');

  browser = await chromium.launch({
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    headless: !headed,
  });
  report.browser = {
    name: 'Chromium',
    version: browser.version(),
    platform: process.platform,
  };

  for (const caseSpec of selectedRenderCases) {
    report.activeCase = caseSpec.id;
    process.stderr.write(`[core-v2-render-browser] ${caseSpec.id} start\n`);
    const expectedCase = expectedCases.get(caseSpec.id);
    invariant(expectedCase !== undefined, `${caseSpec.id} normalized expected record is missing`);
    const caseReport = await withTimeout(
      executeCase({
        browser,
        baseUrl,
        caseSpec,
        expectedCase,
        errors,
      }),
      CASE_TIMEOUT_MS,
      `${caseSpec.id} first/repeat/fresh execution`,
    );
    report.cases.push(caseReport);
    process.stderr.write(`[core-v2-render-browser] ${caseSpec.id} complete\n`);
  }
  report.activeCase = null;

  const passed = sum(report.cases, (record) => record.comparison.passed);
  const failed = sum(report.cases, (record) => record.comparison.failed);
  const repeatPassed = sum(report.cases, (record) => record.repeatComparison.passed);
  const repeatFailed = sum(report.cases, (record) => record.repeatComparison.failed);
  const freshPassed = sum(report.cases, (record) => record.freshComparison.passed);
  const freshFailed = sum(report.cases, (record) => record.freshComparison.failed);
  report.assertions = {
    expected: selectedAssertionTotal,
    passed,
    failed,
    repeatPassed,
    repeatFailed,
    freshPassed,
    freshFailed,
  };

  invariant(
    report.cases.length === selectedRenderCases.length,
    options.caseId === null
      ? 'all one-hundred-thirty-one render routes completed'
      : `${options.caseId} targeted render route completed`,
  );
  invariant(
    passed === selectedAssertionTotal - selectedObservedConflictTotal
      && failed === selectedObservedConflictTotal,
    options.caseId === null
      ? 'canonical comparison must be exactly 1800 pass and 21 observed immutable conflicts'
      : `${options.caseId} targeted canonical comparison`,
  );
  invariant(
    repeatPassed === selectedAssertionTotal - selectedObservedConflictTotal
      && repeatFailed === selectedObservedConflictTotal,
    options.caseId === null
      ? 'repeat comparison must be exactly 1800 pass and 21 observed immutable conflicts'
      : `${options.caseId} targeted repeat comparison`,
  );
  invariant(
    freshPassed === selectedAssertionTotal - selectedObservedConflictTotal
      && freshFailed === selectedObservedConflictTotal,
    options.caseId === null
      ? 'fresh comparison must be exactly 1800 pass and 21 observed immutable conflicts'
      : `${options.caseId} targeted fresh comparison`,
  );
  invariant(errors.console.length === 0, 'console error count must be zero');
  invariant(errors.page.length === 0, 'page error count must be zero');
  invariant(errors.network.length === 0, 'network error count must be zero');
  invariant(errors.externalFixture.length === 0, 'external fixture request count must be zero');
  report.status = 'pass';
} catch (error) {
  if (report.failure === null) {
    report.failure = {
      ...serializeError(error),
      focusedUi: lastFocusedUi,
    };
  }
  if (shutdownReason === null) process.exitCode = 1;
} finally {
  clearTimeout(checkpointDeadline);
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  await closeOwnedResources();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function requestShutdown(reason) {
  if (shutdownReason !== null) return;
  shutdownReason = reason;
  report.failure = {
    name: 'AbortError',
    message: `Core v2 render browser checkpoint stopped: ${reason}`,
    stack: null,
    focusedUi: lastFocusedUi,
  };
  process.exitCode = reason === 'SIGINT' ? 130 : reason === 'SIGTERM' ? 143 : 1;
  process.stderr.write(`[core-v2-render-browser] stopping: ${reason}\n`);
  void closeOwnedResources();
}

function closeOwnedResources() {
  if (cleanupPromise !== null) return cleanupPromise;
  cleanupPromise = (async () => {
    const ownedBrowser = browser;
    const ownedServer = server;
    browser = null;
    server = null;
    if (ownedBrowser) await ownedBrowser.close().catch(() => undefined);
    if (ownedServer) await ownedServer.close().catch(() => undefined);
  })();
  return cleanupPromise;
}

async function installWebGlCanvasProbe(page, caseId) {
  if (!GPU_EVIDENCE_CASES.has(caseId)) return;
  await page.addInitScript(({ probeName, caseIdentity }) => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const contextMetadata = new WeakMap();
    const instrumentedContexts = new WeakSet();
    const state = {
      session: 0,
      caseId: caseIdentity,
      operation: null,
      contexts: [],
      frames: [],
      currentFrames: new Map(),
      errors: [],
    };

    const probe = Object.freeze({
      revision: 'core-v2-webgl-browser-probe/1',
      begin(input) {
        if (!input || input.caseId !== caseIdentity || typeof input.operation !== 'string') {
          throw new Error('Invalid Core v2 WebGL probe run identity');
        }
        state.session += 1;
        state.operation = input.operation;
        state.contexts = [];
        state.frames = [];
        state.currentFrames = new Map();
        state.errors = [];
      },
      snapshot() {
        return JSON.parse(JSON.stringify({
          revision: 'core-v2-webgl-browser-probe/1',
          caseId: state.caseId,
          operation: state.operation,
          contexts: state.contexts,
          frames: state.frames,
          errors: state.errors,
        }));
      },
    });

    Object.defineProperty(window, probeName, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: probe,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(type, ...options) {
        const context = Reflect.apply(originalGetContext, this, [type, ...options]);
        if (
          context
          && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
        ) {
          let metadata = contextMetadata.get(context);
          if (!metadata) {
            metadata = {
              canvas: this,
              requestedContext: type,
              actualContext: typeof WebGL2RenderingContext !== 'undefined'
                && context instanceof WebGL2RenderingContext
                ? 'webgl2'
                : 'webgl',
              session: -1,
              contextIndex: -1,
              frameIndex: 0,
            };
            contextMetadata.set(context, metadata);
          }
          instrumentContext(context, metadata);
        }
        return context;
      },
    });

    function instrumentContext(context, metadata) {
      if (instrumentedContexts.has(context)) return;
      instrumentedContexts.add(context);
      wrapContextMethod(context, metadata, 'clear', (args) => {
        const mask = args[0];
        if (
          typeof mask === 'number'
          && (mask & context.COLOR_BUFFER_BIT) !== 0
          && isDefaultFramebuffer(context)
        ) {
          startFrame(context, metadata, 'clear');
        }
      });
      for (const method of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
        'drawRangeElements',
      ]) {
        wrapContextMethod(context, metadata, method, () => {
          if (isDefaultFramebuffer(context)) recordDraw(context, metadata, method);
        });
      }
    }

    function wrapContextMethod(context, metadata, method, after) {
      const original = context[method];
      if (typeof original !== 'function') return;
      try {
        Object.defineProperty(context, method, {
          configurable: true,
          writable: true,
          value(...args) {
            const result = Reflect.apply(original, this, args);
            try {
              after(args);
            } catch (error) {
              recordProbeError(metadata, method, error);
            }
            return result;
          },
        });
      } catch (error) {
        recordProbeError(metadata, `instrument:${method}`, error);
      }
    }

    function ensureSessionContext(metadata) {
      if (metadata.session === state.session) return metadata.contextIndex;
      metadata.session = state.session;
      metadata.contextIndex = state.contexts.length;
      metadata.frameIndex = 0;
      state.contexts.push({
        index: metadata.contextIndex,
        requestedContext: metadata.requestedContext,
        actualContext: metadata.actualContext,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapCore === 'v2',
      });
      return metadata.contextIndex;
    }

    function startFrame(context, metadata, source) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      const frame = {
        contextIndex,
        frameIndex: metadata.frameIndex,
        source,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapCore === 'v2',
        draws: [],
      };
      metadata.frameIndex += 1;
      state.frames.push(frame);
      state.currentFrames.set(contextIndex, frame);
    }

    function recordDraw(context, metadata, method) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      let frame = state.currentFrames.get(contextIndex);
      if (!frame) {
        startFrame(context, metadata, 'implicit-draw');
        frame = state.currentFrames.get(contextIndex);
      }
      if (!frame || frame.draws.length >= 96) return;
      frame.draws.push({
        index: frame.draws.length,
        method,
        centerRgba: readPixelAtCssPoint(context, metadata.canvas, 10, 10),
        barColumn: readBarColumn(context, metadata.canvas),
      });
    }

    function readPixelAtCssPoint(context, canvas, cssX, cssY) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(cssX * canvas.width / 800)));
      const topY = Math.max(0, Math.min(canvas.height - 1, Math.floor(cssY * canvas.height / 600)));
      const y = canvas.height - topY - 1;
      const pixel = new Uint8Array(4);
      context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      return rgbaHex(pixel);
    }

    function readBarColumn(context, canvas) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(50 * canvas.width / 800)));
      const pixels = new Uint8Array(canvas.height * 4);
      context.readPixels(x, 0, 1, canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      let bestStart = -1;
      let bestEnd = -1;
      let runStart = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        const offset = y * 4;
        const matches = Math.abs(pixels[offset] - 0) <= 4
          && Math.abs(pixels[offset + 1] - 170) <= 4
          && Math.abs(pixels[offset + 2] - 102) <= 4
          && pixels[offset + 3] >= 250;
        if (matches && runStart < 0) runStart = y;
        if ((!matches || y === canvas.height - 1) && runStart >= 0) {
          const runEnd = matches && y === canvas.height - 1 ? y : y - 1;
          if (bestStart < 0 || runEnd - runStart > bestEnd - bestStart) {
            bestStart = runStart;
            bestEnd = runEnd;
          }
          runStart = -1;
        }
      }
      if (bestStart < 0) return null;
      return {
        sampleX: x,
        top: canvas.height - bestEnd - 1,
        bottomExclusive: canvas.height - bestStart,
        height: bestEnd - bestStart + 1,
        rgba: '#00aa66ff',
      };
    }

    function rgbaHex(pixel) {
      return `#${[...pixel].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    }

    function isDefaultFramebuffer(context) {
      return context.getParameter(context.FRAMEBUFFER_BINDING) === null;
    }

    function recordProbeError(metadata, operation, error) {
      if (state.operation === null) return;
      state.errors.push({
        contextIndex: metadata.contextIndex,
        operation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, { probeName: GPU_PROBE_NAME, caseIdentity: caseId });
}

async function executeCase({ browser: activeBrowser, baseUrl, caseSpec, expectedCase, errors: capturedErrors }) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);
  await installWebGlCanvasProbe(page, caseSpec.id);
  const route = `/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}`;
  const routeUrl = new URL(route, baseUrl).href;

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);
    traceCasePhase(caseSpec.id, 'initial route armed');

    const first = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    traceCasePhase(caseSpec.id, 'first run observed');
    lastFocusedUi = first.ui;
    const comparison = compareCaseRun(expectedCase, first);
    assertCaseRun(caseSpec, first, comparison, 'first');

    const repeat = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'repeatCase', 'repeat-action')
      : await executeBrowserRun(page, 'repeatCase');
    traceCasePhase(caseSpec.id, 'repeat run observed');
    lastFocusedUi = repeat.ui;
    const repeatComparison = compareCaseRun(expectedCase, repeat);
    assertCaseRun(caseSpec, repeat, repeatComparison, 'repeat');
    invariant(
      comparison.stableActualSha256 === repeatComparison.stableActualSha256,
      `${caseSpec.id} repeat stable actual digest (difference=${
        firstJsonDifference(
          maskVolatile(first.actualObservation, expectedCase.volatileFields),
          maskVolatile(repeat.actualObservation, expectedCase.volatileFields),
          '',
        )
      })`,
    );

    let rootInput = null;
    if (caseSpec.id === 'VIE-001') {
      rootInput = await verifyViewportRootInput(page);
    } else if (caseSpec.id === 'EVT-003' || caseSpec.id === 'EVT-008') {
      rootInput = await verifyPointerRootInput(page, caseSpec.id);
    }
    if (rootInput !== null) traceCasePhase(caseSpec.id, 'trusted root input verified');

    const destroyed = await destroyBrowserCase(page, caseSpec.id);
    traceCasePhase(caseSpec.id, 'first session destroyed');
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} destroy releases every canvas`);
    assertDestroyControl(caseSpec.id, destroyed, 'first/repeat');

    const fresh = await executeFreshSession({
      browser: activeBrowser,
      routeUrl,
      route,
      caseSpec,
      expectedCase,
      errors: capturedErrors,
    });
    traceCasePhase(caseSpec.id, 'fresh session observed and destroyed');
    invariant(
      comparison.stableActualSha256 === fresh.comparison.stableActualSha256,
      `${caseSpec.id} fresh-session stable actual digest`,
    );

    return {
      id: caseSpec.id,
      route,
      state: {
        first: first.terminalStatus,
        repeat: repeat.terminalStatus,
        fresh: fresh.run.terminalStatus,
        destroyed: destroyed.status,
      },
      comparison: summarizeComparison(comparison),
      repeatComparison: summarizeComparison(repeatComparison),
      freshComparison: summarizeComparison(fresh.comparison),
      deterministic: true,
      stableActualSha256: comparison.stableActualSha256,
      canvas: {
        first: first.canvas,
        repeat: repeat.canvas,
        fresh: fresh.run.canvas,
        afterDestroy: destroyed.canvasCount,
      },
      gpu: GPU_EVIDENCE_CASES.has(caseSpec.id)
        ? { first: first.gpu, repeat: repeat.gpu, fresh: fresh.run.gpu }
        : null,
      cleanup: {
        first: first.cleanupStatus,
        repeat: repeat.cleanupStatus,
        fresh: fresh.run.cleanupStatus,
        destroy: cleanupStatus(destroyed.cleanup),
        freshDestroy: cleanupStatus(fresh.destroyed.cleanup),
      },
      focusedUi: DOM_CONTROL_CASES.has(caseSpec.id)
        ? { first: first.ui, repeat: repeat.ui, fresh: fresh.run.ui }
        : null,
      rootInput,
      controls: CONTROL_CASES.has(caseSpec.id)
        ? {
            first: first.ui?.trigger ?? null,
            repeat: repeat.ui?.trigger ?? null,
            destroy: destroyed.trigger,
            fresh: fresh.run.ui?.trigger ?? null,
            freshDestroy: fresh.destroyed.trigger,
          }
        : null,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function executeFreshSession({
  browser: activeBrowser,
  routeUrl,
  route,
  caseSpec,
  expectedCase,
  errors: capturedErrors,
}) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);
  await installWebGlCanvasProbe(page, caseSpec.id);

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);
    traceCasePhase(caseSpec.id, 'fresh route armed');
    const run = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    traceCasePhase(caseSpec.id, 'fresh run observed');
    lastFocusedUi = run.ui;
    const comparison = compareCaseRun(expectedCase, run);
    assertCaseRun(caseSpec, run, comparison, 'fresh');
    const destroyed = await destroyBrowserCase(page, caseSpec.id);
    traceCasePhase(caseSpec.id, 'fresh session destroyed');
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} fresh bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} fresh destroy releases every canvas`);
    assertDestroyControl(caseSpec.id, destroyed, 'fresh');
    return { run, comparison, destroyed };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function verifyViewportRootInput(page) {
  const wheelProbeName = '__PATCH_MAP_CORE_V2_NATIVE_WHEEL_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('VIE-001 focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, BRIDGE_NAME);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    await canvas.evaluate((element, name) => {
      const state = { count: 0, lastDeltaY: null };
      const listener = (event) => {
        state.count += 1;
        state.lastDeltaY = event.deltaY;
      };
      element.addEventListener('wheel', listener, { capture: true });
      window[name] = { element, listener, state };
    }, wheelProbeName);
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, 'VIE-001 trusted input canvas bounds');
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(center.x + 40, center.y - 20, { steps: 1 });
    await page.mouse.up({ button: 'left' });
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 1;
      },
      BRIDGE_NAME,
      { timeout: 10_000 },
    );

    const beforeWheel = await page.evaluate(async (bridgeName) => {
      const observation = await window[bridgeName].actualObservation();
      return observation.anchorWorld;
    }, BRIDGE_NAME);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -240);
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 2;
      },
      BRIDGE_NAME,
      { timeout: 10_000 },
    );

    const observed = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      await bridge.awaitMilestone(0, 'settled');
      const observation = await bridge.actualObservation();
      const nativeWheel = window.__PATCH_MAP_CORE_V2_NATIVE_WHEEL_PROBE__?.state ?? null;
      return {
        events: observation.events,
        viewport: observation.viewport,
        revisions: observation.revisions,
        ownership: observation.ownership,
        anchorWorld: observation.anchorWorld,
        transformedHit: observation.transformedHit,
        resources: observation.resources,
        nativeWheel,
      };
    }, BRIDGE_NAME);

    invariant(
      observed.events.length === 2 &&
        observed.events[0]?.source === 'pointer' &&
        observed.events[1]?.source === 'wheel',
      `VIE-001 trusted pointer and wheel publish exactly one view event each: ${
        JSON.stringify(observed.events)
      }`,
    );
    invariant(
      observed.viewport.scale > 1 && observed.viewport.scale <= 4,
      'VIE-001 trusted wheel respects configured scale limits',
    );
    invariant(
      Math.abs(beforeWheel.x - observed.anchorWorld.x) <= 1e-6 &&
        Math.abs(beforeWheel.y - observed.anchorWorld.y) <= 1e-6,
      'VIE-001 trusted wheel preserves the cursor world point',
    );
    invariant(
      observed.transformedHit.target === 'rect-b',
      'VIE-001 trusted transformed hit resolves the current target',
    );
    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.entityCallbackCount === 0,
      'VIE-001 trusted input retains root-only interaction ownership',
    );
    invariant(
      observed.revisions.viewRevision >= 2,
      'VIE-001 trusted input advances the Engine view authority',
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      'VIE-001 trusted input keeps one settled live canvas',
    );
    invariant(
      observed.nativeWheel?.count === 1 && observed.nativeWheel?.lastDeltaY === -240,
      `VIE-001 trusted browser emitted one native wheel event: ${
        JSON.stringify(observed.nativeWheel)
      }`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      eventSources: observed.events.map(({ source }) => source),
      viewport: observed.viewport,
      revisions: observed.revisions,
      ownership: observed.ownership,
      wheelAnchor: { before: beforeWheel, after: observed.anchorWorld },
      transformedHit: observed.transformedHit,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, shouldRelease }) => {
      const nativeWheelProbe = window.__PATCH_MAP_CORE_V2_NATIVE_WHEEL_PROBE__;
      if (nativeWheelProbe) {
        nativeWheelProbe.element.removeEventListener('wheel', nativeWheelProbe.listener, {
          capture: true,
        });
        delete window.__PATCH_MAP_CORE_V2_NATIVE_WHEEL_PROBE__;
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount: host?.querySelectorAll('canvas[data-patch-map-core="v2"]').length ?? 0,
        released: shouldRelease,
      };
    }, { bridgeName: BRIDGE_NAME, shouldRelease: armed }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      'VIE-001 trusted input probe releases its Engine and canvas',
    );
  }
}

async function verifyPointerRootInput(page, caseId) {
  invariant(
    caseId === 'EVT-003' || caseId === 'EVT-008',
    `unsupported trusted pointer case ${caseId}`,
  );
  const contextMenuProbeName = '__PATCH_MAP_CORE_V2_NATIVE_CONTEXT_MENU_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('Core v2 pointer focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, BRIDGE_NAME);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, `${caseId} trusted input canvas bounds`);
    const pagePoint = (anchor) => ({
      x: bounds.x + anchor.x * bounds.width / 800,
      y: bounds.y + anchor.y * bounds.height / 600,
    });

    if (caseId === 'EVT-003') {
      const hovered = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const viewport = page.viewportSize();
      const right = bounds.x + bounds.width + 8;
      const left = bounds.x - 8;
      const outside = {
        x: viewport !== null && right < viewport.width ? right : left,
        y: bounds.y + Math.min(bounds.height / 2, 100),
      };
      await page.mouse.move(hovered.x, hovered.y);
      await page.mouse.move(outside.x, outside.y);
      await page.waitForFunction(
        async (bridgeName) => {
          const observation = await window[bridgeName]?.actualObservation();
          if (!Array.isArray(observation?.events)) return false;
          const hoverEvents = observation.events.filter((event) => event?.type === 'hover-change');
          return hoverEvents.some((event) => event.payload?.target?.id === 'item-a') &&
            hoverEvents.some((event) => event.payload?.target === null);
        },
        BRIDGE_NAME,
        { timeout: 10_000 },
      );
    } else {
      await page.evaluate((probeName) => {
        const state = [];
        const listener = (event) => {
          state.push({
            clientX: event.clientX,
            clientY: event.clientY,
            defaultPrevented: event.defaultPrevented,
          });
        };
        document.addEventListener('contextmenu', listener);
        window[probeName] = { listener, state };
      }, contextMenuProbeName);
      const owned = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const empty = pagePoint(gesturePlan.cssLocalAnchors[1]);
      await page.mouse.click(owned.x, owned.y, { button: 'right' });
      await page.mouse.click(empty.x, empty.y, { button: 'right' });
      await page.waitForFunction(
        async ({ bridgeName, probeName }) => {
          const observation = await window[bridgeName]?.actualObservation();
          const clicks = Array.isArray(observation?.events)
            ? observation.events.filter((event) =>
                event?.type === 'click' && event.payload?.button === 2)
            : [];
          return clicks.length === 2 && window[probeName]?.state?.length === 2;
        },
        { bridgeName: BRIDGE_NAME, probeName: contextMenuProbeName },
        { timeout: 10_000 },
      );
    }

    const observed = await page.evaluate(async ({ bridgeName, probeName }) => {
      const observation = await window[bridgeName].actualObservation();
      return {
        events: observation.events,
        pointerGesture: observation.pointerGesture,
        ownership: observation.ownership,
        resources: observation.resources,
        nativeContextMenu: window[probeName]?.state ?? null,
      };
    }, { bridgeName: BRIDGE_NAME, probeName: contextMenuProbeName });

    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.rootListenerCount === 8 &&
        observed.ownership?.entityCallbackCount === 0,
      `${caseId} trusted input retains eight root-only listeners`,
    );
    invariant(
      observed.pointerGesture?.activePointerCount === 0 &&
        observed.pointerGesture?.pointerCaptureCount === 0 &&
        observed.pointerGesture?.activeGestureCount === 0,
      `${caseId} trusted input releases pointer and gesture ownership`,
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      `${caseId} trusted input keeps one settled live canvas`,
    );

    if (caseId === 'EVT-003') {
      const hoverTargets = observed.events
        .filter((event) => event?.type === 'hover-change')
        .map((event) => event.payload?.target?.id ?? null);
      invariant(
        hoverTargets.includes('item-a') && hoverTargets.at(-1) === null,
        `EVT-003 trusted hover enter/leave trace: ${JSON.stringify(hoverTargets)}`,
      );
      invariant(
        observed.pointerGesture?.hoverTarget === null,
        'EVT-003 trusted pointerleave clears hover state',
      );
      return {
        status: 'passed',
        driverId: gesturePlan.driverId,
        hoverTargets,
        pointerGesture: observed.pointerGesture,
        ownership: observed.ownership,
      };
    }

    const secondaryClicks = observed.events.filter((event) =>
      event?.type === 'click' && event.payload?.button === 2);
    const secondaryTargets = secondaryClicks.map((event) => event.payload?.target?.id ?? null);
    invariant(
      secondaryTargets.length === 2 &&
        secondaryTargets[0] === 'rect-b' &&
        secondaryTargets[1] === null,
      `EVT-008 trusted secondary click targets: ${JSON.stringify(secondaryTargets)}`,
    );
    invariant(
      secondaryClicks.every((event) => event.payload?.clickCount === 1),
      'EVT-008 trusted secondary clicks each count one physical completion',
    );
    invariant(
      observed.nativeContextMenu?.length === 2 &&
        observed.nativeContextMenu[0]?.defaultPrevented === true &&
        observed.nativeContextMenu[1]?.defaultPrevented === false,
      `EVT-008 contextmenu ownership: ${JSON.stringify(observed.nativeContextMenu)}`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      secondaryTargets,
      contextMenuDefaultPrevented: observed.nativeContextMenu.map(
        ({ defaultPrevented }) => defaultPrevented,
      ),
      pointerGesture: observed.pointerGesture,
      ownership: observed.ownership,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, probeName, shouldRelease }) => {
      const nativeContextMenuProbe = window[probeName];
      if (nativeContextMenuProbe) {
        document.removeEventListener('contextmenu', nativeContextMenuProbe.listener);
        delete window[probeName];
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount: host?.querySelectorAll('canvas[data-patch-map-core="v2"]').length ?? 0,
        released: shouldRelease,
      };
    }, {
      bridgeName: BRIDGE_NAME,
      probeName: contextMenuProbeName,
      shouldRelease: armed,
    }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      `${caseId} trusted input probe releases its Engine and canvas`,
    );
  }
}

async function openFocusedCase(page, routeUrl, route, caseId) {
  await page.goto(routeUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (bridgeName) => {
      const bridge = window[bridgeName];
      return bridge?.state().status === 'armed';
    },
    BRIDGE_NAME,
    { timeout: 30_000 },
  );
  invariant(new URL(page.url()).pathname + new URL(page.url()).search === route, `${caseId} canonical route`);
  invariant(
    await page.getByTestId(`scenario-${caseId.toLowerCase()}`).count() === 1,
    `${caseId} focused root identity`,
  );
}

async function destroyBrowserCase(page, caseId) {
  return page.evaluate(async ({ bridgeName, useDomControl }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const root = document.querySelector(`[data-testid="${bridge.state().rootTestId}"]`);
    if (!(root instanceof HTMLElement)) throw new Error('Missing focused contract root');
    let cleanup;
    let trigger;
    if (useDomControl) {
      const button = document.querySelector('[data-testid="destroy-case"]');
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Missing focused Lab control destroy-case');
      }
      if (button.disabled) throw new Error('Focused Lab control destroy-case is disabled');
      const completion = new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          root.removeEventListener('core-v2-contract-destroy-complete', onComplete);
          reject(new Error(`Focused ${bridge.state().rootTestId} destroy completion event timed out`));
        }, 30_000);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== 'destroyCase') return;
          window.clearTimeout(timeout);
          root.removeEventListener('core-v2-contract-destroy-complete', onComplete);
          resolve(event.detail.cleanup);
        };
        root.addEventListener('core-v2-contract-destroy-complete', onComplete);
      });
      button.click();
      cleanup = await completion;
      trigger = 'click:destroy-case';
    } else {
      cleanup = await bridge.destroyCase();
      trigger = 'bridge:destroyCase';
    }
    return {
      cleanup,
      trigger,
      status: bridge.state().status,
      rootStatus: root.dataset.contractStatus ?? null,
      canvasCount: surface.querySelectorAll('canvas').length,
    };
  }, {
    bridgeName: BRIDGE_NAME,
    useDomControl: CONTROL_CASES.has(caseId),
  });
}

function executeBrowserUiRun(page, caseId, operation, buttonTestId) {
  return executeBrowserRun(
    page,
    operation,
    buttonTestId,
    caseId,
    CONTROL_CASES.has(caseId),
  );
}

async function executeBrowserRun(
  page,
  operation,
  buttonTestId = null,
  focusedCaseId = null,
  genericControlCase = false,
) {
  return page.evaluate(async ({
    bridgeName,
    gpuProbeName,
    operationName,
    triggerTestId,
    uiCaseId,
    collectGenericControlUi,
  }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const gpuProbe = window[gpuProbeName];
    if (gpuProbe && typeof gpuProbe.begin === 'function') {
      gpuProbe.begin({ caseId: bridge.state().caseId, operation: operationName });
    }
    const canvasCount = () => surface.querySelectorAll('canvas').length;
    const initialCanvasCount = canvasCount();
    let maximumCanvasCount = initialCanvasCount;
    let observedCanvasCount = initialCanvasCount;
    const sample = () => {
      maximumCanvasCount = Math.max(maximumCanvasCount, canvasCount());
    };
    const countMutationCanvases = (nodes) => [...nodes].reduce((total, node) => {
      const ownCanvas = node.nodeName === 'CANVAS' ? 1 : 0;
      const nestedCanvases = typeof node.querySelectorAll === 'function'
        ? node.querySelectorAll('canvas').length
        : 0;
      return total + ownCanvas + nestedCanvases;
    }, 0);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        observedCanvasCount -= countMutationCanvases(record.removedNodes);
        observedCanvasCount += countMutationCanvases(record.addedNodes);
        maximumCanvasCount = Math.max(maximumCanvasCount, observedCanvasCount);
      }
      sample();
    });
    observer.observe(surface, { childList: true, subtree: true });
    const interval = window.setInterval(sample, 0);

    try {
      let pending;
      let runningStatus;
      let run;
      let ui = null;
      if (triggerTestId !== null) {
        const button = document.querySelector(`[data-testid="${triggerTestId}"]`);
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`Missing focused Lab control ${triggerTestId}`);
        }
        if (button.disabled) throw new Error(`Focused Lab control ${triggerTestId} is disabled`);
        const completion = waitForUiRunCompletion(bridge.state().rootTestId, operationName);
        button.click();
        runningStatus = bridge.state().status;
        sample();
        run = await completion;
        ui = await collectFocusedUi({
          bridge,
          caseId: uiCaseId,
          triggerTestId,
          operationName,
          generic: collectGenericControlUi,
        });
      } else {
        const invoke = bridge[operationName];
        if (typeof invoke !== 'function') throw new Error(`Missing bridge operation ${operationName}`);
        pending = invoke.call(bridge);
        runningStatus = bridge.state().status;
        sample();
        run = await pending;
      }
      sample();
      await Promise.resolve();
      sample();
      const actualObservation = await bridge.actualObservation();
      const execution = bridge.execution();
      const terminalAction = Array.isArray(execution?.actionResults)
        ? execution.actionResults.at(-1)
        : null;
      return {
        operation: operationName,
        runningStatus,
        terminalStatus: bridge.state().status,
        runStatus: run.status,
        executionStatus: execution?.status ?? null,
        actionStatuses: Array.isArray(execution?.actionResults)
          ? execution.actionResults.map((result) => result?.status ?? null)
          : [],
        actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
        actualMatchesRun: JSON.stringify(actualObservation) === JSON.stringify(run.actualObservation),
        cleanupStatus: run.cleanup?.status ?? null,
        diagnostics: {
          longTaskMeasurements:
            terminalAction?.delta?.actual?.longTasks?.measurements ?? null,
        },
        ui,
        gpu: gpuProbe && typeof gpuProbe.snapshot === 'function'
          ? gpuProbe.snapshot()
          : null,
        canvas: {
          initial: initialCanvasCount,
          maximumDuringRun: maximumCanvasCount,
          afterCleanup: canvasCount(),
        },
      };
    } finally {
      window.clearInterval(interval);
      observer.disconnect();
    }
    function waitForUiRunCompletion(rootTestId, expectedOperation) {
      const root = document.querySelector(`[data-testid="${rootTestId}"]`);
      if (!(root instanceof HTMLElement)) throw new Error(`Missing focused root ${rootTestId}`);
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          root.removeEventListener('core-v2-contract-run-complete', onComplete);
          reject(new Error(`Focused ${rootTestId} run completion event timed out`));
        }, 30_000);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== expectedOperation) return;
          window.clearTimeout(timeout);
          root.removeEventListener('core-v2-contract-run-complete', onComplete);
          if (!event.detail.run || typeof event.detail.run !== 'object') {
            const execution = bridge.execution();
            const failureMessage = typeof execution?.error?.message === 'string'
              ? `: ${execution.error.message}`
              : '';
            reject(new Error(
              `Focused ${rootTestId} completion did not include a run result${failureMessage}`,
            ));
            return;
          }
          resolve(event.detail.run);
        };
        root.addEventListener('core-v2-contract-run-complete', onComplete);
      });
    }

    function collectFocusedUi(options) {
      if (options.generic) return collectGenericFocusedUi(options);
      if (options.caseId === 'REN-005') return collectRen005FocusedUi(options);
      if (options.caseId === 'REN-006' || options.caseId === 'REN-011') {
        return collectTextFocusedUi(options);
      }
      return collectComponentAssetFocusedUi(options);
    }

    async function collectGenericFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
    }) {
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const execution = activeBridge.execution();
        const expectedActionCount = Array.isArray(execution?.actionResults)
          ? execution.actionResults.length
          : 0;
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const run = root?.querySelector('[data-testid="load-dataset"]');
        const repeat = root?.querySelector('[data-testid="repeat-action"]');
        const destroy = root?.querySelector('[data-testid="destroy-case"]');
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          expectedActionCount,
          statuses,
          runDisabled: run instanceof HTMLButtonElement ? run.disabled : null,
          repeatDisabled: repeat instanceof HTMLButtonElement ? repeat.disabled : null,
          destroyDisabled: destroy instanceof HTMLButtonElement ? destroy.disabled : null,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && expectedActionCount > 0
          && statuses.length === expectedActionCount
          && statuses.every((status) => status === 'completed')
          && run instanceof HTMLButtonElement
          && repeat instanceof HTMLButtonElement
          && destroy instanceof HTMLButtonElement
          && run.disabled
          && !repeat.disabled
          && !destroy.disabled
        ) {
          return {
            trigger: `click:${triggerTestId}`,
            caseId,
            contractStatus: root.dataset.contractStatus,
            actionStatuses: statuses,
            controls: {
              runDisabled: run.disabled,
              repeatDisabled: repeat.disabled,
              destroyDisabled: destroy.disabled,
            },
          };
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} generic DOM did not settle after ${triggerTestId}: `
              + JSON.stringify(lastState),
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function collectRen005FocusedUi({ bridge: activeBridge, triggerTestId, operationName }) {
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector('[data-testid="ren-005-image-inspector"]');
        const performanceRows = root?.querySelectorAll(
          '[data-testid="ren-005-performance-journal-row"]',
        ).length ?? 0;
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === 4
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && performanceRows === expectedPerformanceRows
        ) {
          return readFocusedUi(root, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(`Focused REN-005 DOM did not settle after ${triggerTestId}`);
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function collectTextFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-006'
        ? {
            prefix: 'ren-006',
            inspectorTestId: 'ren-006-text-inspector',
            actionCount: 6,
            choices: ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal'],
            fieldNames: [
              'phase',
              'source',
              'visible-text',
              'lines',
              'font-runs',
              'layout-bounds',
              'world-bounds',
              'hit-bounds',
              'publication',
              'intermediate-publication-count',
              'stale-glyph-count',
              'renderer-route',
              'style',
              'geometry',
            ],
          }
        : caseId === 'REN-011'
          ? {
              prefix: 'ren-011',
              inspectorTestId: 'ren-011-text-inspector',
              actionCount: 4,
              choices: [
                'placed',
                'auto',
                'wrap',
                'overflow-visible',
                'overflow-hidden',
                'overflow-ellipsis',
                'upright',
              ],
              fieldNames: [
                'specimen',
                'source',
                'placement',
                'margin',
                'tint',
                'rgba',
                'frame',
                'auto-font',
                'wrap-width',
                'overflow',
                'visible-text',
                'lines',
                'layout-bounds',
                'item-angle',
                'orientation',
                'screen-angle',
                'local-bounds',
                'paint-tint',
                'publication',
                'all-rows-exact',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused text UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedChoiceCount: inspector?.dataset.observedChoiceCount ?? null,
          selectedChoice: inspector?.dataset.selectedChoice ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.actionCount
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedChoiceCount) === config.choices.length
          && typeof inspector.dataset.selectedChoice === 'string'
          && performanceRows === expectedPerformanceRows
        ) {
          return readTextFocusedUi(root, inspector, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} text DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function readTextFocusedUi(root, inspector, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-text-choice-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} text chooser`);
      }
      const initialChoice = chooser.value;
      const selectedFacts = async (choice) => {
        chooser.value = choice;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        const timeoutAt = performance.now() + 5_000;
        while (inspector.dataset.selectedChoice !== choice) {
          if (performance.now() >= timeoutAt) {
            throw new Error(`Focused ${config.prefix} choice ${choice} did not settle`);
          }
          await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        }
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const choices = {};
      for (const choice of config.choices) choices[choice] = await selectedFacts(choice);
      if (chooser.value !== initialChoice) await selectedFacts(initialChoice);
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          initialChoice,
          seededChoice: inspector.dataset.seededChoice ?? null,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        choices,
        observedChoiceCount: textAt(root, `${config.prefix}-observed-choice-count`),
        displayOnlyNote: textAt(root, `${config.prefix}-display-only-note`),
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    async function collectComponentAssetFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-008'
        ? {
            prefix: 'ren-008',
            inspectorTestId: 'ren-008-background-inspector',
            phases: ['initial', 'image', 'hidden', 'shown'],
            fieldNames: [
              'phase',
              'owner-id',
              'component-id',
              'entity-id',
              'logical-identity',
              'authored-size',
              'full-bounds',
              'visible-bounds',
              'source',
              'resource-state',
              'render-role',
              'binding-key',
              'generation',
              'render-object-count',
              'stale-count',
            ],
          }
        : caseId === 'REN-010'
          ? {
              prefix: 'ren-010',
              inspectorTestId: 'ren-010-icon-inspector',
              phases: ['initial', 'replacement', 'tint'],
              fieldNames: [
                'phase',
                'owner-id',
                'component-id',
                'entity-id',
                'logical-identity',
                'content-box',
                'icon-bounds',
                'authored-size',
                'placement',
                'margins',
                'source',
                'resource-state',
                'render-role',
                'binding-key',
                'generation',
                'semantic-tint',
                'renderer-tint',
                'render-object-count',
                'stale-count',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedPhaseCount: inspector?.dataset.observedPhaseCount ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.phases.length
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedPhaseCount) === config.phases.length
          && performanceRows === expectedPerformanceRows
        ) {
          return readComponentAssetFocusedUi(root, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    function readComponentAssetFocusedUi(root, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-phase-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} phase chooser`);
      }
      const selectedFacts = (phase) => {
        chooser.value = phase;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const phases = Object.fromEntries(config.phases.map((phase) => [phase, selectedFacts(phase)]));
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      const resourceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-resource-journal-row"]`,
      )];
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        phases,
        observedPhaseCount: textAt(root, `${config.prefix}-observed-phase-count`),
        captureId: config.prefix === 'ren-008'
          ? textAt(root, 'ren-008-capture-id')
          : null,
        resources: Object.fromEntries([
          'canvas-count',
          'subscription-count',
          'pending-work-count',
          'binding-count',
          'resource-count',
          'lease-count',
          'pending-settlement-count',
          'pending-release-count',
          'stale-attachment-resource-count',
          'renderer-object-resource-count',
          'cleanup-failure-count',
        ].map((field) => [field, textAt(root, `${config.prefix}-${field}`)])),
        resourceJournal: {
          count: resourceRows.length,
          events: resourceRows.map((row) => row.dataset.resourceEvent ?? null),
          phases: resourceRows.map((row) => row.dataset.resourcePhase ?? null),
        },
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    function readFocusedUi(root, triggerTestId) {
      const chooser = root.querySelector('[data-testid="ren-005-specimen-select"]');
      if (!(chooser instanceof HTMLSelectElement)) throw new Error('Missing REN-005 specimen chooser');
      const selectedFacts = (value) => {
        chooser.value = value;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          source: textAt(root, 'ren-005-selected-source'),
          sourceKind: textAt(root, 'ren-005-selected-source-kind'),
          state: textAt(root, 'ren-005-selected-state'),
          role: textAt(root, 'ren-005-selected-role'),
          bounds: textAt(root, 'ren-005-selected-bounds'),
          initialSource: textAt(root, 'ren-005-selected-initial-source'),
          initialState: textAt(root, 'ren-005-selected-initial-state'),
          staleAttachCount: textAt(root, 'ren-005-selected-stale-attach'),
          staleCompletionCount: textAt(root, 'ren-005-selected-stale-completion'),
          diagnosticCount: textAt(root, 'ren-005-selected-diagnostics'),
        };
      };
      const descriptor = selectedFacts('descriptor');
      const failed = selectedFacts('failed-image');
      const journalRows = [...root.querySelectorAll('[data-testid="ren-005-request-journal-row"]')];
      const performanceRows = [...root.querySelectorAll(
        '[data-testid="ren-005-performance-journal-row"]',
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooserOptions: [...chooser.options].map(({ value }) => value),
        descriptor,
        failed,
        counters: {
          requests: textAt(root, 'ren-005-request-count'),
          backend: textAt(root, 'ren-005-backend-counts'),
          resources: textAt(root, 'ren-005-resource-count'),
          leases: textAt(root, 'ren-005-lease-count'),
          stale: textAt(root, 'ren-005-stale-count'),
          pendingRelease: textAt(root, 'ren-005-pending-release-count'),
        },
        requestJournal: {
          count: journalRows.length,
          events: journalRows.map((row) => row.dataset.requestEvent ?? null),
          kinds: journalRows.map((row) => row.dataset.requestKind ?? null),
        },
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    function textAt(root, testId) {
      const element = root.querySelector(`[data-testid="${testId}"]`);
      const value = element?.textContent?.trim();
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Missing focused DOM fact ${testId}: ${element?.outerHTML ?? 'absent'}`);
      }
      return value;
    }
  }, {
    bridgeName: BRIDGE_NAME,
    gpuProbeName: GPU_PROBE_NAME,
    operationName: operation,
    triggerTestId: buttonTestId,
    uiCaseId: focusedCaseId,
    collectGenericControlUi: genericControlCase,
  });
}

function compareCaseRun(expectedCase, browserRun) {
  return compareObservation({
    expectedCase,
    actual: browserRun.actualObservation,
    fixtures: browserRun.fixtures,
    captures: browserRun.captures,
  });
}

function assertCaseRun(caseSpec, run, comparison, runLabel) {
  const prefix = `${caseSpec.id} ${runLabel}`;
  const expectedFailures = caseSpec.expectedFailures ?? [];
  const failureActuals = caseSpec.id === 'CSM-010'
    ? {
        longTaskAtLeast100Ms: run.actualObservation?.outcome?.longTaskAtLeast100Ms ?? null,
        rawTimingSamples: run.actualObservation?.outcome?.rawTimingSamples ?? null,
        measurements: run.diagnostics?.longTaskMeasurements ?? null,
      }
    : caseSpec.id === 'HIS-001'
      ? run.actualObservation?.history?.domainMatrix?.rows ?? null
      : caseSpec.id === 'HIS-006'
        ? run.actualObservation?.history?.compoundDomainMatrix?.rows ?? null
        : null;
  invariant(run.runningStatus === 'running', `${prefix} enters running state`);
  invariant(run.terminalStatus === 'observed', `${prefix} observed terminal state`);
  invariant(run.runStatus === 'observed', `${prefix} public bridge run result`);
  invariant(run.executionStatus === 'completed', `${prefix} executor completion`);
  invariant(run.actionStatuses.length > 0, `${prefix} action results are present`);
  invariant(run.actionStatuses.every((status) => status === 'completed'), `${prefix} actions complete`);
  invariant(run.actualMatchesRun === true, `${prefix} actualObservation public accessor parity`);
  invariant(run.cleanupStatus === 'completed', `${prefix} cleanup completion`);
  invariant(run.canvas.initial === 0, `${prefix} starts without a retained canvas`);
  invariant(
    run.canvas.maximumDuringRun === 1,
    `${prefix} owns exactly one transient canvas (observed ${run.canvas.maximumDuringRun})`,
  );
  invariant(run.canvas.afterCleanup === 0, `${prefix} cleanup releases the transient canvas`);
  invariant(comparison.assertions.length === caseSpec.expectedAssertions, `${prefix} assertion inventory`);
  invariant(
    comparison.passed === caseSpec.expectedAssertions - expectedFailures.length,
    `${prefix} exact assertion pass count (${comparison.passed}/${caseSpec.expectedAssertions}; `
      + `failures=${JSON.stringify(comparisonFailures(comparison))}; `
      + `actuals=${JSON.stringify(failureActuals)})`,
  );
  invariant(
    comparison.failed === expectedFailures.length,
    `${prefix} exact assertion failure count (${comparison.failed}/${expectedFailures.length})`,
  );
  invariant(
    sameJson(comparisonFailures(comparison), expectedFailures),
    `${prefix} only declared immutable assertion conflicts`,
  );
  assertImmutableConflictActuals(caseSpec.id, run.actualObservation, runLabel);
  if (caseSpec.id === 'REN-005') assertRen005FocusedUi(run.ui, runLabel);
  if (caseSpec.id === 'REN-006' || caseSpec.id === 'REN-011') {
    assertTextFocusedUi(caseSpec.id, run.ui, runLabel);
  }
  if (caseSpec.id === 'REN-008' || caseSpec.id === 'REN-010') {
    assertComponentAssetFocusedUi(caseSpec.id, run.ui, runLabel);
  }
  if (CONTROL_CASES.has(caseSpec.id)) {
    assertControlUi(caseSpec.id, run.ui, runLabel);
  }
  if (GPU_EVIDENCE_CASES.has(caseSpec.id)) {
    assertGpuEvidence(caseSpec.id, run.gpu, runLabel);
  }
}

function assertControlUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} generic focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual Run/Repeat control`);
  invariant(ui.caseId === caseId, `${caseId} ${runLabel} focused UI case identity`);
  invariant(ui.contractStatus === 'observed', `${caseId} ${runLabel} focused DOM terminal state`);
  invariant(
    Array.isArray(ui.actionStatuses)
      && ui.actionStatuses.length > 0
      && ui.actionStatuses.every((status) => status === 'completed'),
    `${caseId} ${runLabel} focused DOM action rows complete`,
  );
  invariant(ui.controls?.runDisabled === true, `${caseId} ${runLabel} Run control is consumed`);
  invariant(ui.controls?.repeatDisabled === false, `${caseId} ${runLabel} Repeat control is enabled`);
  invariant(ui.controls?.destroyDisabled === false, `${caseId} ${runLabel} Destroy control is enabled`);
}

function assertDestroyControl(caseId, destroyed, runLabel) {
  if (!CONTROL_CASES.has(caseId)) return;
  invariant(
    destroyed.trigger === 'click:destroy-case',
    `${caseId} ${runLabel} actual Destroy control`,
  );
  invariant(destroyed.rootStatus === 'destroyed', `${caseId} ${runLabel} destroyed DOM state`);
  invariant(
    cleanupStatus(destroyed.cleanup) === 'completed',
    `${caseId} ${runLabel} Destroy control cleanup completion`,
  );
}

function assertImmutableConflictActuals(caseId, actualObservation, runLabel) {
  const mismatches = inspectCoreV2UpdateConflictActuals(caseId, actualObservation);
  invariant(
    mismatches.length === 0,
    `${caseId} ${runLabel} immutable-conflict actuals (${JSON.stringify(mismatches)})`,
  );
}

function assertGpuEvidence(caseId, gpu, runLabel) {
  const prefix = `${caseId} ${runLabel} WebGL evidence`;
  invariant(gpu && typeof gpu === 'object', `${prefix} exists`);
  invariant(gpu.revision === 'core-v2-webgl-browser-probe/1', `${prefix} revision`);
  invariant(gpu.caseId === caseId, `${prefix} case identity`);
  invariant(
    gpu.operation === (runLabel === 'repeat' ? 'repeatCase' : 'runCase'),
    `${prefix} operation identity`,
  );
  invariant(Array.isArray(gpu.errors) && gpu.errors.length === 0, `${prefix} capture errors`);
  invariant(Array.isArray(gpu.contexts) && gpu.contexts.length > 0, `${prefix} context inventory`);
  invariant(
    gpu.contexts.every((context) => context.actualContext === 'webgl2'),
    `${prefix} uses actual WebGL2 contexts (${JSON.stringify(gpu.contexts)})`,
  );
  invariant(
    gpu.contexts.every((context) => context.trackedCanvas === true),
    `${prefix} observes only product-owned canvases (${JSON.stringify(gpu.contexts)})`,
  );
  invariant(Array.isArray(gpu.frames) && gpu.frames.length > 0, `${prefix} visible frame inventory`);
  invariant(
    gpu.frames.every((frame) => frame.trackedCanvas === true),
    `${prefix} tracked canvas frames (${gpuFrameDiagnostic(gpu)})`,
  );
  if (
    AUTHORING_TRANCHE_CASES.has(caseId)
    || EDITOR_WORKFLOW_TRANCHE_CASES.has(caseId)
  ) {
    invariant(
      gpu.frames.some((frame) => frame.draws.length > 0),
      `${prefix} post-authoring draw frame (${gpuFrameDiagnostic(gpu)})`,
    );
    return;
  }
  invariant(
    gpu.frames.every((frame) => frame.draws.length > 0),
    `${prefix} draw frames (${gpuFrameDiagnostic(gpu)})`,
  );
  if (DETERMINISM_LIFECYCLE_TRANCHE_CASES.has(caseId)) return;

  if (caseId === 'LAY-003') {
    assertLay003GpuPaintOrder(gpu, prefix);
    return;
  }
  if (caseId === 'UPD-007') {
    assertUpd007GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'UPD-008') {
    assertUpd008GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'UPD-009') {
    assertUpd009GpuPublication(gpu, prefix);
    return;
  }
  if (caseId === 'LIF-003') {
    assertLif003GpuReplacement(gpu, prefix);
    return;
  }
  if (caseId === 'CSM-037') {
    assertCsm037GpuPresentation(gpu, prefix);
    return;
  }
  assertAnimatedBarGpuProjection(caseId, gpu, prefix);
}

function assertLay003GpuPaintOrder(gpu, prefix) {
  const initial = ['#111111ff', '#222222ff', '#333333ff', '#444444ff'];
  const patched = ['#222222ff', '#333333ff', '#111111ff', '#444444ff'];
  const frameOrders = gpu.frames
    .map((frame) => compressConsecutive(frame.draws
      .map((draw) => draw.centerRgba)
      .filter((rgba) => initial.includes(rgba))))
    .filter((order) => order.length > 0);
  invariant(
    containsOrderedRecords(frameOrders, [initial, patched, initial, patched]),
    `${prefix} initial/patch/undo/redo GPU draw order (${JSON.stringify(frameOrders)})`,
  );
}

function assertUpd007GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 2);
  invariant(
    publishedSequence !== undefined,
    `${prefix} initial and post-bulk publish both issue WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const postBulkFrame = publishedSequence.at(-1);
  invariant(
    postBulkFrame?.draws.length > 0,
    `${prefix} post-bulk frame contains a real GPU draw (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertUpd008GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 4);
  invariant(
    publishedSequence !== undefined,
    `${prefix} initial/reconcile/hide/show each issue WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const updateFrames = publishedSequence.slice(-3);
  invariant(
    updateFrames.length === 3 && updateFrames.every((frame) => frame.draws.length > 0),
    `${prefix} reconcile/hide/show post-update frames contain real GPU draws (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertUpd009GpuPublication(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  const publishedSequence = sequences.find((sequence) => sequence.length >= 4);
  invariant(
    publishedSequence !== undefined,
    `${prefix} move/group/ungroup/unrecorded-move each publish WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  const structuralFrames = publishedSequence.slice(-4);
  invariant(
    structuralFrames.length === 4 && structuralFrames.every((frame) => frame.draws.length > 0),
    `${prefix} structural frames contain real GPU draws (${gpuFrameDiagnostic(gpu)})`,
  );
}

function assertLif003GpuReplacement(gpu, prefix) {
  const sequences = [...new Set(gpu.frames.map((frame) => frame.contextIndex))]
    .map((contextIndex) => gpu.frames
      .filter((frame) => frame.contextIndex === contextIndex)
      .map(frameBarHeight)
      .filter((height) => height !== null));
  const visibleReplacement = sequences.some((sequence) => {
    const initial = sequence.findIndex((height) => height >= 9 && height <= 11);
    const animated = sequence.findIndex((height, index) => (
      index > initial && height > 10.1 && height < 29.9
    ));
    return initial >= 0
      && animated > initial
      && sequence.some((height, index) => (
        index > animated && height >= 9 && height <= 11
      ));
  });
  invariant(
    visibleReplacement,
    `${prefix} publishes initial, animated, and replacement bar frames (${JSON.stringify(sequences)})`,
  );
}

function assertCsm037GpuPresentation(gpu, prefix) {
  const sequences = webGl2DrawFrameSequences(gpu);
  invariant(
    sequences.some((sequence) => sequence.length >= 3),
    `${prefix} report load, replacement, and fit each publish WebGL2 draws (${gpuFrameDiagnostic(gpu)})`,
  );
  invariant(
    gpu.frames.some((frame) => frame.draws.some((draw) => (
      draw.centerRgba === '#00aa66ff' || draw.barColumn?.rgba === '#00aa66ff'
    ))),
    `${prefix} includes the report panel presentation color (${gpuFrameDiagnostic(gpu)})`,
  );
}

function webGl2DrawFrameSequences(gpu) {
  return gpu.contexts
    .filter((context) => context.actualContext === 'webgl2' && context.trackedCanvas === true)
    .map((context) => gpu.frames.filter((frame) => (
      frame.contextIndex === context.index
      && frame.trackedCanvas === true
      && Array.isArray(frame.draws)
      && frame.draws.length > 0
    )));
}

function assertAnimatedBarGpuProjection(caseId, gpu, prefix) {
  const byContext = new Map();
  for (const frame of gpu.frames) {
    const height = frameBarHeight(frame);
    if (height === null) continue;
    const sequence = byContext.get(frame.contextIndex) ?? [];
    sequence.push(height);
    byContext.set(frame.contextIndex, sequence);
  }
  const sequences = [...byContext.values()];
  const diagnostic = JSON.stringify(sequences);
  if (caseId === 'REN-009') {
    invariant(
      sequences.some((sequence) => containsHeightBands(sequence, [[9, 11], [35, 38], [39, 41]])),
      `${prefix} visible 10 -> 36.25 -> 40 bar projection (${diagnostic})`,
    );
    return;
  }
  if (caseId === 'ANI-001') {
    invariant(
      sequences.some((sequence) => containsHeightBands(
        sequence,
        [[9, 11], [35, 38], [21, 24], [19, 21]],
      )),
      `${prefix} visible retargeted 10 -> 36.25 -> 22.03125 -> 20 projection (${diagnostic})`,
    );
    return;
  }
  invariant(caseId === 'ANI-002', `${prefix} supported animation case`);
  const matchingSchedules = sequences.filter((sequence) => containsHeightBands(
    sequence,
    [[9, 11], [35, 38], [39, 41]],
  ));
  invariant(
    matchingSchedules.length >= 2,
    `${prefix} both frame-cadence schedules reach the same visible projection (${diagnostic})`,
  );
}

function frameBarHeight(frame) {
  const heights = frame.draws
    .map((draw) => draw.barColumn?.height)
    .filter((height) => Number.isFinite(height) && height > 0);
  return heights.length === 0 ? null : Math.max(...heights);
}

function containsHeightBands(sequence, bands) {
  let cursor = 0;
  for (const value of sequence) {
    const [minimum, maximum] = bands[cursor] ?? [];
    if (minimum === undefined) break;
    if (value >= minimum && value <= maximum) cursor += 1;
  }
  return cursor === bands.length;
}

function containsOrderedRecords(records, expected) {
  let cursor = 0;
  for (const record of records) {
    if (sameJson(record, expected[cursor])) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

function compressConsecutive(values) {
  const compressed = [];
  for (const value of values) {
    if (compressed.at(-1) !== value) compressed.push(value);
  }
  return compressed;
}

function gpuFrameDiagnostic(gpu) {
  return JSON.stringify(gpu.frames.map((frame) => ({
    contextIndex: frame.contextIndex,
    frameIndex: frame.frameIndex,
    drawCount: frame.draws.length,
    center: compressConsecutive(frame.draws.map((draw) => draw.centerRgba)),
    barHeight: frameBarHeight(frame),
  })));
}

function assertRen005FocusedUi(ui, runLabel) {
  invariant(ui && typeof ui === 'object', `REN-005 ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `REN-005 ${runLabel} actual UI control`);
  invariant(
    sameJson(ui.actionStatuses, ['completed', 'completed', 'completed', 'completed']),
    `REN-005 ${runLabel} four completed DOM action rows`,
  );
  invariant(
    sameJson(ui.chooserOptions, [
      'alias',
      'url',
      'descriptor',
      'data-uri',
      'transformed',
      'hidden-image',
      'failed-image',
    ]),
    `REN-005 ${runLabel} seven specimen chooser`,
  );
  invariant(ui.descriptor.source === 'fixture-image', `REN-005 ${runLabel} descriptor source`);
  invariant(ui.descriptor.sourceKind === 'alias', `REN-005 ${runLabel} descriptor source kind`);
  invariant(ui.descriptor.state === 'resolved', `REN-005 ${runLabel} descriptor state`);
  invariant(ui.descriptor.role === 'image', `REN-005 ${runLabel} descriptor role`);
  invariant(ui.descriptor.bounds === '[0,0,32,32]', `REN-005 ${runLabel} descriptor bounds`);
  invariant(
    ui.descriptor.initialSource.includes('https://assets.example.test/image.svg'),
    `REN-005 ${runLabel} descriptor initial source`,
  );
  invariant(ui.descriptor.initialState === 'resolved', `REN-005 ${runLabel} descriptor initial state`);
  invariant(ui.descriptor.staleAttachCount === '0', `REN-005 ${runLabel} descriptor stale attach`);
  invariant(
    ui.descriptor.staleCompletionCount === '1',
    `REN-005 ${runLabel} descriptor stale completion`,
  );
  invariant(ui.failed.source === 'fixture://failed-image.png', `REN-005 ${runLabel} failed source`);
  invariant(ui.failed.state === 'failed', `REN-005 ${runLabel} failed state`);
  invariant(ui.failed.role === 'asset-placeholder', `REN-005 ${runLabel} failed role`);
  invariant(ui.failed.bounds === '[220,40,32,32]', `REN-005 ${runLabel} failed bounds`);
  invariant(ui.failed.diagnosticCount === '1', `REN-005 ${runLabel} failed diagnostic`);
  invariant(ui.counters.requests === '5', `REN-005 ${runLabel} request count`);
  invariant(
    ui.counters.backend === 'pending 0 · resolved 3 · rejected 1 · unloaded 1',
    `REN-005 ${runLabel} backend counters (${String(ui.counters.backend)})`,
  );
  invariant(ui.counters.resources === '4', `REN-005 ${runLabel} resource count`);
  invariant(Number(ui.counters.leases) > 0, `REN-005 ${runLabel} lease count`);
  invariant(ui.counters.stale === '1', `REN-005 ${runLabel} stale count`);
  invariant(ui.counters.pendingRelease === '0', `REN-005 ${runLabel} pending release count`);
  invariant(ui.requestJournal.count >= 15, `REN-005 ${runLabel} request journal rows`);
  invariant(ui.requestJournal.events.includes('load-rejected'), `REN-005 ${runLabel} rejected journal`);
  invariant(ui.requestJournal.events.includes('load-resolved'), `REN-005 ${runLabel} resolved journal`);
  invariant(ui.requestJournal.kinds.includes('descriptor'), `REN-005 ${runLabel} descriptor journal`);
  invariant(ui.requestJournal.kinds.includes('failed'), `REN-005 ${runLabel} failed journal`);
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `REN-005 ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `REN-005 ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `REN-005 ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `REN-005 ${runLabel} ${label}`);
  }
}

function assertTextFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused text UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const choices = caseId === 'REN-006'
    ? ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
    : [
        'placed',
        'auto',
        'wrap',
        'overflow-visible',
        'overflow-hidden',
        'overflow-ellipsis',
        'upright',
      ];
  const actionCount = caseId === 'REN-006' ? 6 : 4;
  const seededChoice = caseId === 'REN-006' ? 'empty' : 'overflow-hidden';
  invariant(
    sameJson(ui.actionStatuses, Array.from({ length: actionCount }, () => 'completed')),
    `${caseId} ${runLabel} completed canonical DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} actual chooser enabled`);
  invariant(ui.chooser.initialChoice === seededChoice, `${caseId} ${runLabel} seeded initial choice`);
  invariant(ui.chooser.seededChoice === seededChoice, `${caseId} ${runLabel} declared seeded choice`);
  invariant(
    sameJson(ui.chooser.options, choices.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed choice inventory`,
  );
  invariant(
    ui.observedChoiceCount === `${choices.length} / ${choices.length} observed`,
    `${caseId} ${runLabel} actual choice count`,
  );
  invariant(
    ui.displayOnlyNote.includes('folded actualObservation only')
      && ui.displayOnlyNote.includes('canonical action trace'),
    `${caseId} ${runLabel} display-only canonical-trace disclosure`,
  );
  invariant(
    choices.every((choice) => ui.choices[choice] && typeof ui.choices[choice] === 'object'),
    `${caseId} ${runLabel} every actual choice is readable`,
  );

  if (caseId === 'REN-006') assertRen006TextChoices(ui.choices, runLabel);
  else assertRen011TextChoices(ui.choices, runLabel);

  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
  }
}

function assertRen006TextChoices(choices, runLabel) {
  invariant(choices.initial.phase === 'initial', `REN-006 ${runLabel} initial phase`);
  invariant(
    choices.initial.source === JSON.stringify('A\r\n中😀é'),
    `REN-006 ${runLabel} exact initial Unicode source`,
  );
  invariant(choices.initial.lines === '["A","中😀é"]', `REN-006 ${runLabel} initial lines`);
  invariant(choices.initial['layout-bounds'] === '[0,0,40,40]', `REN-006 ${runLabel} initial layout`);
  invariant(choices.empty['visible-text'] === '""', `REN-006 ${runLabel} empty visible text`);
  invariant(choices.empty['layout-bounds'] === '[0,0,0,20]', `REN-006 ${runLabel} empty layout`);
  invariant(choices.long.lines === '["ABCD","EFGH","IJ"]', `REN-006 ${runLabel} long lines`);
  invariant(choices.long['layout-bounds'] === '[0,0,32,60]', `REN-006 ${runLabel} long layout`);
  invariant(
    choices['missing-font']['font-runs'] === '[{"text":"fallback","font":"unifont-base-16.0.04","fallbackReason":"requested-font-unavailable"}]',
    `REN-006 ${runLabel} missing-font fallback run`,
  );
  invariant(
    choices['missing-font']['layout-bounds'] === '[0,0,64,20]',
    `REN-006 ${runLabel} missing-font layout`,
  );
  invariant(choices.rapid['visible-text'] === '"final中"', `REN-006 ${runLabel} rapid final text`);
  invariant(choices.rapid['layout-bounds'] === '[0,0,56,20]', `REN-006 ${runLabel} rapid layout`);
  invariant(
    choices.rapid['intermediate-publication-count'] === '0',
    `REN-006 ${runLabel} no intermediate publication`,
  );
  invariant(choices.rapid['stale-glyph-count'] === '0', `REN-006 ${runLabel} rapid stale glyphs`);
  invariant(
    choices.terminal.source === JSON.stringify('مرحبا world'),
    `REN-006 ${runLabel} terminal source`,
  );
  invariant(choices.terminal.lines === '["مرحبا world"]', `REN-006 ${runLabel} terminal lines`);
  invariant(
    choices.terminal['font-runs'] === '[{"text":"مرحبا world","font":"unifont-base-16.0.04"}]',
    `REN-006 ${runLabel} terminal fallback run`,
  );
  invariant(
    choices.terminal['layout-bounds'] === '{"x":0,"y":0,"width":88,"height":20}',
    `REN-006 ${runLabel} terminal layout`,
  );
  invariant(
    choices.terminal['world-bounds'] === '{"x":4.823619,"y":20,"width":90.177854,"height":42.094592}',
    `REN-006 ${runLabel} terminal world bounds`,
  );
  invariant(
    choices.terminal['hit-bounds'] === choices.terminal['world-bounds'],
    `REN-006 ${runLabel} terminal hit parity`,
  );
  invariant(choices.terminal.publication === 'current', `REN-006 ${runLabel} terminal publication`);
  invariant(choices.terminal['stale-glyph-count'] === '0', `REN-006 ${runLabel} terminal stale glyphs`);
  invariant(choices.terminal['renderer-route'] === 'fallback-text', `REN-006 ${runLabel} text route`);
  invariant(
    choices.terminal.style === '{"fontFamily":"Unifont","fontSize":16,"lineHeight":20,"letterSpacing":0,"fill":"#222222ff"}',
    `REN-006 ${runLabel} terminal style`,
  );
  invariant(
    choices.terminal.geometry === '{"positionWorld":[10,20],"rotationDegrees":15}',
    `REN-006 ${runLabel} terminal transform`,
  );
  invariant(
    ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
      .every((choice) => choices[choice].publication === 'current'),
    `REN-006 ${runLabel} displayed phases share terminal publication fact`,
  );
}

function assertRen011TextChoices(choices, runLabel) {
  invariant(choices.placed.source === '"AB"', `REN-011 ${runLabel} placed source`);
  invariant(choices.placed.placement === 'right-bottom', `REN-011 ${runLabel} placed placement`);
  invariant(choices.placed.margin === '5', `REN-011 ${runLabel} placed margin`);
  invariant(choices.placed.tint === '#ff0000', `REN-011 ${runLabel} placed authored tint`);
  invariant(choices.placed.rgba === '#ff0000ff', `REN-011 ${runLabel} placed projected tint`);
  invariant(choices.placed['local-bounds'] === '[219,135,16,20]', `REN-011 ${runLabel} placed geometry`);
  invariant(choices.placed['paint-tint'] === '#ff0000ff', `REN-011 ${runLabel} placed paint`);
  invariant(choices.auto.source === '"ABCD"', `REN-011 ${runLabel} auto source`);
  invariant(choices.auto.frame === '[32,20]', `REN-011 ${runLabel} auto frame`);
  invariant(
    choices.auto['auto-font'] === '{"min":8,"max":18,"chosen":16}',
    `REN-011 ${runLabel} auto font`,
  );
  invariant(choices.auto['visible-text'] === '"ABCD"', `REN-011 ${runLabel} auto visible text`);
  invariant(choices.auto['layout-bounds'] === '[0,0,32,20]', `REN-011 ${runLabel} auto layout`);
  invariant(choices.wrap.source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} wrap source`);
  invariant(choices.wrap['wrap-width'] === '32', `REN-011 ${runLabel} wrap width`);
  invariant(choices.wrap.lines === '["ABCD","EFGH","IJ"]', `REN-011 ${runLabel} wrap lines`);
  invariant(choices.wrap['layout-bounds'] === '[0,0,32,60]', `REN-011 ${runLabel} wrap layout`);
  for (const [choice, overflow, visibleText, layoutBounds] of [
    ['overflow-visible', 'visible', 'ABCDEFGHIJ', '[0,0,80,20]'],
    ['overflow-hidden', 'hidden', 'ABCD', '[0,0,32,20]'],
    ['overflow-ellipsis', 'ellipsis', 'ABC…', '[0,0,32,20]'],
  ]) {
    invariant(choices[choice].source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} ${choice} source`);
    invariant(choices[choice].frame === '[32,20]', `REN-011 ${runLabel} ${choice} frame`);
    invariant(choices[choice].overflow === overflow, `REN-011 ${runLabel} ${choice} mode`);
    invariant(
      choices[choice]['visible-text'] === JSON.stringify(visibleText),
      `REN-011 ${runLabel} ${choice} visible text`,
    );
    invariant(
      choices[choice]['layout-bounds'] === layoutBounds,
      `REN-011 ${runLabel} ${choice} layout`,
    );
  }
  invariant(choices.upright.source === '"AB"', `REN-011 ${runLabel} upright source`);
  invariant(choices.upright.placement === 'center', `REN-011 ${runLabel} upright placement`);
  invariant(choices.upright['item-angle'] === '37', `REN-011 ${runLabel} upright item angle`);
  invariant(choices.upright.orientation === 'upright', `REN-011 ${runLabel} upright orientation`);
  invariant(choices.upright['screen-angle'] === '0', `REN-011 ${runLabel} upright screen angle`);
  invariant(choices.upright['layout-bounds'] === '[0,0,16,20]', `REN-011 ${runLabel} upright layout`);
  invariant(
    Object.values(choices).every((facts) => facts.publication === 'current'),
    `REN-011 ${runLabel} current publication`,
  );
  invariant(
    Object.values(choices).every((facts) => facts['all-rows-exact'] === 'true'),
    `REN-011 ${runLabel} semantically exact matrix`,
  );
}

function assertComponentAssetFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const phases = caseId === 'REN-008'
    ? ['initial', 'image', 'hidden', 'shown']
    : ['initial', 'replacement', 'tint'];
  invariant(
    sameJson(ui.actionStatuses, phases.map(() => 'completed')),
    `${caseId} ${runLabel} completed DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} observed phase chooser enabled`);
  invariant(
    sameJson(ui.chooser.options, phases.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed phase inventory`,
  );
  invariant(
    ui.observedPhaseCount === `${phases.length} / ${phases.length} observed`,
    `${caseId} ${runLabel} phase observation count`,
  );

  const phaseFacts = phases.map((phase) => ui.phases[phase]);
  invariant(
    phaseFacts.every((facts) => facts && typeof facts === 'object'),
    `${caseId} ${runLabel} phase facts exist`,
  );
  if (caseId === 'REN-008') {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item', `REN-008 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'bg', `REN-008 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item::background:bg',
        `REN-008 ${runLabel} stable dense entity identity`,
      );
      invariant(
        facts['authored-size'] === '{"width":20,"height":10}',
        `REN-008 ${runLabel} inert authored size`,
      );
      invariant(
        facts['full-bounds'] === '[0,0,100,80]',
        `REN-008 ${runLabel} full item bounds`,
      );
    }
    invariant(ui.phases.initial.phase === 'A0 Rect', `REN-008 ${runLabel} initial phase label`);
    invariant(ui.phases.initial['render-role'] === 'background-geometry', `REN-008 ${runLabel} rect phase`);
    invariant(
      ui.phases.initial['render-object-count'] === '0',
      `REN-008 ${runLabel} aggregate rect has no per-component render object`,
    );
    invariant(ui.phases.initial['stale-count'] === 'not applicable', `REN-008 ${runLabel} rect has no texture`);
    invariant(ui.phases.image.phase === 'A1 Image', `REN-008 ${runLabel} image phase label`);
    invariant(ui.phases.image.source === 'fixture-image', `REN-008 ${runLabel} image source`);
    invariant(ui.phases.image['resource-state'] === 'resolved', `REN-008 ${runLabel} image resolved`);
    invariant(ui.phases.image['render-role'] === 'background-asset', `REN-008 ${runLabel} image lane`);
    invariant(ui.phases.image['binding-key'] === 'alias:fixture-image', `REN-008 ${runLabel} image binding`);
    invariant(ui.phases.image.generation === '1', `REN-008 ${runLabel} image generation`);
    invariant(ui.phases.image['render-object-count'] === '1', `REN-008 ${runLabel} image object`);
    invariant(ui.phases.image['stale-count'] === '0', `REN-008 ${runLabel} image zero stale attachment`);
    invariant(ui.phases.hidden.phase === 'A2 Hidden', `REN-008 ${runLabel} hidden phase label`);
    invariant(ui.phases.hidden['visible-bounds'] === 'null', `REN-008 ${runLabel} hidden bounds`);
    invariant(ui.phases.hidden['render-object-count'] === '0', `REN-008 ${runLabel} hidden renderer object`);
    invariant(ui.phases.hidden.generation === '2', `REN-008 ${runLabel} hidden generation`);
    invariant(ui.phases.hidden['stale-count'] === '0', `REN-008 ${runLabel} hidden zero stale attachment`);
    invariant(ui.phases.shown.phase === 'A3 Shown', `REN-008 ${runLabel} shown phase label`);
    invariant(ui.phases.shown.source === 'fixture-image', `REN-008 ${runLabel} shown source`);
    invariant(ui.phases.shown['visible-bounds'] === '[0,0,100,80]', `REN-008 ${runLabel} shown bounds`);
    invariant(ui.phases.shown['render-object-count'] === '1', `REN-008 ${runLabel} shown renderer object`);
    invariant(ui.phases.shown.generation === '3', `REN-008 ${runLabel} shown generation`);
    invariant(ui.phases.shown['stale-count'] === '0', `REN-008 ${runLabel} shown zero stale attachment`);
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-008 ${runLabel} stable logical identity`,
    );
    invariant(ui.captureId === 'bg', `REN-008 ${runLabel} declared capture identity`);
  } else {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item-a', `REN-010 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'icon', `REN-010 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item-a::icon:icon',
        `REN-010 ${runLabel} stable dense entity identity`,
      );
      invariant(facts['content-box'] === '[10,10,80,60]', `REN-010 ${runLabel} content box`);
      invariant(facts['icon-bounds'] === '[47,12,40,15]', `REN-010 ${runLabel} icon bounds`);
      invariant(
        facts['authored-size'] === '{"width":"50%","height":"25%"}',
        `REN-010 ${runLabel} authored percentage size`,
      );
      invariant(facts.placement === 'right-top', `REN-010 ${runLabel} placement`);
      invariant(
        facts.margins === '{"top":2,"right":3,"bottom":0,"left":0}',
        `REN-010 ${runLabel} margins`,
      );
      invariant(facts['render-role'] === 'content-asset', `REN-010 ${runLabel} content asset lane`);
      invariant(facts['render-object-count'] === '1', `REN-010 ${runLabel} one icon object`);
      invariant(facts['stale-count'] === '0', `REN-010 ${runLabel} zero stale attachment`);
    }
    invariant(ui.phases.initial.source === 'fixture-icon', `REN-010 ${runLabel} initial source`);
    invariant(ui.phases.initial['binding-key'] === 'alias:fixture-icon', `REN-010 ${runLabel} initial binding`);
    invariant(ui.phases.initial.generation === '1', `REN-010 ${runLabel} initial generation`);
    invariant(ui.phases.initial.phase === 'A0 Initial alias', `REN-010 ${runLabel} initial phase label`);
    invariant(ui.phases.replacement.source === 'fixture-icon-2', `REN-010 ${runLabel} replacement source`);
    invariant(ui.phases.replacement['binding-key'] === 'alias:fixture-icon-2', `REN-010 ${runLabel} replacement binding`);
    invariant(ui.phases.replacement.generation === '2', `REN-010 ${runLabel} replacement generation`);
    invariant(ui.phases.replacement.phase === 'A1 Replacement alias', `REN-010 ${runLabel} replacement phase label`);
    invariant(ui.phases.tint.source === 'fixture-icon-2', `REN-010 ${runLabel} tint retains source`);
    invariant(ui.phases.tint.generation === '2', `REN-010 ${runLabel} tint retains generation`);
    invariant(ui.phases.tint.phase === 'A2 Tint patch', `REN-010 ${runLabel} tint phase label`);
    invariant(ui.phases.tint['semantic-tint'] === '#00ff00ff', `REN-010 ${runLabel} semantic tint`);
    invariant(
      ui.phases.tint['renderer-tint'] === 'packed 0x00ff00ff · rgb 0x00ff00 · alpha 1.000',
      `REN-010 ${runLabel} renderer tint`,
    );
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-010 ${runLabel} stable logical identity`,
    );
  }

  invariant(ui.resources['canvas-count'] === '1', `${caseId} ${runLabel} live action canvas`);
  invariant(ui.resources['subscription-count'] === '6', `${caseId} ${runLabel} central subscriptions`);
  invariant(ui.resources['pending-work-count'] === '0', `${caseId} ${runLabel} no pending work`);
  invariant(ui.resources['binding-count'] === '1', `${caseId} ${runLabel} one current binding`);
  invariant(ui.resources['resource-count'] === '1', `${caseId} ${runLabel} one current resource`);
  invariant(ui.resources['lease-count'] === '1', `${caseId} ${runLabel} one current lease`);
  invariant(ui.resources['pending-settlement-count'] === '0', `${caseId} ${runLabel} no pending settlement`);
  invariant(ui.resources['pending-release-count'] === '0', `${caseId} ${runLabel} no pending release`);
  invariant(ui.resources['stale-attachment-resource-count'] === '0', `${caseId} ${runLabel} no stale resource`);
  invariant(ui.resources['renderer-object-resource-count'] === '1', `${caseId} ${runLabel} one renderer object`);
  invariant(ui.resources['cleanup-failure-count'] === '0', `${caseId} ${runLabel} no cleanup failure`);
  invariant(ui.resourceJournal.count > 0, `${caseId} ${runLabel} resource journal`);
  const expectedResourceEvents = caseId === 'REN-008'
    ? [
        'fixture-assets-registered',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
        'backend-texture-resolved',
        'component-asset-settled',
      ]
    : [
        'fixture-assets-registered',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
      ];
  invariant(
    sameJson(ui.resourceJournal.events, expectedResourceEvents),
    `${caseId} ${runLabel} deterministic resource journal`,
  );
  invariant(
    ui.resourceJournal.events.includes('backend-texture-resolved'),
    `${caseId} ${runLabel} resolved texture journal`,
  );
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
  }
}

async function loadExpectedCases() {
  const document = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
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
    'render checkpoint assertion inventory must remain 1821',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedFailures?.length ?? 0) ===
      EXPECTED_ASSERTION_FAILURE_TOTAL,
    'render checkpoint observed immutable conflict inventory must remain 21',
  );
  invariant(
    sum(
      RENDER_CASES,
      (record) => (record.expectedFailures?.length ?? 0) + (record.latentConflicts?.length ?? 0),
    ) === DECLARED_IMMUTABLE_CONFLICT_TOTAL,
    'render checkpoint declared immutable conflict inventory must remain 23',
  );
  return selected;
}

function attachErrorCapture(page, caseId, capturedErrors) {
  page.on('console', (message) => {
    if (message.type() === 'error') capturedErrors.console.push({ caseId, message: message.text() });
  });
  page.on('pageerror', (error) => {
    capturedErrors.page.push({ caseId, message: error.stack ?? error.message });
  });
  page.on('requestfailed', (request) => {
    capturedErrors.network.push({
      caseId,
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown request failure',
    });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (/^(?:fixture:|https?:\/\/assets\.example\.test(?:\/|$))/u.test(url)) {
      capturedErrors.externalFixture.push({ caseId, url });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      capturedErrors.network.push({ caseId, url: response.url(), error: `HTTP ${response.status()}` });
    }
  });
}

function summarizeComparison(comparison) {
  return {
    assertionCount: comparison.assertions.length,
    passed: comparison.passed,
    failed: comparison.failed,
    firstFailure: comparison.firstFailure,
    failures: comparisonFailures(comparison),
  };
}

function comparisonFailures(comparison) {
  return comparison.assertions
    .filter((assertion) => !assertion.passed)
    .map((assertion) => ({
      path: assertion.path,
      code: assertion.failure?.code ?? null,
      failurePath: assertion.failure?.path ?? null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function firstJsonDifference(left, right, pointer) {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${pointer}/length`;
    for (let index = 0; index < left.length; index += 1) {
      const nested = firstJsonDifference(left[index], right[index], `${pointer}/${index}`);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (
    left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
    && !Array.isArray(left)
    && !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!sameJson(leftKeys, rightKeys)) return `${pointer}/keys`;
    for (const key of leftKeys) {
      const nested = firstJsonDifference(
        left[key],
        right[key],
        `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
      );
      if (nested !== null) return nested;
    }
    return null;
  }
  return pointer || '/';
}

function cleanupStatus(cleanup) {
  return cleanup && typeof cleanup === 'object' && typeof cleanup.status === 'string'
    ? cleanup.status
    : null;
}

function parseArguments(arguments_) {
  let headed = false;
  let caseId = null;
  for (const argument of arguments_) {
    if (argument === '--headed') {
      headed = true;
      continue;
    }
    if (argument.startsWith('--case=')) {
      invariant(caseId === null, 'render case may be selected only once');
      caseId = argument.slice('--case='.length);
      invariant(/^[A-Z]{3}-\d{3}$/u.test(caseId), `invalid render case ${caseId}`);
      continue;
    }
    invariant(false, `unknown argument ${argument}`);
  }
  return { headed, caseId };
}

function traceCasePhase(caseId, phase) {
  process.stderr.write(`[core-v2-render-browser] ${caseId}: ${phase}\n`);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Core v2 render browser checkpoint timed out: ${label}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function sum(records, select) {
  return records.reduce((total, record) => total + select(record), 0);
}

function invariant(condition, message) {
  if (!condition) throw new Error(`Core v2 render browser checkpoint failed: ${message}`);
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'Error', message: String(error), stack: null };
}
