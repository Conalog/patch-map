import { PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS } from '../core-v2-contract/immutable-conflicts.mjs';

export const EXPECTED_ASSERTION_TOTAL = 2_028;
export const EXPECTED_ASSERTION_PASS_TOTAL = 1_988;
export const EXPECTED_ASSERTION_FAILURE_TOTAL = 26;
export const EXPECTED_PERFORMANCE_DEFICIT_TOTAL = 14;
export const DECLARED_IMMUTABLE_CONFLICT_TOTAL = 28;
export const CASE_TIMEOUT_MS = 180_000;
export const PERFORMANCE_CASE_TIMEOUT_MS = 20 * 60_000;
export const CHECKPOINT_TIMEOUT_MS = 30 * 60_000;
export const REN_005_IMMUTABLE_FAILURES = Object.freeze([
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
export const ANI_002_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/backwardTime/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/backwardTime/code',
  }),
]);
export const UPD_003_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/invalidCrossScope/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/invalidCrossScope/code',
  }),
]);
export const UPD_007_LATENT_IMMUTABLE_CONFLICTS = Object.freeze([
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
export const UPD_009_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/cycle/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/cycle/code',
  }),
]);
export const QRY_001_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/queries/ambiguous-component/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/queries/ambiguous-component/code',
  }),
]);
export const EVT_003_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/interaction/overlapRedrawTrace',
    code: 'VALUE_MISMATCH',
    failurePath: '/interaction/overlapRedrawTrace',
  }),
]);
export const EVT_008_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/events/clickCounts',
    code: 'VALUE_MISMATCH',
    failurePath: '/events/clickCounts',
  }),
]);
export const CSM_022_IMMUTABLE_FAILURES =
  PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS['CSM-022'];
export const CSM_024_IMMUTABLE_FAILURES =
  PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS['CSM-024'];
export const CSM_028_IMMUTABLE_FAILURES =
  PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS['CSM-028'];
export const CSM_030_IMMUTABLE_FAILURES =
  PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS['CSM-030'];
