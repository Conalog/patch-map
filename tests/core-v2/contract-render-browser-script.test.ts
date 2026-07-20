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

describe('Core v2 render foundation browser checkpoint script', () => {
  it('is valid Node syntax', () => {
    const checked = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    expect(checked.status).toBe(0);
    expect(checked.stderr).toBe('');
  });

  it('pins exactly the five render foundation routes and their 49 canonical assertions', () => {
    const caseBlock = source.match(
      /const RENDER_CASES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body;
    expect(caseBlock).toBeDefined();
    const records = [...(caseBlock ?? '').matchAll(
      /id: '(?<id>[A-Z]{3}-\d{3})', expectedAssertions: (?<count>\d+)/gu,
    )].map((match) => ({
      id: match.groups?.id,
      expectedAssertions: Number(match.groups?.count),
    }));

    expect(records).toEqual([
      { id: 'LAY-001', expectedAssertions: 9 },
      { id: 'REN-001', expectedAssertions: 9 },
      { id: 'REN-004', expectedAssertions: 10 },
      { id: 'REN-003', expectedAssertions: 12 },
      { id: 'REN-002', expectedAssertions: 9 },
    ]);
    expect(records.reduce((total, record) => total + record.expectedAssertions, 0)).toBe(49);
    expect(source).toContain("const DATASET_SIZE = '100';");
    expect(source).toContain('const SEED = 319;');
    expect(source).toContain('/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}');
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

  it('requires one transient canvas, deterministic repeats, and zero browser errors', () => {
    expect(source).toContain("run.canvas.maximumDuringRun === 1");
    expect(source).toContain("run.canvas.afterCleanup === 0");
    expect(source).toContain("comparison.stableActualSha256 === repeatComparison.stableActualSha256");
    expect(source).toContain("errors.console.length === 0");
    expect(source).toContain("errors.page.length === 0");
    expect(source).toContain("errors.network.length === 0");
    expect(source).toContain("page.on('console'");
    expect(source).toContain("page.on('pageerror'");
    expect(source).toContain("page.on('requestfailed'");
    expect(source).toContain("page.on('response'");
  });
});
