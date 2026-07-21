import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { materializeCoreV2ExecutableCase } from '../../lab/performance-v2/contract/executable-cases';
import { renderCoreV2ContractLab } from '../../lab/performance-v2/contract/main';
import { parseCoreV2ContractRoute } from '../../lab/performance-v2/contract/route';

const mainUrl = new URL('../../lab/performance-v2/contract/main.ts', import.meta.url);
const browserScriptUrl = new URL(
  '../../scripts/verification/core-v2-contract-render-browser.mjs',
  import.meta.url,
);

describe('Core v2 REN-006 / REN-011 focused text Lab UI', () => {
  it('renders six seeded REN-006 actual phases without changing its six canonical actions', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-006&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-006', '100', 319);
    const markup = renderCoreV2ContractLab(route);

    expect(plan.actionTrace).toEqual([
      { index: 0, type: 'loadDataset', operands: { datasetId: 'standalone-text' } },
      { index: 1, type: 'snapshot-observation', operands: { label: 'initial-text' } },
      {
        index: 2,
        type: 'patch',
        operands: { targetId: 'text', changes: { text: 'مرحبا world' } },
      },
      {
        index: 3,
        type: 'patch',
        operands: { targetId: 'rapid-text', changes: { text: 'intermediate' } },
      },
      {
        index: 4,
        type: 'patch',
        operands: { targetId: 'rapid-text', changes: { text: 'final中' } },
      },
      { index: 5, type: 'publishFrame', operands: { timeMs: 16.666667 } },
    ]);
    expect(plan).not.toHaveProperty('expected');
    expect(markup.match(/data-action-status="queued"/gu)).toHaveLength(6);
    expect(markup).toContain('data-testid="ren-006-text-inspector"');
    expect(markup).toContain('data-observed-choice-count="0"');
    expect(markup).toContain('data-seeded-choice="empty"');
    expect(markup).toContain('data-testid="ren-006-text-choice-select" disabled');
    expect(optionValues(markup, 'ren-006-text-choice-select')).toEqual([
      'initial',
      'empty',
      'long',
      'missing-font',
      'rapid',
      'terminal',
    ]);
    expect(markup).toContain('<option value="empty" data-observation-status="queued" selected disabled>');
    expect(markup).toContain('data-testid="ren-006-observed-choice-count">0 / 6 observed');
    expect(markup).toContain('data-testid="ren-006-run-observation"');
    expect(markup).toContain('data-testid="ren-006-performance-journal"');
    expect(markup).toContain('Display-only exploration.');
    expect(markup).toContain('completed folded actualObservation only');
    expect(markup).toContain('canonical action trace');
    expect(markup).not.toContain('data-testid="ren-011-text-inspector"');
  });

  it('renders the exact seven REN-011 matrix choices without changing its four canonical actions', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-011&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-011', '100', 319);
    const markup = renderCoreV2ContractLab(route);

    expect(plan.actionTrace).toEqual([
      { index: 0, type: 'loadDataset', operands: { datasetRef: 'item-text-corpus' } },
      {
        index: 1,
        type: 'observeItemTextMatrix',
        operands: { valueRef: 'itemTextContractMatrix' },
      },
      {
        index: 2,
        type: 'patch',
        operands: {
          target: { ownerId: 'item-a', id: 'bidi' },
          changes: { text: '中😀é\nمرحبا' },
        },
      },
      { index: 3, type: 'publishFrame', operands: { timeMs: 16.666667 } },
    ]);
    expect(plan).not.toHaveProperty('expected');
    expect(markup.match(/data-action-status="queued"/gu)).toHaveLength(4);
    expect(markup).toContain('data-testid="ren-011-text-inspector"');
    expect(markup).toContain('data-seeded-choice="overflow-hidden"');
    expect(optionValues(markup, 'ren-011-text-choice-select')).toEqual([
      'placed',
      'auto',
      'wrap',
      'overflow-visible',
      'overflow-hidden',
      'overflow-ellipsis',
      'upright',
    ]);
    expect(markup).toContain('<option value="overflow-hidden" data-observation-status="queued" selected disabled>');
    expect(markup).toContain('data-testid="ren-011-observed-choice-count">0 / 7 observed');
    expect(markup).toContain('data-testid="ren-011-source" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-placement" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-margin" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-paint-tint" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-screen-angle" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-run-observation"');
    expect(markup).not.toContain('data-testid="ren-006-text-inspector"');
  });

  it('uses the route seed only for deterministic display selection and omits text inspectors elsewhere', () => {
    const ren006SeedZero = renderCoreV2ContractLab(parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-006&size=100&seed=0',
    ));
    const ren011SeedZero = renderCoreV2ContractLab(parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-011&size=100&seed=0',
    ));
    const nearby = renderCoreV2ContractLab(parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-010&size=100&seed=319',
    ));

    expect(ren006SeedZero).toContain('data-seeded-choice="initial"');
    expect(ren006SeedZero).toContain('<option value="initial" data-observation-status="queued" selected disabled>');
    expect(ren011SeedZero).toContain('data-seeded-choice="placed"');
    expect(ren011SeedZero).toContain('<option value="placed" data-observation-status="queued" selected disabled>');
    expect(nearby).not.toContain('contract-text-inspector');
    expect(nearby).not.toContain('data-text-observation-field');
  });

  it('keeps the Lab inspector expected-blind and refreshes it only from folded actualObservation', async () => {
    const source = await readFile(mainUrl, 'utf8');
    const inspectorSource = source.slice(
      source.indexOf('function renderTextInspectorOptions'),
      source.indexOf('function refreshComponentAssetInspector'),
    );
    const chooserListener = source.slice(
      source.indexOf("const textChooser = target.querySelector<HTMLSelectElement>"),
      source.indexOf("const componentAssetChooser = target.querySelector<HTMLSelectElement>"),
    );

    expect(inspectorSource).toContain('function refreshTextInspector(');
    expect(inspectorSource).toContain("recordAt(observation, 'text')");
    expect(inspectorSource).toContain("recordAt(observation, 'scene')");
    expect(inspectorSource).toContain("recordAt(observation, 'geometry')");
    expect(inspectorSource).toContain("recordAt(observation, 'paint')");
    expect(inspectorSource).toContain('resetSelection: boolean');
    expect(inspectorSource).not.toMatch(/catalog-normalized-expected|compareObservation|expectedCase/u);
    expect(chooserListener).toContain('bridge.actualObservation().then((observation) =>');
    expect(chooserListener).toContain(
      'refreshTextInspector(target, route.scenario, observation, route.seed, false)',
    );
    expect(chooserListener).not.toMatch(/runCase|repeatCase|execution\(\)|actionResults/u);
    expect(source).toContain(
      'refreshTextInspector(root, route.scenario, observation, route.seed, runObservation !== null)',
    );
    expect(source).toContain("if (scenario === 'REN-006') return 'ren-006';");
    expect(source).toContain("if (scenario === 'REN-011') return 'ren-011';");
  });

  it('extends the browser checkpoint to 13 routes and exact 196/199 results', async () => {
    const source = await readFile(browserScriptUrl, 'utf8');
    const caseBlock = source.match(
      /const RENDER_CASES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/u,
    )?.groups?.body ?? '';
    const records = [...caseBlock.matchAll(
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
    expect(records).toHaveLength(13);
    expect(records.reduce((total, record) => total + record.expectedAssertions, 0)).toBe(199);
    expect(source).toContain('const EXPECTED_ASSERTION_TOTAL = 199;');
    expect(source).toContain('const EXPECTED_ASSERTION_PASS_TOTAL = 196;');
    expect(source).toContain('const EXPECTED_ASSERTION_FAILURE_TOTAL = 3;');
    expect(source).toContain('all thirteen render routes completed');
    expect(source).toContain('exactly 196 pass and 3 immutable conflicts');
    expect(source).toContain(
      "const FOCUSED_UI_CASES = new Set(['REN-005', 'REN-006', 'REN-008', 'REN-010', 'REN-011']);",
    );
    expect(source).toContain('async function collectTextFocusedUi');
    expect(source).toContain("inspectorTestId: 'ren-006-text-inspector'");
    expect(source).toContain("inspectorTestId: 'ren-011-text-inspector'");
    expect(source).toContain('Number(inspector.dataset.observedChoiceCount) === config.choices.length');
    expect(source).toContain('async function readTextFocusedUi');
    expect(source).toContain('assertTextFocusedUi(caseSpec.id, run.ui, runLabel)');
    expect(source).toContain("choices.rapid['intermediate-publication-count'] === '0'");
    expect(source).toContain("choices.placed['local-bounds'] === '[219,135,16,20]'");
    expect(source).toContain("choices.upright['screen-angle'] === '0'");
  });
});

function optionValues(markup: string, selectTestId: string): string[] {
  const select = markup.match(
    new RegExp(`data-testid="${selectTestId}"[^>]*>(?<body>[\\s\\S]*?)</select>`, 'u'),
  )?.groups?.body ?? '';
  return [...select.matchAll(/<option value="(?<value>[^"]+)"/gu)]
    .map((match) => match.groups?.value ?? '');
}
