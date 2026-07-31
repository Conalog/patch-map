import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { materializePatchMapExecutableCase } from '../../lab/patch-map/contract/executable-cases';
import { renderPatchMapContractLab } from '../../lab/patch-map/contract/main';
import { parsePatchMapContractRoute } from '../../lab/patch-map/contract/route';

const mainUrl = new URL('../../lab/patch-map/contract/main.ts', import.meta.url);
const runObserverUrl = new URL(
  '../../lab/patch-map/contract/run-observer.ts',
  import.meta.url,
);
const browserScriptUrl = new URL(
  '../../scripts/verification/core-v2-contract-render-browser.mjs',
  import.meta.url,
);

describe('PatchMap REN-006 / REN-011 focused text Lab UI', () => {
  it('keeps terminal traces bounded and hidden unless the actual execution failed', async () => {
    const source = await readFile(mainUrl, 'utf8');

    expect(source).toContain("trace.hidden = state.status !== 'failed'");
    expect(source).toContain('JSON.stringify(compactContractTrace(');
    expect(source).toContain('function compactContractTrace(');
    expect(source).toContain('actions: Object.freeze(actionResults.map(');
    expect(source).not.toContain(
      'JSON.stringify({ state, execution, actualObservation: observation, cleanup }, null, 2)',
    );
  });

  it('renders six seeded REN-006 actual phases without changing its six canonical actions', () => {
    const route = parsePatchMapContractRoute(
      '/lab/core-v2?scenario=REN-006&size=100&seed=319',
    );
    const plan = materializePatchMapExecutableCase('REN-006', '100', 319);
    const markup = renderPatchMapContractLab(route);

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
    expect(markup).toContain('data-testid="ren-006-observed-choice-count">0 / 6개 관찰');
    expect(markup).toContain('data-testid="ren-006-run-observation"');
    expect(markup).toContain('data-testid="ren-006-performance-journal"');
    expect(markup).toContain('표시 전용 탐색입니다.');
    expect(markup).toContain('완료된 실제 관찰 결과만 읽으며');
    expect(markup).toContain('기준 작업 순서');
    expect(markup).not.toContain('data-testid="ren-011-text-inspector"');
  });

  it('renders the exact seven REN-011 matrix choices without changing its four canonical actions', () => {
    const route = parsePatchMapContractRoute(
      '/lab/core-v2?scenario=REN-011&size=100&seed=319',
    );
    const plan = materializePatchMapExecutableCase('REN-011', '100', 319);
    const markup = renderPatchMapContractLab(route);

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
    expect(markup).toContain('data-testid="ren-011-observed-choice-count">0 / 7개 관찰');
    expect(markup).toContain('data-testid="ren-011-source" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-placement" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-margin" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-paint-tint" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-screen-angle" data-text-observation-field');
    expect(markup).toContain('data-testid="ren-011-run-observation"');
    expect(markup).not.toContain('data-testid="ren-006-text-inspector"');
  });

  it('uses the route seed only for deterministic display selection and omits text inspectors elsewhere', () => {
    const ren006SeedZero = renderPatchMapContractLab(parsePatchMapContractRoute(
      '/lab/core-v2?scenario=REN-006&size=100&seed=0',
    ));
    const ren011SeedZero = renderPatchMapContractLab(parsePatchMapContractRoute(
      '/lab/core-v2?scenario=REN-011&size=100&seed=0',
    ));
    const nearby = renderPatchMapContractLab(parsePatchMapContractRoute(
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
    const [source, runObserverSource] = await Promise.all([
      readFile(mainUrl, 'utf8'),
      readFile(runObserverUrl, 'utf8'),
    ]);
    const inspectorSource = [
      source.slice(
        source.indexOf('function renderTextInspectorOptions'),
        source.indexOf('export function renderPatchMapContractLab'),
      ),
      source.slice(
        source.indexOf('function refreshTextInspector'),
        source.indexOf('function terminalRen005Product'),
      ),
    ].join('\n');
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
    expect(runObserverSource).toContain("if (scenario === 'REN-006') return 'ren-006';");
    expect(runObserverSource).toContain("if (scenario === 'REN-011') return 'ren-011';");
  });

  it('keeps both text cases in the shared browser checkpoint with their focused inspectors', async () => {
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

    expect(records.filter(({ id }) => id === 'REN-006' || id === 'REN-011')).toEqual([
      { id: 'REN-006', expectedAssertions: 30 },
      { id: 'REN-011', expectedAssertions: 20 },
    ]);
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
    expect(source).toContain("choices.upright['screen-angle'] === '37'");
    expect(source).toContain("facts['all-rows-exact'] === 'false'");
  });
});

function optionValues(markup: string, selectTestId: string): string[] {
  const select = markup.match(
    new RegExp(`data-testid="${selectTestId}"[^>]*>(?<body>[\\s\\S]*?)</select>`, 'u'),
  )?.groups?.body ?? '';
  return [...select.matchAll(/<option value="(?<value>[^"]+)"/gu)]
    .map((match) => match.groups?.value ?? '');
}
