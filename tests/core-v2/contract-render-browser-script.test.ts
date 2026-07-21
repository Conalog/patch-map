import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const scriptUrl = new URL(
  '../../scripts/verification/core-v2-contract-render-browser.mjs',
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);
let source = '';

beforeAll(async () => {
  source = await readFile(scriptPath, 'utf8');
});

describe('Core v2 render browser checkpoint script', () => {
  it('is valid Node syntax', () => {
    const checked = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    expect(checked.status).toBe(0);
    expect(checked.stderr).toBe('');
  });

  it('pins exactly the thirteen selected render routes and their 199 canonical assertions', () => {
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
      { id: 'REN-010', expectedAssertions: 11 },
      { id: 'REN-011', expectedAssertions: 20 },
    ]);
    expect(records.reduce((total, record) => total + record.expectedAssertions, 0)).toBe(199);
    expect(source).toContain('const EXPECTED_ASSERTION_TOTAL = 199;');
    expect(source).toContain('const EXPECTED_ASSERTION_PASS_TOTAL = 196;');
    expect(source).toContain('const EXPECTED_ASSERTION_FAILURE_TOTAL = 3;');
    expect(source).toContain(
      "'canonical comparison must be exactly 196 pass and 3 immutable conflicts'",
    );
    expect(source).toContain(
      "'repeat comparison must be exactly 196 pass and 3 immutable conflicts'",
    );
    expect(source).toContain(
      "'fresh comparison must be exactly 196 pass and 3 immutable conflicts'",
    );
    expect(source).toContain("const DATASET_SIZE = '100';");
    expect(source).toContain('const SEED = 319;');
    expect(source).toContain('/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}');
    expect(source).toContain("new URL(page.url()).pathname + new URL(page.url()).search === route");
  });

  it('allows only the three immutable REN-005 overlapping parent conflicts', () => {
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
    expect(source).toContain('comparison.passed === caseSpec.expectedAssertions - expectedFailures.length');
    expect(source).toContain('comparison.failed === expectedFailures.length');
    expect(source).toContain('sameJson(comparisonFailures(comparison), expectedFailures)');
    expect(source).toContain("'render checkpoint immutable conflict inventory must remain 3'");
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
    expect(source).toContain("const BRIDGE_NAME = '__PATCH_MAP_CORE_V2_CONTRACT_LAB__';");
    expect(source).toContain("await executeBrowserRun(page, 'runCase')");
    expect(source).toContain("await executeBrowserRun(page, 'repeatCase')");
    expect(source).toContain('await bridge.destroyCase()');
    expect(source).toContain("process.argv.slice(2)");
    expect(source).toContain("const allowed = new Set(['--headed']);");
    expect(source).toContain('chromium.launch({ headless: !headed })');
    expect(source).toContain("process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`)");
    expect(source).not.toMatch(
      /execute-worker|handlers\/|fold-[a-z]|src\/core-v2|performance\/core-v1|lab\/engine-comparison/u,
    );
    expect(source).not.toMatch(/writeFile|mkdir|results\//u);
  });

  it('drives REN-005 through the real Run and Repeat controls and returns focused DOM evidence', () => {
    expect(source).toContain("await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')");
    expect(source).toContain("await executeBrowserUiRun(page, caseSpec.id, 'repeatCase', 'repeat-action')");
    expect(source).toContain('button.click()');
    expect(source).toContain('waitForUiRunCompletion(bridge.state().rootTestId, operationName)');
    expect(source).toContain("root.addEventListener('core-v2-contract-run-complete', onComplete)");
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
    expect(source).toContain('focusedUi: FOCUSED_UI_CASES.has(caseSpec.id)');
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
    expect(source).toContain("ui.phases.tint['renderer-tint'] === 'packed 0x00ff00ff · rgb 0x00ff00 · alpha 1.000'");
    expect(source).toContain("ui.resourceJournal.events.includes('backend-texture-resolved')");
  });

  it('requires one transient canvas, repeat and fresh determinism, and zero browser errors', () => {
    expect(source).toContain("run.canvas.maximumDuringRun === 1");
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
