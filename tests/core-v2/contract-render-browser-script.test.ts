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

  it('pins exactly the nineteen selected render routes and their 284 canonical assertions', () => {
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
      { id: 'UPD-005', expectedAssertions: 10 },
      { id: 'ANI-001', expectedAssertions: 14 },
      { id: 'ANI-002', expectedAssertions: 11 },
    ]);
    expect(records.reduce((total, record) => total + record.expectedAssertions, 0)).toBe(284);
    expect(source).toContain('const EXPECTED_ASSERTION_TOTAL = 284;');
    expect(source).toContain('const EXPECTED_ASSERTION_PASS_TOTAL = 280;');
    expect(source).toContain('const EXPECTED_ASSERTION_FAILURE_TOTAL = 4;');
    expect(source).toContain(
      "'canonical comparison must be exactly 280 pass and 4 immutable conflicts'",
    );
    expect(source).toContain(
      "'repeat comparison must be exactly 280 pass and 4 immutable conflicts'",
    );
    expect(source).toContain(
      "'fresh comparison must be exactly 280 pass and 4 immutable conflicts'",
    );
    expect(source).toContain("const DATASET_SIZE = '100';");
    expect(source).toContain('const SEED = 319;');
    expect(source).toContain('/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}');
    expect(source).toContain("new URL(page.url()).pathname + new URL(page.url()).search === route");
  });

  it('allows only the three REN-005 conflicts and the one ANI-002 clock-code conflict', () => {
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
    expect(source).toContain('comparison.passed === caseSpec.expectedAssertions - expectedFailures.length');
    expect(source).toContain('comparison.failed === expectedFailures.length');
    expect(source).toContain('sameJson(comparisonFailures(comparison), expectedFailures)');
    expect(source).toContain("'render checkpoint immutable conflict inventory must remain 4'");
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
    expect(source).toContain('focusedUi: DOM_CONTROL_CASES.has(caseSpec.id)');
  });

  it('drives all six presentation-tranche routes through actual Run, Repeat, and Destroy controls', () => {
    expect(source).toContain("const PRESENTATION_TRANCHE_CASES = new Set([");
    for (const caseId of ['LAY-002', 'LAY-003', 'UPD-005', 'REN-009', 'ANI-001', 'ANI-002']) {
      expect(source).toContain(`'${caseId}',`);
    }
    expect(source).toContain(
      'const DOM_CONTROL_CASES = new Set([...FOCUSED_UI_CASES, ...PRESENTATION_TRANCHE_CASES]);',
    );
    expect(source).toContain('const first = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('const repeat = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('const run = DOM_CONTROL_CASES.has(caseSpec.id)');
    expect(source).toContain('if (options.generic) return collectGenericFocusedUi(options);');
    expect(source).toContain('async function collectGenericFocusedUi');
    expect(source).toContain("root.addEventListener('core-v2-contract-run-complete', onComplete)");
    expect(source).toContain("const button = document.querySelector('[data-testid=\"destroy-case\"]')");
    expect(source).toContain("root.addEventListener('core-v2-contract-destroy-complete', onComplete)");
    expect(source).toContain("trigger = 'click:destroy-case'");
    expect(source).toContain("destroyed.trigger === 'click:destroy-case'");
    expect(source).toContain("ui.trigger === expectedTrigger");
    expect(source).toContain("ui.controls?.repeatDisabled === false");
    expect(source).toContain("ui.controls?.destroyDisabled === false");
  });

  it('captures WebGL2 draw and readPixels facts for paint order and visible bar projection', () => {
    expect(source).toContain(
      "const GPU_EVIDENCE_CASES = new Set(['LAY-003', 'REN-009', 'ANI-001', 'ANI-002']);",
    );
    expect(source).toContain('await installWebGlCanvasProbe(page, caseSpec.id)');
    expect(source).toContain('await page.addInitScript(({ probeName, caseIdentity }) => {');
    expect(source).toContain('const originalGetContext = HTMLCanvasElement.prototype.getContext;');
    expect(source).toContain("actualContext: typeof WebGL2RenderingContext !== 'undefined'");
    expect(source).toContain("'drawElementsInstanced'");
    expect(source).toContain('context.readPixels(x, y, 1, 1');
    expect(source).toContain('context.readPixels(x, 0, 1, canvas.height');
    expect(source).toContain('assertLay003GpuPaintOrder(gpu, prefix)');
    expect(source).toContain('initial/patch/undo/redo GPU draw order');
    expect(source).toContain('visible 10 -> 36.25 -> 40 bar projection');
    expect(source).toContain('visible retargeted 10 -> 36.25 -> 22.03125 -> 20 projection');
    expect(source).toContain('both frame-cadence schedules reach the same visible projection');

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