export const AST_002_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/outcome/validation/cyclic/code',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/validation/cyclic/code',
  }),
]);
export const LAY_004_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/geometry/orientationMatrix',
    code: 'VALUE_MISMATCH',
    failurePath: '/geometry/orientationMatrix',
  }),
  Object.freeze({
    path: '/text/upright/screenAngle/at90',
    code: 'VALUE_MISMATCH',
    failurePath: '/text/upright/screenAngle/at90',
  }),
]);
export const REN_011_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/geometry/texts/upright/screenAngle',
    code: 'VALUE_MISMATCH',
    failurePath: '/geometry/texts/upright/screenAngle',
  }),
  Object.freeze({
    path: '/outcome/textContractMatrix/allRowsExact',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/textContractMatrix/allRowsExact',
  }),
  Object.freeze({
    path: '/text/contractMatrix',
    code: 'VALUE_MISMATCH',
    failurePath: '/text/contractMatrix',
  }),
]);
export const PRF_001_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/actionToVisibleP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/actionToVisibleP95Ms',
  }),
  Object.freeze({
    path: '/outcome/frameGapP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/frameGapP95Ms',
  }),
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const PRF_002_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const PRF_003_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/actionToVisibleP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/actionToVisibleP95Ms',
  }),
  Object.freeze({
    path: '/outcome/frameGapP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/frameGapP95Ms',
  }),
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const PRF_004_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/actionToVisibleP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/actionToVisibleP95Ms',
  }),
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const PRF_005_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/actionToVisibleP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/actionToVisibleP95Ms',
  }),
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const PRF_006_PERFORMANCE_DEFICITS = Object.freeze([
  Object.freeze({
    path: '/outcome/frameGapP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/frameGapP95Ms',
  }),
  Object.freeze({
    path: '/outcome/inputToVisibleP95Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/inputToVisibleP95Ms',
  }),
  Object.freeze({
    path: '/outcome/longTaskAtLeast100Ms',
    code: 'VALUE_MISMATCH',
    failurePath: '/outcome/longTaskAtLeast100Ms',
  }),
]);
export const RENDER_CASES = Object.freeze([
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
  Object.freeze({
    id: 'LAY-004',
    expectedAssertions: 11,
    expectedFailures: LAY_004_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'REN-007', expectedAssertions: 26 }),
  Object.freeze({ id: 'REN-008', expectedAssertions: 10 }),
  Object.freeze({ id: 'REN-009', expectedAssertions: 13 }),
  Object.freeze({ id: 'REN-010', expectedAssertions: 11 }),
  Object.freeze({
    id: 'REN-011',
    expectedAssertions: 20,
    expectedFailures: REN_011_IMMUTABLE_FAILURES,
  }),
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
  Object.freeze({
    id: 'PRF-001',
    expectedAssertions: 9,
    expectedDeficits: PRF_001_PERFORMANCE_DEFICITS,
  }),
  Object.freeze({
    id: 'PRF-002',
    expectedAssertions: 10,
    expectedDeficits: PRF_002_PERFORMANCE_DEFICITS,
  }),
  Object.freeze({
    id: 'PRF-003',
    expectedAssertions: 8,
    expectedDeficits: PRF_003_PERFORMANCE_DEFICITS,
  }),
  Object.freeze({
    id: 'PRF-004',
    expectedAssertions: 7,
    expectedDeficits: PRF_004_PERFORMANCE_DEFICITS,
  }),
  Object.freeze({
    id: 'PRF-005',
    expectedAssertions: 6,
    expectedDeficits: PRF_005_PERFORMANCE_DEFICITS,
  }),
  Object.freeze({
    id: 'PRF-006',
    expectedAssertions: 6,
    expectedDeficits: PRF_006_PERFORMANCE_DEFICITS,
  }),
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
  Object.freeze({ id: 'PRF-009', expectedAssertions: 9 }),
  Object.freeze({ id: 'PIX-001', expectedAssertions: 6 }),
  Object.freeze({ id: 'PIX-002', expectedAssertions: 6 }),
  Object.freeze({ id: 'PIX-003', expectedAssertions: 13 }),
  Object.freeze({ id: 'PIX-004', expectedAssertions: 6 }),
  Object.freeze({ id: 'PIX-005', expectedAssertions: 9 }),
  Object.freeze({ id: 'PKG-001', expectedAssertions: 6 }),
  Object.freeze({ id: 'PKG-002', expectedAssertions: 7 }),
  Object.freeze({ id: 'PKG-003', expectedAssertions: 6, expectedMaxCanvas: 2 }),
  Object.freeze({ id: 'PKG-004', expectedAssertions: 11 }),
  Object.freeze({ id: 'PKG-005', expectedAssertions: 6 }),
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
  Object.freeze({ id: 'SEC-002', expectedAssertions: 6 }),
  Object.freeze({ id: 'SEC-003', expectedAssertions: 6, expectedMaxCanvas: 0 }),
  Object.freeze({ id: 'SEC-004', expectedAssertions: 6, expectedMaxCanvas: 0 }),
  Object.freeze({ id: 'ACC-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'ACC-002', expectedAssertions: 5 }),
  Object.freeze({ id: 'ACC-003', expectedAssertions: 6 }),
  Object.freeze({ id: 'OPS-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'OPS-002', expectedAssertions: 6 }),
  Object.freeze({ id: 'MIG-001', expectedAssertions: 10, expectedMaxCanvas: 2 }),
  Object.freeze({ id: 'MIG-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'MIG-003', expectedAssertions: 10 }),
  Object.freeze({ id: 'CSM-032', expectedAssertions: 21 }),
  Object.freeze({ id: 'CSM-033', expectedAssertions: 20 }),
  Object.freeze({ id: 'CSM-034', expectedAssertions: 23 }),
  Object.freeze({ id: 'LIF-006', expectedAssertions: 17 }),
]);
export const FOCUSED_UI_CASES = new Set(['REN-005', 'REN-006', 'REN-008', 'REN-010', 'REN-011']);
export const PRESENTATION_TRANCHE_CASES = new Set([
  'LAY-002',
  'LAY-003',
  'UPD-005',
  'REN-009',
  'ANI-001',
  'ANI-002',
]);
export const UPDATE_TRANSACTION_TRANCHE_CASES = new Set([
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
export const VIEWPORT_TRANCHE_CASES = new Set([
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
export const QUERY_SELECTION_TRANCHE_CASES = new Set([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
]);
export const POINTER_SELECTION_TRANCHE_CASES = new Set([
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
export const INTERACTION_EDITOR_TRANCHE_CASES = new Set([
  'CSM-013',
  'CSM-018',
  'CSM-022',
  'CSM-023',
  'CSM-024',
]);
export const AUTHORING_TRANCHE_CASES = new Set([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
]);
export const EDITOR_WORKFLOW_TRANCHE_CASES = new Set([
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-033',
  'CSM-034',
]);
export const HISTORY_TRANCHE_CASES = new Set([
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
]);
export const REPLACEMENT_RECOVERY_TRANCHE_CASES = new Set([
  'ERR-002',
  'ERR-005',
  'LIF-003',
  'CSM-002',
  'CSM-004',
  'CSM-037',
]);
export const LIFECYCLE_INTERRUPTION_TRANCHE_CASES = new Set([
  'ERR-004',
  'ERR-006',
  'PRF-007',
  'CSM-017',
  'CSM-036',
]);
export const DETERMINISM_LIFECYCLE_TRANCHE_CASES = new Set([
  'DET-001',
  'DET-002',
  'DET-003',
  'ANI-003',
  'LIF-006',
]);
export const EXPORT_EXTRACTION_TRANCHE_CASES = new Set([
  'DET-004',
  'PIX-004',
  'PRF-008',
  'CSM-035',
  'CSM-038',
]);
export const PIXIJS_INTEGRATION_TRANCHE_CASES = new Set([
  'PIX-001',
  'PIX-002',
  'PIX-003',
  'PIX-005',
]);
export const PACKAGE_INTEGRATION_TRANCHE_CASES = new Set([
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
]);
export const SECURITY_OPERATIONS_TRANCHE_CASES = new Set([
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'OPS-001',
  'OPS-002',
]);
export const ACCESSIBILITY_TRANCHE_CASES = new Set([
  'ACC-001',
  'ACC-002',
  'ACC-003',
]);
export const MIGRATION_TRANCHE_CASES = new Set([
  'MIG-001',
  'MIG-002',
  'MIG-003',
]);
export const PERFORMANCE_TRANCHE_CASES = new Set([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);
export const PERFORMANCE_GPU_CASES = new Set([
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);
export const CONTROL_CASES = new Set([
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
  ...PIXIJS_INTEGRATION_TRANCHE_CASES,
  ...PACKAGE_INTEGRATION_TRANCHE_CASES,
  ...SECURITY_OPERATIONS_TRANCHE_CASES,
  ...ACCESSIBILITY_TRANCHE_CASES,
  ...MIGRATION_TRANCHE_CASES,
  ...PERFORMANCE_GPU_CASES,
]);
export const DOM_CONTROL_CASES = new Set([...FOCUSED_UI_CASES, ...CONTROL_CASES]);
export const GPU_EVIDENCE_CASES = new Set([
  'LAY-003',
  'REN-009',
  'ANI-001',
  'ANI-002',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'LIF-003',
  'CSM-037',
  'PIX-001',
  'PIX-002',
  'PIX-003',
  'SEC-002',
  'OPS-001',
  'OPS-002',
  ...ACCESSIBILITY_TRANCHE_CASES,
  ...MIGRATION_TRANCHE_CASES,
  ...DETERMINISM_LIFECYCLE_TRANCHE_CASES,
  ...AUTHORING_TRANCHE_CASES,
  ...EDITOR_WORKFLOW_TRANCHE_CASES,
  ...PERFORMANCE_GPU_CASES,
]);
