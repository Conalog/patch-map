import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const scriptUrl = new URL(
  '../../scripts/verification/core-v2-contract-assets-browser.mjs',
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);
let source = '';

beforeAll(async () => {
  source = await readFile(scriptPath, 'utf8');
});

describe('PatchMap AST-001 browser checkpoint script', () => {
  it('is valid Node syntax', () => {
    const checked = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    expect(checked.status).toBe(0);
    expect(checked.stderr).toBe('');
  });

  it('pins the canonical AST-001 route and its intentional contract conflict', () => {
    expect(source).toContain("const CASE_ID = 'AST-001';");
    expect(source).toContain("const DATASET_SIZE = '100';");
    expect(source).toContain('const SEED = 319;');
    expect(source).toContain(
      "const ROUTE = '/lab/core-v2?scenario=AST-001&size=100&seed=319';",
    );
    expect(source).toContain('const EXPECTED_ASSERTION_COUNT = 18;');
    expect(source).toContain('const EXPECTED_PASSED_COUNT = 17;');
    expect(source).toContain('const EXPECTED_FAILED_COUNT = 1;');
    expect(source).toContain("const EXPECTED_STATUS = 'observed-contract-conflict';");
    expect(source).toContain("path: '/outcome/aliasConflict/code'");
    expect(source).toContain("expected: 'ASSET_ALIAS_CONFLICT'");
    expect(source).toContain("actual: 'CONFLICT'");
    expect(source).toContain('failure?.index === EXPECTED_CONFLICT.index');
    expect(source).toContain('failure?.path === EXPECTED_CONFLICT.path');
    expect(source).toContain("failure?.failure?.code === 'VALUE_MISMATCH'");
    expect(source).not.toContain("report.status = 'pass'");
  });

  it('runs first, repeat, and a second fresh browser context through the public Lab bridge', () => {
    expect(source).toContain("operations: ['runCase', 'repeatCase']");
    expect(source).toContain("sessionLabel: 'fresh'");
    expect(source).toContain("operations: ['runCase']");
    expect(source).toContain('const context = await activeBrowser.newContext');
    expect(source).toContain('bridge[operationName]');
    expect(source).toContain('bridge.actualObservation()');
    expect(source).toContain('bridge.execution()');
    expect(source).toContain('await bridge.destroyCase()');
    expect(source).toContain("first?.operation === 'runCase'");
    expect(source).toContain("repeat?.operation === 'repeatCase'");
    expect(source).toContain("fresh?.operation === 'runCase'");
    expect(source).toContain("new Set(stableDigests).size === 1");
    expect(source).toContain('freshBrowserContext: true');
  });

  it('keeps canonical expected data outside the browser-side executor', () => {
    expect(source.match(/catalog-normalized-expected\.v1\.json/gu)).toHaveLength(1);
    expect(source).toContain("import { compareObservation } from './core-v2-contract/compare.mjs';");
    expect(source).toContain('actual: browserRun.actualObservation');
    expect(source).toContain('fixtures: browserRun.fixtures');
    expect(source).toContain('captures: browserRun.captures');

    const browserRunSource = source.slice(
      source.indexOf('async function executeBrowserRun'),
      source.indexOf('async function destroyBrowserCase'),
    );
    expect(browserRunSource).not.toMatch(/normalized|expectedCase|compareObservation|readFile/u);
    expect(browserRunSource).toContain('bridge[operationName]');
    expect(browserRunSource).toContain('bridge.actualObservation()');
  });

  it('requires eight completed actions and full cleanup around each transient canvas', () => {
    expect(source).toContain('const EXPECTED_ACTION_COUNT = 8;');
    expect(source).toContain('run.actionResults.length === EXPECTED_ACTION_COUNT');
    expect(source).toContain("result.status === 'completed'");
    expect(source).toContain("run.cleanupStatus === 'completed'");
    expect(source).toContain('run.canvas.initial === 0');
    expect(source).toContain('run.canvas.maximumDuringRun === 1');
    expect(source).toContain('run.canvas.afterCleanup === 0');
    expect(source).toContain("result.status === 'destroyed'");
    expect(source).toContain("cleanupStatus(result.cleanup) === 'completed'");
    expect(source).toContain('result.canvasCount === 0');
  });

  it('rejects browser errors and pre-fetch violations for both synthetic failure paths', () => {
    expect(source).toContain("'fixture://required-init-failure.png'");
    expect(source).toContain("'https://assets.example.test/other.png'");
    expect(source).toContain("page.on('console'");
    expect(source).toContain("page.on('pageerror'");
    expect(source).toContain("page.on('request'");
    expect(source).toContain("page.on('requestfailed'");
    expect(source).toContain("page.on('response'");
    expect(source).toContain('errors.console.length === 0');
    expect(source).toContain('errors.page.length === 0');
    expect(source).toContain('errors.network.length === 0');
    expect(source).toContain('errors.prohibitedAssetRequests.length === 0');
  });

  it('is headless by default, emits stdout JSON only, and writes no evidence', () => {
    expect(source).toContain('process.argv.slice(2)');
    expect(source).toContain("const allowed = new Set(['--headed']);");
    expect(source).toContain('chromium.launch({ headless: !headed })');
    expect(source).toContain("process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`)");
    expect(source).not.toMatch(
      /execute-worker|handlers\/|fold-[a-z]|src\/core-v2|performance\/core-v1|lab\/engine-comparison/u,
    );
    expect(source).not.toMatch(/writeFile|mkdir|results\//u);
  });
});
