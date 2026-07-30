import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface MainParityScenariosRuntime {
  readonly FIRST_PARITY_TRANCHE: readonly Readonly<{ readonly id: string }>[];
  firstParityTrancheIds(): readonly string[];
}

interface MainParityContractMapRuntime {
  buildPatchMapMainParityContractMap(input: Readonly<{
    manifestPath: string;
    typedCasesPath: string;
    availableScenarioIds: readonly string[];
  }>): Promise<Readonly<{
    caseCount: number;
    mappedCaseCount: number;
    modeCounts: Readonly<Record<string, number>>;
    cases: readonly Readonly<{
      id: string;
      comparisonMode: string;
      sharedParityProbeIds: readonly string[];
    }>[];
  }>>;
}

const scenariosRuntime: MainParityScenariosRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../scripts/verification/patch-map-main-parity/scenarios.mjs',
    import.meta.url,
  ).href
) as MainParityScenariosRuntime;
const { FIRST_PARITY_TRANCHE, firstParityTrancheIds } = scenariosRuntime;
const contractMapRuntime: MainParityContractMapRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../scripts/verification/patch-map-main-parity/contract-map.mjs',
    import.meta.url,
  ).href
) as MainParityContractMapRuntime;

const scriptPath = fileURLToPath(new URL(
  '../../scripts/verification/patch-map-main-parity.mjs',
  import.meta.url,
));
const mainOraclePath = fileURLToPath(new URL(
  '../../lab/main-parity/main-oracle.js',
  import.meta.url,
));

describe('PatchMap main black-box parity harness', () => {
  it('pins the first lifecycle/data/render/layout tranche without approved expected input', () => {
    expect(firstParityTrancheIds()).toEqual([
      'LIF-001',
      'LIF-002',
      'LIF-003',
      'DAT-002',
      'DAT-003',
      'DAT-004',
      'REN-003',
      'REN-008',
      'REN-009',
      'LAY-004',
      'LAY-005',
      'REN-011',
      'PAR-001',
      'PAR-002',
      'PAR-003',
      'PAR-004',
      'PAR-005',
      'PAR-006',
      'PAR-007',
      'PAR-008',
      'PAR-009',
      'PAR-010',
      'PAR-011',
      'PAR-012',
      'PAR-013',
      'PAR-014',
      'PAR-015',
      'PAR-016',
    ]);
    expect(FIRST_PARITY_TRANCHE).toHaveLength(28);
  });

  it('keeps the two products isolated and records independent observations before comparison', async () => {
    const source = await readFile(scriptPath, 'utf8');
    expect(source).toContain("lab/main-parity/main.html");
    expect(source).toContain("lab/main-parity/patch-map.html");
    expect(source).toContain('await invokeBoth(mainPage, patchMapPage');
    expect(source.indexOf('const loaded = await invokeBoth')).toBeLessThan(
      source.indexOf('captureCheckpoint'),
    );
    expect(source).not.toContain('catalog-normalized-expected');
    expect(source).not.toContain('catalog-review-registry');
  });

  it('loads main only through the isolated public package URL and never imports PatchMap into that realm', async () => {
    const [oracleSource, runnerSource] = await Promise.all([
      readFile(mainOraclePath, 'utf8'),
      readFile(scriptPath, 'utf8'),
    ]);
    expect(oracleSource).toContain("startsWith('/@fs/')");
    expect(oracleSource).toContain('import(/* @vite-ignore */ mainModuleUrl)');
    expect(runnerSource).toContain("mainUrl.searchParams.set('mainModule', `/@fs${MAIN_ESM}`)");
    expect(oracleSource).not.toContain('src/patch-map');
    expect(oracleSource).not.toContain('catalog-normalized-expected');
  });

  it('has valid Node syntax', () => {
    for (const path of [
      scriptPath,
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-main-parity/compare.mjs',
        import.meta.url,
      )),
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-main-parity/image-metrics.mjs',
        import.meta.url,
      )),
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-main-parity/contract-map.mjs',
        import.meta.url,
      )),
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-main-parity/scenarios.mjs',
        import.meta.url,
      )),
    ]) {
      const checked = spawnSync(process.execPath, ['--check', path], {
        encoding: 'utf8',
      });
      expect(checked.status, checked.stderr).toBe(0);
      expect(checked.stderr).toBe('');
    }
  });

  it('maps all 173 approved cases without loading normalized expected evidence', async () => {
    const map = await contractMapRuntime.buildPatchMapMainParityContractMap({
      manifestPath: fileURLToPath(new URL(
        '../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json',
        import.meta.url,
      )),
      typedCasesPath: fileURLToPath(new URL(
        '../../docs/reference/core-v2-functional-contract/evidence/catalog-typed-cases.v1.json',
        import.meta.url,
      )),
      availableScenarioIds: firstParityTrancheIds(),
    });
    expect(map.caseCount).toBe(173);
    expect(map.mappedCaseCount).toBe(173);
    expect(map.cases.map(({ id }) => id)).toHaveLength(new Set(
      map.cases.map(({ id }) => id),
    ).size);
    expect(map.modeCounts['direct-main-overlap']).toBeGreaterThan(0);
    expect(map.modeCounts['external-evidence']).toBeGreaterThan(0);
    const source = await readFile(fileURLToPath(new URL(
      '../../scripts/verification/patch-map-main-parity/contract-map.mjs',
      import.meta.url,
    )), 'utf8');
    expect(source).not.toContain('catalog-normalized-expected');
  });
});
