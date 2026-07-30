import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- the committed verifier ledger is authored as an ESM JavaScript module.
import { PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS } from '../../scripts/verification/core-v2-contract/immutable-conflicts.mjs';

interface ImmutableConflict {
  readonly path: string;
  readonly code: string;
  readonly failurePath: string;
}

const declaredCsmConflicts = PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS as unknown as Readonly<
  Record<string, readonly ImmutableConflict[]>
>;

const scriptUrl = new URL(
  '../../scripts/verification/core-v2-contract-render-browser.mjs',
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);
let source = '';

beforeAll(async () => {
  source = await readFile(scriptPath, 'utf8');
});

describe('PatchMap render browser checkpoint script', () => {
  it('is valid Node syntax', () => {
    const checked = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    expect(checked.status).toBe(0);
    expect(checked.stderr).toBe('');
  });

  it('pins exactly the one-hundred-fifty-eight selected routes and their 2028 canonical assertions', () => {
    const caseBlock = source.match(
      /const RENDER_CASES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body;
    expect(caseBlock).toBeDefined();
    const records = [...(caseBlock ?? '').matchAll(
      /id: '(?<id>[A-Z]{3}-\d{3})',\s*expectedAssertions: (?<count>\d+)/gu,
    )].map((match) => ({
      id: match.groups?.id,
      expectedAssertions: Number(match.groups?.count),
    }));

    expect(records).toEqual([
      { id: 'LAY-001', expectedAssertions: 9 },
      { id: 'LAY-002', expectedAssertions: 28 },
      { id: 'LAY-003', expectedAssertions: 9 },
      { id: 'REN-001', expectedAssertions: 9 },
      { id: 'REN-004', expectedAssertions: 10 },
      { id: 'REN-005', expectedAssertions: 28 },
      { id: 'REN-006', expectedAssertions: 30 },
      { id: 'REN-003', expectedAssertions: 12 },
      { id: 'REN-002', expectedAssertions: 9 },
      { id: 'LAY-005', expectedAssertions: 14 },
      { id: 'LAY-004', expectedAssertions: 11 },
      { id: 'REN-007', expectedAssertions: 26 },
      { id: 'REN-008', expectedAssertions: 10 },
      { id: 'REN-009', expectedAssertions: 13 },
      { id: 'REN-010', expectedAssertions: 11 },
      { id: 'REN-011', expectedAssertions: 20 },
      { id: 'ERR-001', expectedAssertions: 6 },
      { id: 'UPD-001', expectedAssertions: 8 },
      { id: 'UPD-002', expectedAssertions: 11 },
      { id: 'UPD-003', expectedAssertions: 13 },
      { id: 'UPD-004', expectedAssertions: 12 },
      { id: 'UPD-005', expectedAssertions: 10 },
      { id: 'UPD-006', expectedAssertions: 11 },
      { id: 'UPD-007', expectedAssertions: 15 },
      { id: 'UPD-008', expectedAssertions: 13 },
      { id: 'UPD-009', expectedAssertions: 14 },
      { id: 'UPD-010', expectedAssertions: 12 },
      { id: 'UPD-011', expectedAssertions: 10 },
      { id: 'UPD-012', expectedAssertions: 10 },
      { id: 'ANI-001', expectedAssertions: 14 },
      { id: 'ANI-002', expectedAssertions: 11 },
      { id: 'ANI-003', expectedAssertions: 14 },
      { id: 'UPD-013', expectedAssertions: 8 },
      { id: 'UPD-014', expectedAssertions: 10 },
      { id: 'CSM-005', expectedAssertions: 21 },
      { id: 'CSM-006', expectedAssertions: 22 },
      { id: 'CSM-007', expectedAssertions: 21 },
      { id: 'CSM-008', expectedAssertions: 19 },
      { id: 'QRY-001', expectedAssertions: 13 },
      { id: 'QRY-002', expectedAssertions: 10 },
      { id: 'SEL-001', expectedAssertions: 10 },
      { id: 'SEL-002', expectedAssertions: 11 },
      { id: 'SEL-003', expectedAssertions: 7 },
      { id: 'SEL-004', expectedAssertions: 4 },
      { id: 'EVT-001', expectedAssertions: 40 },
      { id: 'EVT-002', expectedAssertions: 10 },
      { id: 'EVT-003', expectedAssertions: 7 },
      { id: 'EVT-004', expectedAssertions: 8 },
      { id: 'EVT-005', expectedAssertions: 7 },
      { id: 'EVT-006', expectedAssertions: 24 },
      { id: 'EVT-007', expectedAssertions: 8 },
      { id: 'EVT-008', expectedAssertions: 7 },
      { id: 'EVT-009', expectedAssertions: 7 },
      { id: 'SEL-005', expectedAssertions: 9 },
      { id: 'SEL-006', expectedAssertions: 9 },
      { id: 'SEL-007', expectedAssertions: 10 },
      { id: 'SEL-008', expectedAssertions: 9 },
      { id: 'SEL-009', expectedAssertions: 13 },
      { id: 'HIS-001', expectedAssertions: 13 },
      { id: 'HIS-002', expectedAssertions: 11 },
      { id: 'HIS-003', expectedAssertions: 8 },
      { id: 'HIS-004', expectedAssertions: 6 },
      { id: 'HIS-005', expectedAssertions: 11 },
      { id: 'HIS-006', expectedAssertions: 13 },
      { id: 'VIE-001', expectedAssertions: 10 },
      { id: 'VIE-002', expectedAssertions: 6 },
      { id: 'VIE-003', expectedAssertions: 14 },
      { id: 'VIE-004', expectedAssertions: 17 },
      { id: 'VIE-005', expectedAssertions: 6 },
      { id: 'VIE-006', expectedAssertions: 11 },
      { id: 'VIE-007', expectedAssertions: 8 },
      { id: 'VIE-008', expectedAssertions: 11 },
      { id: 'TRN-001', expectedAssertions: 7 },
      { id: 'TRN-002', expectedAssertions: 6 },
      { id: 'TRN-003', expectedAssertions: 9 },
      { id: 'TRN-004', expectedAssertions: 16 },
      { id: 'TRN-005', expectedAssertions: 11 },
      { id: 'TRN-006', expectedAssertions: 13 },
      { id: 'TRN-007', expectedAssertions: 8 },
      { id: 'TRN-008', expectedAssertions: 10 },
      { id: 'TRN-009', expectedAssertions: 12 },
      { id: 'TRN-010', expectedAssertions: 7 },
      { id: 'CSM-009', expectedAssertions: 21 },
      { id: 'CSM-010', expectedAssertions: 22 },
      { id: 'CSM-011', expectedAssertions: 17 },
      { id: 'CSM-012', expectedAssertions: 19 },
      { id: 'CSM-013', expectedAssertions: 20 },
      { id: 'CSM-014', expectedAssertions: 21 },
      { id: 'CSM-015', expectedAssertions: 19 },
      { id: 'CSM-016', expectedAssertions: 19 },
      { id: 'CSM-018', expectedAssertions: 20 },
      { id: 'CSM-020', expectedAssertions: 18 },
      { id: 'CSM-021', expectedAssertions: 19 },
      { id: 'CSM-022', expectedAssertions: 20 },
      { id: 'CSM-023', expectedAssertions: 21 },
      { id: 'CSM-024', expectedAssertions: 20 },
      { id: 'CSM-025', expectedAssertions: 22 },
      { id: 'CSM-026', expectedAssertions: 19 },
      { id: 'CSM-027', expectedAssertions: 26 },
      { id: 'CSM-019', expectedAssertions: 21 },
      { id: 'CSM-028', expectedAssertions: 18 },
      { id: 'CSM-029', expectedAssertions: 24 },
      { id: 'CSM-030', expectedAssertions: 21 },
      { id: 'CSM-031', expectedAssertions: 25 },
      { id: 'ERR-002', expectedAssertions: 10 },
      { id: 'ERR-004', expectedAssertions: 12 },
      { id: 'ERR-005', expectedAssertions: 6 },
      { id: 'ERR-006', expectedAssertions: 6 },
      { id: 'PRF-001', expectedAssertions: 9 },
      { id: 'PRF-002', expectedAssertions: 10 },
      { id: 'PRF-003', expectedAssertions: 8 },
      { id: 'PRF-004', expectedAssertions: 7 },
      { id: 'PRF-005', expectedAssertions: 6 },
      { id: 'PRF-006', expectedAssertions: 6 },
      { id: 'PRF-007', expectedAssertions: 9 },
      { id: 'LIF-003', expectedAssertions: 19 },
      { id: 'CSM-002', expectedAssertions: 21 },
      { id: 'CSM-004', expectedAssertions: 20 },
      { id: 'CSM-017', expectedAssertions: 20 },
      { id: 'CSM-036', expectedAssertions: 21 },
      { id: 'CSM-037', expectedAssertions: 23 },
      { id: 'DET-001', expectedAssertions: 4 },
      { id: 'DET-002', expectedAssertions: 9 },
      { id: 'DET-003', expectedAssertions: 5 },
      { id: 'DET-004', expectedAssertions: 5 },
      { id: 'PRF-008', expectedAssertions: 7 },
      { id: 'PRF-009', expectedAssertions: 9 },
      { id: 'PIX-001', expectedAssertions: 6 },
      { id: 'PIX-002', expectedAssertions: 6 },
      { id: 'PIX-003', expectedAssertions: 13 },
      { id: 'PIX-004', expectedAssertions: 6 },
      { id: 'PIX-005', expectedAssertions: 9 },
      { id: 'PKG-001', expectedAssertions: 6 },
      { id: 'PKG-002', expectedAssertions: 7 },
      { id: 'PKG-003', expectedAssertions: 6 },
      { id: 'PKG-004', expectedAssertions: 11 },
      { id: 'PKG-005', expectedAssertions: 6 },
      { id: 'CSM-035', expectedAssertions: 25 },
      { id: 'CSM-038', expectedAssertions: 27 },
      { id: 'ERR-003', expectedAssertions: 6 },
      { id: 'AST-002', expectedAssertions: 9 },
      { id: 'AST-003', expectedAssertions: 10 },
      { id: 'SEC-001', expectedAssertions: 7 },
      { id: 'SEC-002', expectedAssertions: 6 },
      { id: 'SEC-003', expectedAssertions: 6 },
      { id: 'SEC-004', expectedAssertions: 6 },
      { id: 'ACC-001', expectedAssertions: 9 },
      { id: 'ACC-002', expectedAssertions: 5 },
      { id: 'ACC-003', expectedAssertions: 6 },
      { id: 'OPS-001', expectedAssertions: 9 },
      { id: 'OPS-002', expectedAssertions: 6 },
      { id: 'MIG-001', expectedAssertions: 10 },
      { id: 'MIG-002', expectedAssertions: 9 },
      { id: 'MIG-003', expectedAssertions: 10 },
      { id: 'CSM-032', expectedAssertions: 21 },
      { id: 'CSM-033', expectedAssertions: 20 },
      { id: 'CSM-034', expectedAssertions: 23 },
      { id: 'LIF-006', expectedAssertions: 17 },
    ]);
    expect(records).toHaveLength(158);
    expect(records.reduce((total, record) => total + record.expectedAssertions, 0)).toBe(2_028);
    expect(source).toContain('const EXPECTED_ASSERTION_TOTAL = 2_028;');
    expect(source).toContain('const EXPECTED_ASSERTION_PASS_TOTAL = 1_988;');
    expect(source).toContain('const EXPECTED_ASSERTION_FAILURE_TOTAL = 26;');
    expect(source).toContain('const EXPECTED_PERFORMANCE_DEFICIT_TOTAL = 14;');
    expect(source).toContain('const DECLARED_IMMUTABLE_CONFLICT_TOTAL = 28;');
    expect(source).toContain(
      "'canonical comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'",
    );
    expect(source).toContain(
      "'repeat comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'",
    );
    expect(source).toContain(
      "'fresh comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'",
    );
    expect(source).toContain("const DATASET_SIZE = '100';");
    expect(source).toContain('const SEED = 319;');
    expect(source).toContain('/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}');
    expect(source).toContain("new URL(page.url()).pathname + new URL(page.url()).search === route");
  });

  it('separates observed query/update conflicts from latent UPD-007 revision conflicts', () => {
    const conflictBlock = source.match(
      /const REN_005_IMMUTABLE_FAILURES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const failures = [...conflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));

    expect(failures).toEqual([
      {
        path: '/resources/images/alias',
        code: 'VALUE_MISMATCH',
        failurePath: '/resources/images/alias',
      },
      {
        path: '/resources/images/data-uri',
        code: 'VALUE_MISMATCH',
        failurePath: '/resources/images/data-uri',
      },
      {
        path: '/resources/images/url',
        code: 'VALUE_MISMATCH',
        failurePath: '/resources/images/url',
      },
    ]);
    const animationConflictBlock = source.match(
      /const ANI_002_IMMUTABLE_FAILURES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const animationFailures = [...animationConflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));
    expect(animationFailures).toEqual([{
      path: '/outcome/backwardTime/code',
      code: 'VALUE_MISMATCH',
      failurePath: '/outcome/backwardTime/code',
    }]);
    const updateConflictBlock = source.match(
      /const UPD_003_IMMUTABLE_FAILURES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const updateFailures = [...updateConflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));
    expect(updateFailures).toEqual([{
      path: '/outcome/invalidCrossScope/code',
      code: 'VALUE_MISMATCH',
      failurePath: '/outcome/invalidCrossScope/code',
    }]);
    const bulkConflictBlock = source.match(
      /const UPD_007_LATENT_IMMUTABLE_CONFLICTS = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const bulkFailures = [...bulkConflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));
    expect(bulkFailures).toEqual([
      {
        path: '/outcome/valid/queryRevision',
        code: 'VALUE_MISMATCH',
        failurePath: '/outcome/valid/queryRevision',
      },
      {
        path: '/outcome/valid/eventRevision',
        code: 'VALUE_MISMATCH',
        failurePath: '/outcome/valid/eventRevision',
      },
    ]);
    const structureConflictBlock = source.match(
      /const UPD_009_IMMUTABLE_FAILURES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const structureFailures = [...structureConflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));
    expect(structureFailures).toEqual([{
      path: '/outcome/cycle/code',
      code: 'VALUE_MISMATCH',
      failurePath: '/outcome/cycle/code',
    }]);
    const queryConflictBlock = source.match(
      /const QRY_001_IMMUTABLE_FAILURES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const queryFailures = [...queryConflictBlock.matchAll(
      /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
    )].map((match) => ({
      path: match.groups?.path,
      code: match.groups?.code,
      failurePath: match.groups?.failurePath,
    }));
    expect(queryFailures).toEqual([{
      path: '/outcome/queries/ambiguous-component/code',
      code: 'VALUE_MISMATCH',
      failurePath: '/outcome/queries/ambiguous-component/code',
    }]);
    expect(declaredCsmConflicts['CSM-022']).toEqual([
      {
        path: '/geometry/targets/item-a/worldBounds/x',
        code: 'VALUE_MISMATCH',
        failurePath: '/geometry/targets/item-a/worldBounds/x',
      },
      {
        path: '/geometry/targets/rect-b/worldBounds/x',
        code: 'VALUE_MISMATCH',
        failurePath: '/geometry/targets/rect-b/worldBounds/x',
      },
      {
        path: '/outcome/hostEngineSeam/failureRollback/conflictCode',
        code: 'VALUE_MISMATCH',
        failurePath: '/outcome/hostEngineSeam/failureRollback/conflictCode',
      },
    ]);
    expect(declaredCsmConflicts['CSM-024']).toEqual([
      {
        path: '/interaction/hitTarget',
        code: 'VALUE_MISMATCH',
        failurePath: '/interaction/hitTarget',
      },
      {
        path: '/outcome/hostEngineSeam/engineReturns/transformedHitTarget',
        code: 'VALUE_MISMATCH',
        failurePath: '/outcome/hostEngineSeam/engineReturns/transformedHitTarget',
      },
    ]);
    expect(source).toContain('comparison.passed === caseSpec.expectedAssertions - expectedFailures.length');
    expect(source).toContain('comparison.failed === expectedFailures.length');
    expect(source).toContain('sameJson(comparisonFailures(comparison), expectedFailures)');
    expect(source).toContain('latentConflicts: UPD_007_LATENT_IMMUTABLE_CONFLICTS');
    expect(source).toContain("'render checkpoint observed immutable conflict inventory must remain 26'");
    expect(source).toContain("'render checkpoint declared immutable conflict inventory must remain 28'");
    expect(source).toContain('latentCases: selectedRenderCases');
    expect(source).toContain(".filter((record) => (record.latentConflicts?.length ?? 0) > 0)");
    expect(source).toContain("import { inspectPatchMapUpdateConflictActuals } from './core-v2-contract/update-conflict-actuals.mjs';");
    expect(source).toContain('assertImmutableConflictActuals(caseSpec.id, run.actualObservation, runLabel)');
    expect(source).toContain('inspectPatchMapUpdateConflictActuals(caseId, actualObservation)');
  });

  it('reports measured performance deficits separately from immutable conflicts', () => {
    const deficitBlocks = [...source.matchAll(
      /const PRF_\d{3}_PERFORMANCE_DEFICITS = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/gu,
    )];
    const deficits = deficitBlocks.flatMap((match) => [
      ...(match.groups?.body ?? '').matchAll(
        /path: '(?<path>\/[^']+)',\s*code: '(?<code>[^']+)',\s*failurePath: '(?<failurePath>\/[^']+)'/gu,
      ),
    ].map((entry) => ({
      path: entry.groups?.path,
      code: entry.groups?.code,
      failurePath: entry.groups?.failurePath,
    })));

    expect(deficitBlocks).toHaveLength(6);
    expect(deficits).toHaveLength(14);
    expect(deficits.every(({ code, path, failurePath }) =>
      code === 'VALUE_MISMATCH' && path === failurePath)).toBe(true);
    expect(source).toContain('expectedDeficits: PRF_001_PERFORMANCE_DEFICITS');
    expect(source).toContain('expectedDeficits: PRF_006_PERFORMANCE_DEFICITS');
    expect(source).toContain('selectedObservedConflictTotal + selectedPerformanceDeficitTotal');
    expect(source).toContain('performanceDeficits: {');
    expect(source).toContain("report.status = selectedPerformanceDeficitTotal === 0");
    expect(source).toContain(": 'observed-contract-deficit';");
    expect(source).toContain('if (selectedPerformanceDeficitTotal > 0) process.exitCode = 2;');
    expect(source).toContain(
      "'render checkpoint measured performance deficit inventory must remain 14'",
    );
    expect(source).toContain(
      "'render checkpoint passing assertion inventory must remain 1988'",
    );
  });

  it('keeps canonical expected data outside the public Lab bridge executor', () => {
    expect(source.match(/catalog-normalized-expected\.v1\.json/gu)).toHaveLength(1);
    expect(source).toContain("import { compareObservation } from './core-v2-contract/compare.mjs';");
    expect(source).toContain('actual: browserRun.actualObservation');
    expect(source).toContain('fixtures: browserRun.fixtures');
    expect(source).toContain('captures: browserRun.captures');

    const browserRunSource = source.slice(
      source.indexOf('async function executeBrowserRun'),
      source.indexOf('function compareCaseRun'),
    );
    expect(browserRunSource).not.toMatch(/normalized|expectedCase|compareObservation|readFile/u);
    expect(browserRunSource).toContain('bridge[operationName]');
    expect(browserRunSource).toContain('bridge.actualObservation()');
  });

  it('uses only the focused Lab boundary and emits no committed evidence', () => {
    expect(source).toContain("const BRIDGE_NAME = '__PATCH_MAP_CONTRACT_LAB__';");
    expect(source).toContain("await executeBrowserRun(page, 'runCase')");
    expect(source).toContain("await executeBrowserRun(page, 'repeatCase')");
    expect(source).toContain('await bridge.destroyCase()');
    expect(source).toContain("process.argv.slice(2)");
    expect(source).toContain("if (argument === '--headed')");
    expect(source).toContain("if (argument.startsWith('--case='))");
    expect(source).toContain("return { headed, caseId }");
    expect(source).toContain("args: ['--js-flags=--expose-gc', '--enable-precise-memory-info']");
    expect(source).toContain('headless: !headed');
    expect(source).toContain("process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`)");
    expect(source).not.toMatch(
      /execute-worker|handlers\/|fold-[a-z]|src\/core-v2|performance\/core-v1|lab\/engine-comparison/u,
    );
    expect(source).not.toMatch(/writeFile|mkdir|results\//u);
  });

  it('bounds each route and closes browser and server ownership on completion or interruption', () => {
    expect(source).toContain('const CASE_TIMEOUT_MS = 180_000;');
    expect(source).toContain('const PERFORMANCE_CASE_TIMEOUT_MS = 20 * 60_000;');
    expect(source).toContain('const CHECKPOINT_TIMEOUT_MS = 30 * 60_000;');
    expect(source).toContain('process.once(\'SIGINT\', onInterrupt)');
    expect(source).toContain('process.once(\'SIGTERM\', onTerminate)');
    expect(source).toContain("requestShutdown('checkpoint-timeout')");
    expect(source).toContain('await withTimeout(');
    expect(source).toContain('PERFORMANCE_TRANCHE_CASES.has(caseSpec.id)');
    expect(source).toContain('completionTimeout: completionTimeoutMs');
    expect(source).toContain('`${caseSpec.id} first/repeat/fresh execution`');
    expect(source).toContain('await closeOwnedResources()');
    expect(source).toContain('await ownedBrowser.close().catch(() => undefined)');
    expect(source).toContain('await ownedServer.close().catch(() => undefined)');
    expect(source).toContain('[core-v2-render-browser] ${caseSpec.id} start');
    expect(source).toContain('[core-v2-render-browser] ${caseSpec.id} complete');
    expect(source).toContain("traceCasePhase(caseSpec.id, 'fresh session destroyed')");
  });

  it('drives REN-005 through the real Run and Repeat controls and returns focused DOM evidence', () => {
    expect(source).toContain("await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')");
    expect(source).toContain("await executeBrowserUiRun(page, caseSpec.id, 'repeatCase', 'repeat-action')");
    expect(source).toContain('button.click()');
    expect(source).toContain('waitForUiRunCompletion(bridge.state().rootTestId, operationName)');
    expect(source).toContain("root.addEventListener('patch-map-contract-run-complete', onComplete)");
    expect(source).toContain("typeof execution?.error?.message === 'string'");
    expect(source).toContain('completion did not include a run result${failureMessage}');
    const uiInvocationBranch = source.match(
      /if \(triggerTestId !== null\) \{(?<body>[\s\S]*?)\n\s*\} else \{/u,
    )?.groups?.body ?? '';
    expect(uiInvocationBranch).toContain('button.click()');
    expect(uiInvocationBranch).toContain('run = await completion');
    expect(uiInvocationBranch).not.toContain('invoke.call');
    expect(uiInvocationBranch).not.toContain('bridge.runCase');
    expect(uiInvocationBranch).not.toContain('bridge.repeatCase');
    expect(source).toContain('async function collectRen005FocusedUi');
    expect(source).toContain("statuses.length === 4");
    expect(source).toContain("statuses.every((status) => status === 'completed')");
    expect(source).toContain("'[data-testid=\"ren-005-specimen-select\"]'");
    expect(source).toContain("selectedFacts('descriptor')");
    expect(source).toContain("selectedFacts('failed-image')");
    expect(source).toContain("'[data-testid=\"ren-005-request-journal-row\"]'");
    expect(source).toContain("'[data-testid=\"ren-005-performance-journal-row\"]'");
    expect(source).toContain('assertRen005FocusedUi(run.ui, runLabel)');
    expect(source).toContain("ui.descriptor.staleCompletionCount === '1'");
    expect(source).toContain("ui.failed.role === 'asset-placeholder'");
    expect(source).toContain("ui.counters.requests === '5'");
    expect(source).toContain("ui.requestJournal.events.includes('load-rejected')");
    expect(source).toContain('Number.isFinite(Number(value)) && Number(value) >= 0');
    expect(source).toContain('focusedUi: DOM_CONTROL_CASES.has(caseSpec.id)');
  });

  it('drives product tranches, including interaction/editor and authoring, through controls', () => {
    expect(source).toContain("const PRESENTATION_TRANCHE_CASES = new Set([");
    for (const caseId of ['LAY-002', 'LAY-003', 'UPD-005', 'REN-009', 'ANI-001', 'ANI-002']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const UPDATE_TRANSACTION_TRANCHE_CASES = new Set([');
    for (const caseId of [
      'UPD-001',
      'UPD-002',
      'UPD-003',
      'UPD-004',
      'UPD-006',
      'UPD-007',
      'UPD-008',
      'UPD-009',
      'LIF-003',
      'CSM-037',
      'UPD-010',
      'UPD-011',
      'UPD-012',
      'UPD-013',
      'UPD-014',
    ]) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const PIXIJS_INTEGRATION_TRANCHE_CASES = new Set([');
    for (const caseId of ['PIX-001', 'PIX-002', 'PIX-003', 'PIX-005']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const PACKAGE_INTEGRATION_TRANCHE_CASES = new Set([');
    for (const caseId of ['PKG-001', 'PKG-002', 'PKG-003', 'PKG-004', 'PKG-005']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('...PACKAGE_INTEGRATION_TRANCHE_CASES');
    expect(source).toContain('const POINTER_SELECTION_TRANCHE_CASES = new Set([');
    for (const caseId of [
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
    ]) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const INTERACTION_EDITOR_TRANCHE_CASES = new Set([');
    for (const caseId of ['CSM-013', 'CSM-018', 'CSM-022', 'CSM-023', 'CSM-024']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('...INTERACTION_EDITOR_TRANCHE_CASES');
    expect(source).toContain('const AUTHORING_TRANCHE_CASES = new Set([');
    for (const caseId of ['CSM-019', 'CSM-028', 'CSM-029', 'CSM-030', 'CSM-031']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('...AUTHORING_TRANCHE_CASES');
    expect(source).toContain('const DETERMINISM_LIFECYCLE_TRANCHE_CASES = new Set([');
    for (const caseId of ['DET-001', 'DET-002', 'DET-003', 'ANI-003', 'LIF-006']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('...DETERMINISM_LIFECYCLE_TRANCHE_CASES');
    expect(source).toContain('const HISTORY_TRANCHE_CASES = new Set([');
    for (const caseId of [
      'HIS-001',
      'HIS-002',
      'HIS-003',
      'HIS-004',
      'HIS-005',
      'HIS-006',
    ]) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const VIEWPORT_TRANCHE_CASES = new Set([');
    for (const caseId of [
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
    ]) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const QUERY_SELECTION_TRANCHE_CASES = new Set([');
    for (const caseId of [
      'QRY-001',
      'QRY-002',
      'SEL-001',
      'SEL-002',
      'SEL-003',
      'SEL-004',
    ]) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain('const ACCESSIBILITY_TRANCHE_CASES = new Set([');
    for (const caseId of ['ACC-001', 'ACC-002', 'ACC-003']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain("if (caseSpec.id === 'VIE-001')");
    expect(source).toContain('await verifyViewportRootInput(page)');
    expect(source).toContain("caseSpec.id === 'EVT-003'");
    expect(source).toContain("caseSpec.id === 'EVT-008'");
    expect(source).toContain("caseSpec.id === 'ACC-002'");
    expect(source).toContain('await verifyPointerRootInput(page, caseSpec.id)');
    expect(source).toContain("state?.status === 'armed'");
    expect(source).toContain('state.caseId === expectedCaseId');
    expect(source).toContain('`[data-testid="scenario-${expectedCaseId.toLowerCase()}"]`');
    expect(source).toContain('return bridge.armGesture(0)');
    expect(source).toContain("await bridge.awaitMilestone(0, 'settled')");
    expect(source).toContain("await bridge.awaitMilestone(0, 'released')");
    expect(source).toContain("observed.events[0]?.source === 'pointer'");
    expect(source).toContain("observed.events[1]?.source === 'wheel'");
    expect(source).toContain('const cursorScreenError = Math.hypot(');
    expect(source).toContain('Number.isFinite(cursorScreenError) && cursorScreenError < 1');
    expect(source).toContain('observed.nativeWheel?.count === 1');
    expect(source).toContain("event?.type === 'hover-change'");
    expect(source).toContain("event?.type === 'click' && event.payload?.button === 2");
    expect(source).toContain("observation.snapshot.selectionIds[0] === 'rect-b'");
    expect(source).toContain("surface?.focusedId === 'rect-b'");
    expect(source).toContain("performedActions?.includes('activate')");
    expect(source).toContain('observed.ownership?.rootListenerCount === 8');
    expect(source).toContain('observed.nativeContextMenu[0]?.defaultPrevented === true');
    expect(source).toContain('observed.nativeContextMenu[1]?.defaultPrevented === false');
    expect(source).toContain('const DOM_CONTROL_CASES = new Set([...FOCUSED_UI_CASES, ...CONTROL_CASES]);');
    expect(source).toContain('const first = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('const repeat = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('const run = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('if (options.generic) return collectGenericFocusedUi(options);');
    expect(source).toContain('async function collectGenericFocusedUi');
    expect(source).toContain("root.addEventListener('patch-map-contract-run-complete', onComplete)");
    expect(source).toContain("const button = document.querySelector('[data-testid=\"destroy-case\"]')");
    expect(source).toContain("root.addEventListener('patch-map-contract-destroy-complete', onComplete)");
    expect(source).toContain("trigger = 'click:destroy-case'");
    expect(source).toContain("destroyed.trigger === 'click:destroy-case'");
    expect(source).toContain("ui.trigger === expectedTrigger");
    expect(source).toContain("ui.controls?.repeatDisabled === false");
    expect(source).toContain("ui.controls?.destroyDisabled === false");
  });

  it('captures WebGL2 draw evidence for paint, animation, lifecycle, and update publication', () => {
    const gpuCaseBlock = source.match(
      /const GPU_EVIDENCE_CASES = new Set\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    expect([...gpuCaseBlock.matchAll(/'(?<id>[A-Z]{3}-\d{3})'/gu)]
      .map((match) => match.groups?.id)).toEqual([
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
    ]);
    expect(gpuCaseBlock).toContain('...DETERMINISM_LIFECYCLE_TRANCHE_CASES');
    expect(gpuCaseBlock).toContain('...ACCESSIBILITY_TRANCHE_CASES');
    expect(gpuCaseBlock).toContain('...PERFORMANCE_GPU_CASES');
    expect(source).toContain('await installWebGlCanvasProbe(page, caseSpec.id)');
    expect(source).toContain('await page.addInitScript(({ probeName, caseIdentity }) => {');
    expect(source).toContain('const originalGetContext = HTMLCanvasElement.prototype.getContext;');
    expect(source).toContain("actualContext: typeof WebGL2RenderingContext !== 'undefined'");
    expect(source).toContain("'drawElementsInstanced'");
    expect(source).toContain('context.readPixels(x, y, 1, 1');
    expect(source).toContain('context.readPixels(x, 0, 1, canvas.height');
    expect(source).toContain('const candidateCssXs = [32, 40, 48, 56, 64, 72, 80, 88]');
    expect(source).toContain('column.height > bestColumn.height');
    expect(source).toContain('if (PIXIJS_INTEGRATION_TRANCHE_CASES.has(caseId)) return;');
    expect(source).toContain('if (SECURITY_OPERATIONS_TRANCHE_CASES.has(caseId)) return;');
    expect(source).toContain('if (ACCESSIBILITY_TRANCHE_CASES.has(caseId)) return;');
    expect(source).toContain('assertAccessibilityActuals(caseSpec.id, run.actualObservation, runLabel)');
    expect(source).toContain('surface.shadowDomNodeCount === 3');
    expect(source).toContain('surface.rootListenerCount === 1');
    expect(source).toContain('surface.entityListenerCount === 0');
    expect(source).toContain('surface.shadowDomFocusedId === focusedId');
    expect(source).toContain('if (PERFORMANCE_GPU_CASES.has(caseId)) return;');
    expect(source).toContain('assertLay003GpuPaintOrder(gpu, prefix, actualObservation)');
    expect(source).toContain('batch-compatible topmost GPU frames');
    expect(source).toContain('batch-compatible GPU frames correlate with public product paint order');
    expect(source).toContain('visible 10 -> 36.25 -> 40 bar projection');
    expect(source).toContain('visible retargeted 10 -> 36.25 -> 22.03125 -> 20 projection');
    expect(source).toContain('both frame-cadence schedules reach the same visible projection');
    expect(source).toContain('assertUpd007GpuPublication(gpu, prefix)');
    expect(source).toContain('assertUpd008GpuPublication(gpu, prefix)');
    expect(source).toContain('assertUpd009GpuPublication(gpu, prefix)');
    expect(source).toContain('assertLif003GpuReplacement(gpu, prefix)');
    expect(source).toContain('assertCsm037GpuPresentation(gpu, prefix)');
    expect(source).toContain('move/group/ungroup/unrecorded-move each publish WebGL2 draws');
    expect(source).toContain('publishes initial, animated, and replacement bar frames');
    expect(source).toContain('report load, replacement, and fit each publish WebGL2 draws');
    expect(source).toContain('function assertUpd007GpuPublication(gpu, prefix)');
    expect(source).toContain('function assertUpd008GpuPublication(gpu, prefix)');
    expect(source).toContain('publishedSequence !== undefined');
    expect(source).toContain('postBulkFrame?.draws.length > 0');
    expect(source).toContain('updateFrames.every((frame) => frame.draws.length > 0)');
    expect(source).toContain('initial and post-bulk publish both issue WebGL2 draws');
    expect(source).toContain('initial/reconcile/hide/show each issue WebGL2 draws');
    expect(source).toContain("context.actualContext === 'webgl2'");

    const probeSource = source.slice(
      source.indexOf('async function installWebGlCanvasProbe'),
      source.indexOf('async function executeCase'),
    );
    expect(probeSource).not.toMatch(/normalized|expectedCase|compareObservation|readFile/u);
  });

  it('drives REN-008 and REN-010 through actual controls and verifies every actual phase inspector', () => {
    expect(source).toContain(
      "const FOCUSED_UI_CASES = new Set(['REN-005', 'REN-006', 'REN-008', 'REN-010', 'REN-011']);",
    );
    expect(source).toContain('function collectFocusedUi(options)');
    expect(source).toContain('async function collectComponentAssetFocusedUi');
    expect(source).toContain("inspectorTestId: 'ren-008-background-inspector'");
    expect(source).toContain("inspectorTestId: 'ren-010-icon-inspector'");
    expect(source).toContain("phases: ['initial', 'image', 'hidden', 'shown']");
    expect(source).toContain("phases: ['initial', 'replacement', 'tint']");
    expect(source).toContain('Number(inspector.dataset.observedPhaseCount) === config.phases.length');
    expect(source).toContain('readComponentAssetFocusedUi(root, config, triggerTestId)');
    expect(source).toContain('${config.prefix}-resource-journal-row');
    expect(source).toContain('assertComponentAssetFocusedUi(caseSpec.id, run.ui, runLabel)');
    expect(source).toContain("facts['entity-id'] === 'item::background:bg'");
    expect(source).toContain("facts['authored-size'] === '{\"width\":20,\"height\":10}'");
    expect(source).toContain("ui.phases.hidden['render-object-count'] === '0'");
    expect(source).toContain("facts['entity-id'] === 'item-a::icon:icon'");
    expect(source).toContain("facts['icon-bounds'] === '[47,12,40,15]'");
    expect(source).toContain("ui.phases.tint['semantic-tint'] === '#00ff00ff'");
    expect(source).toContain(
      "ui.phases.tint['renderer-tint'] === '패킹 0x00ff00ff · RGB 0x00ff00 · 투명도 1.000'",
    );
    expect(source).toContain("ui.resourceJournal.events.includes('backend-texture-resolved')");
  });

  it('requires bounded transient canvases, repeat and fresh determinism, and zero browser errors', () => {
    expect(source).toContain('const expectedMaxCanvas = caseSpec.expectedMaxCanvas ?? 1;');
    expect(source).toContain('run.canvas.maximumDuringRun === expectedMaxCanvas');
    expect(source).toContain("id: 'PKG-003', expectedAssertions: 6, expectedMaxCanvas: 2");
    expect(source).toContain("id: 'SEC-003', expectedAssertions: 6, expectedMaxCanvas: 0");
    expect(source).toContain("id: 'SEC-004', expectedAssertions: 6, expectedMaxCanvas: 0");
    expect(source).toContain("run.canvas.afterCleanup === 0");
    expect(source).toContain("comparison.stableActualSha256 === repeatComparison.stableActualSha256");
    expect(source).toContain("comparison.stableActualSha256 === fresh.comparison.stableActualSha256");
    expect(source).toContain('async function executeFreshSession');
    expect(source).toContain("assertCaseRun(caseSpec, run, comparison, 'fresh')");
    expect(source).toContain('freshDestroy: cleanupStatus(fresh.destroyed.cleanup)');
    expect(source).toContain("errors.console.length === 0");
    expect(source).toContain("errors.page.length === 0");
    expect(source).toContain("errors.network.length === 0");
    expect(source).toContain("errors.externalFixture.length === 0");
    expect(source).toContain("page.on('console'");
    expect(source).toContain("page.on('pageerror'");
    expect(source).toContain("page.on('requestfailed'");
    expect(source).toContain("page.on('request'");
    expect(source).toContain("page.on('response'");
  });
});
