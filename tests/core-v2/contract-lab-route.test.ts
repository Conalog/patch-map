import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  CORE_V2_CONTRACT_LAB_BRIDGE_REVISION,
  CoreV2ContractExecutionNotImplementedError,
  createNotImplementedCoreV2ContractLabBridge,
} from '../../lab/performance-v2/contract/bridge';
import {
  CORE_V2_CONTRACT_PRESENTERS,
  selectCoreV2ContractPresenter,
} from '../../lab/performance-v2/contract/presenters';
import {
  CORE_V2_CONTRACT_STUB_COUNT,
  CORE_V2_EXECUTABLE_ACTION_DEFINITIONS,
  CORE_V2_EXECUTABLE_CASE_IDS,
  CORE_V2_EXECUTABLE_COUNT,
  materializeCoreV2ExecutableCase,
} from '../../lab/performance-v2/contract/executable-cases';
import { resolveCoreV2ExecutableRuntime } from '../../lab/performance-v2/contract/executable-runtime';
import {
  buildCoreV2ContractRoute,
  CORE_V2_CONTRACT_DATASET_SIZES,
  CoreV2ContractRouteError,
  parseCoreV2ContractRoute,
} from '../../lab/performance-v2/contract/route';
import {
  renderCoreV2ContractLab,
  renderCoreV2ContractRouteError,
} from '../../lab/performance-v2/contract/main';

describe('Core v2 focused contract Lab presenters', () => {
  it('owns 173 exact, independent presenter and root identities', () => {
    expect(CORE_V2_CONTRACT_PRESENTERS).toHaveLength(173);
    expect(new Set(CORE_V2_CONTRACT_PRESENTERS.map((entry) => entry.caseId)).size).toBe(173);
    expect(new Set(CORE_V2_CONTRACT_PRESENTERS.map((entry) => entry.presenterKey)).size).toBe(173);
    expect(new Set(CORE_V2_CONTRACT_PRESENTERS.map((entry) => entry.rootTestId)).size).toBe(173);

    for (const presenter of CORE_V2_CONTRACT_PRESENTERS) {
      expect(presenter.rootTestId).toBe(`scenario-${presenter.caseId.toLowerCase()}`);
      expect(presenter.routeTemplate).toBe(
        `/lab/core-v2?scenario=${presenter.caseId}&size=<SIZE>&seed=<SEED>`,
      );
      expect(presenter.executionStatus).toBe(
        CORE_V2_EXECUTABLE_CASE_IDS.some((caseId) => caseId === presenter.caseId)
          ? 'actual-observable'
          : 'not-implemented',
      );
      expect(presenter.actions.length).toBeGreaterThan(0);
      expect(new Set(presenter.actions.map((action) => action.actionTestId)).size).toBe(
        presenter.actions.length,
      );
      presenter.actions.forEach((action, index) => {
        expect(action.index).toBe(index);
        expect(action.handlerId).toBe(`contract/${action.type}`);
        expect(action.actionTestId).toBe(
          `${presenter.rootTestId}-action-${String(index).padStart(2, '0')}`,
        );
      });
    }
    expect(CORE_V2_CONTRACT_PRESENTERS.filter(
      (presenter) => presenter.executionStatus === 'actual-observable',
    )).toHaveLength(CORE_V2_EXECUTABLE_COUNT);
    expect(CORE_V2_CONTRACT_PRESENTERS.filter(
      (presenter) => presenter.executionStatus === 'not-implemented',
    )).toHaveLength(CORE_V2_CONTRACT_STUB_COUNT);
    expect(CORE_V2_CONTRACT_PRESENTERS.filter(
      (presenter) => presenter.executionStatus === 'actual-observable',
    ).map((presenter) => presenter.caseId)).toEqual(CORE_V2_EXECUTABLE_CASE_IDS);
  });

  it('uses exact selection and never substitutes a nearby presenter', () => {
    expect(selectCoreV2ContractPresenter('LIF-001').caseId).toBe('LIF-001');
    expect(selectCoreV2ContractPresenter('LIF-002').caseId).toBe('LIF-002');
    expect(() => selectCoreV2ContractPresenter('LIF-000')).toThrow(/Unknown/);
    expect(() => selectCoreV2ContractPresenter('lif-001')).toThrow(/Unknown/);
  });

  it('materializes only exact selected fixtures, actions, size, and seed without expected evidence', () => {
    expect(CORE_V2_EXECUTABLE_ACTION_DEFINITIONS).toHaveLength(65);
    expect(CORE_V2_EXECUTABLE_CASE_IDS).toHaveLength(28);
    expect(CORE_V2_CONTRACT_STUB_COUNT).toBe(145);
    expect(CORE_V2_EXECUTABLE_CASE_IDS.reduce((count, caseId) => (
      count + materializeCoreV2ExecutableCase(caseId, '100', 319).actionTrace.length
    ), 0)).toBe(119);
    for (const caseId of CORE_V2_EXECUTABLE_CASE_IDS) {
      const first = materializeCoreV2ExecutableCase(caseId, 'production', 4_294_967_295);
      const second = materializeCoreV2ExecutableCase(caseId, 'production', 4_294_967_295);
      expect(first.id).toBe(caseId);
      expect(first.rootTestId).toBe(`scenario-${caseId.toLowerCase()}`);
      expect(first.route).toBe(
        `/lab/core-v2?scenario=${caseId}&size=production&seed=4294967295`,
      );
      expect(first.routeParams).toEqual({ size: 'production', seed: 4_294_967_295 });
      expect(first.actionTrace).toEqual(first.fixture.actionTrace);
      expect(first).not.toHaveProperty('expected');
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.fixture.actionTrace)).toBe(true);
      expect(first).not.toBe(second);
    }
  });
});

describe('Core v2 focused contract Lab routes', () => {
  it('parses every approved scenario and canonical size without normalization', () => {
    for (const presenter of CORE_V2_CONTRACT_PRESENTERS) {
      for (const size of CORE_V2_CONTRACT_DATASET_SIZES) {
        const raw = buildCoreV2ContractRoute(presenter.caseId, size, 4_294_967_295);
        const route = parseCoreV2ContractRoute(raw);
        expect(route.canonicalUrl).toBe(raw);
        expect(route.scenario).toBe(presenter.caseId);
        expect(route.presenter).toBe(presenter);
        expect(route.size).toBe(size);
        expect(route.seed).toBe(4_294_967_295);
      }
    }
    expect(parseCoreV2ContractRoute('/lab/core-v2?scenario=LIF-001&size=100&seed=0').seed).toBe(0);
  });

  it.each([
    ['/lab/core-v2', 'MISSING_PARAMETER'],
    ['/lab/core-v2?scenario=LIF-001&size=100', 'MISSING_PARAMETER'],
    ['/lab/core-v2?scenario=LIF-001&scenario=LIF-002&size=100&seed=1', 'DUPLICATE_PARAMETER'],
    ['/lab/core-v2?scenario=LIF-001&size=100&seed=1&extra=x', 'UNKNOWN_PARAMETER'],
    ['/lab/core-v2?scenario=lif-001&size=100&seed=1', 'INVALID_SCENARIO'],
    ['/lab/core-v2?scenario=LIF-000&size=100&seed=1', 'INVALID_SCENARIO'],
    ['/lab/core-v2?scenario=LIF-001&size=0100&seed=1', 'INVALID_SIZE'],
    ['/lab/core-v2?scenario=LIF-001&size=100&seed=01', 'INVALID_SEED'],
    ['/lab/core-v2?scenario=LIF-001&size=100&seed=+1', 'INVALID_QUERY'],
    ['/lab/core-v2?scenario=LIF-001&size=100&seed=4294967296', 'INVALID_SEED'],
    ['/lab/core-v2?scenario=%4cIF-001&size=100&seed=1', 'INVALID_QUERY'],
    ['/lab/core-v2/?scenario=LIF-001&size=100&seed=1', 'INVALID_PATH'],
    ['/lab/core-v2?scenario=LIF-001&size=100&seed=1#trace', 'INVALID_QUERY'],
  ])('rejects non-executable route %s', (raw, expectedCode) => {
    expect.assertions(2);
    try {
      parseCoreV2ContractRoute(raw);
    } catch (error) {
      expect(error).toBeInstanceOf(CoreV2ContractRouteError);
      expect((error as CoreV2ContractRouteError).code).toBe(expectedCode);
    }
  });
});

describe('Core v2 focused contract Lab shell', () => {
  it('renders an actual-only armed shell for a selected foundation case', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=LIF-001&size=500&seed=319',
    );
    const nearby = selectCoreV2ContractPresenter('LIF-002');
    const markup = renderCoreV2ContractLab(route);

    expect(markup).toContain(`data-testid="${route.presenter.rootTestId}"`);
    expect(markup).not.toContain(`data-testid="${nearby.rootTestId}"`);
    expect(markup).toContain(`data-testid="${route.presenter.actions[0]?.actionTestId}"`);
    expect(markup).toContain(`data-testid="${route.presenter.rootTestId}-primary"`);
    expect(markup).toContain(`data-testid="${route.presenter.resultTestId}"`);
    expect(markup).toContain('data-contract-status="armed"');
    expect(markup).toContain('Run exact case');
    expect(markup).toContain('Actual-only case execution is available');
    expect(markup).toContain('data-action-status="queued"');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders the exact REN-007 relation route as an actual-observable focused case', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-007&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-007', '100', 319);
    const markup = renderCoreV2ContractLab(route);

    expect(route.presenter.executionStatus).toBe('actual-observable');
    expect(route.presenter.rootTestId).toBe('scenario-ren-007');
    expect(plan.route).toBe('/lab/core-v2?scenario=REN-007&size=100&seed=319');
    expect(plan.actionTrace.map(({ type }) => type)).toEqual([
      'loadDataset',
      'observeRelationPath',
      'patch',
      'setVisibility',
      'setVisibility',
      'observeRelationContractMatrix',
    ]);
    expect(markup).toContain('data-testid="scenario-ren-007"');
    expect(markup).toContain('data-contract-status="armed"');
    expect(markup).toContain('Actual-only case execution is available');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders REN-005 in canonical order with its exact expected-blind image action trace', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-005&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-005', '100', 319);
    const markup = renderCoreV2ContractLab(route);
    const imageIndex = CORE_V2_EXECUTABLE_CASE_IDS.indexOf('REN-005');

    expect(CORE_V2_EXECUTABLE_CASE_IDS[imageIndex - 1]).toBe('REN-004');
    expect(CORE_V2_EXECUTABLE_CASE_IDS[imageIndex + 1]).toBe('REN-006');
    expect(resolveCoreV2ExecutableRuntime('REN-005').key).toBe('render-images');
    expect(route.presenter.executionStatus).toBe('actual-observable');
    expect(route.presenter.rootTestId).toBe('scenario-ren-005');
    expect(plan.route).toBe('/lab/core-v2?scenario=REN-005&size=100&seed=319');
    expect(plan.actionTrace).toEqual([
      {
        index: 0,
        type: 'loadDataset',
        operands: { datasetId: 'image-specimens' },
      },
      {
        index: 1,
        type: 'resolveAsset',
        operands: {
          targetId: 'descriptor',
          requestId: 'old',
          completeAtMs: 100,
        },
      },
      {
        index: 2,
        type: 'replaceSource',
        operands: {
          targetId: 'descriptor',
          source: 'fixture-image',
          timeMs: 20,
        },
      },
      {
        index: 3,
        type: 'completeAsset',
        operands: { requestId: 'old', timeMs: 100 },
      },
    ]);
    expect(plan).not.toHaveProperty('expected');
    expect(JSON.stringify(plan)).not.toContain('catalog-normalized-expected');
    expect(markup).toContain('data-testid="scenario-ren-005"');
    expect(markup).toContain('data-contract-status="armed"');
    expect(markup).toContain('Actual-only case execution is available');
    expect(markup.match(/data-action-status="queued"/gu)).toHaveLength(4);
    expect(markup).toContain('data-testid="ren-005-image-inspector"');
    expect(markup).toContain('data-testid="ren-005-specimen-select"');
    expect(markup).toContain('<option value="alias">Alias</option>');
    expect(markup).toContain('<option value="url">Direct URL</option>');
    expect(markup).toContain('<option value="descriptor" selected>Descriptor replacement</option>');
    expect(markup).toContain('<option value="data-uri">Data URI</option>');
    expect(markup).toContain('<option value="transformed">Transformed shared source</option>');
    expect(markup).toContain('<option value="hidden-image">Hidden image</option>');
    expect(markup).toContain('<option value="failed-image">Failed placeholder</option>');
    expect(markup).toContain('data-testid="ren-005-selected-source"');
    expect(markup).toContain('data-testid="ren-005-selected-state"');
    expect(markup).toContain('data-testid="ren-005-selected-role"');
    expect(markup).toContain('data-testid="ren-005-selected-bounds"');
    expect(markup).toContain('data-testid="ren-005-selected-stale-completion"');
    expect(markup).toContain('data-testid="ren-005-request-count"');
    expect(markup).toContain('data-testid="ren-005-backend-counts"');
    expect(markup).toContain('data-testid="ren-005-resource-count"');
    expect(markup).toContain('data-testid="ren-005-lease-count"');
    expect(markup).toContain('data-testid="ren-005-stale-count"');
    expect(markup).toContain('data-testid="ren-005-request-journal"');
    expect(markup).toContain('data-testid="ren-005-run-fps"');
    expect(markup).toContain('data-testid="ren-005-run-long-task-count"');
    expect(markup).toContain('data-testid="ren-005-run-max-frame-gap"');
    expect(markup).toContain('This chooser changes only the displayed actual facts');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders REN-008 with four actual background phases and one immutable capture row', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-008&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-008', '100', 319);
    const markup = renderCoreV2ContractLab(route);
    const backgroundIndex = CORE_V2_EXECUTABLE_CASE_IDS.indexOf('REN-008');

    expect(CORE_V2_EXECUTABLE_CASE_IDS[backgroundIndex - 1]).toBe('REN-007');
    expect(CORE_V2_EXECUTABLE_CASE_IDS[backgroundIndex + 1]).toBe('REN-010');
    expect(resolveCoreV2ExecutableRuntime('REN-008').key).toBe('render-component-assets');
    expect(route.presenter.executionStatus).toBe('actual-observable');
    expect(route.presenter.rootTestId).toBe('scenario-ren-008');
    expect(plan.route).toBe('/lab/core-v2?scenario=REN-008&size=100&seed=319');
    expect(plan.actionTrace).toEqual([
      {
        index: 0,
        type: 'loadDataset',
        operands: { datasetId: 'background' },
      },
      {
        index: 1,
        type: 'replaceComponentSource',
        operands: {
          ownerId: 'item',
          componentId: 'bg',
          source: 'fixture-image',
          timeMs: 20,
        },
      },
      {
        index: 2,
        type: 'setComponentVisibility',
        operands: { ownerId: 'item', componentId: 'bg', show: false },
      },
      {
        index: 3,
        type: 'setComponentVisibility',
        operands: { ownerId: 'item', componentId: 'bg', show: true },
      },
    ]);
    expect(plan).not.toHaveProperty('expected');
    expect(JSON.stringify(plan)).not.toContain('catalog-normalized-expected');
    expect(markup).toContain('data-testid="scenario-ren-008"');
    expect(markup.match(/data-action-status="queued"/gu)).toHaveLength(4);
    expect(markup).toContain('data-testid="ren-008-background-inspector"');
    expect(markup).toContain('data-testid="ren-008-phase-select" disabled');
    expect(markup).toContain('value="initial" data-action-index="0"');
    expect(markup).toContain('value="image" data-action-index="1"');
    expect(markup).toContain('value="hidden" data-action-index="2"');
    expect(markup).toContain('value="shown" data-action-index="3"');
    expect(markup).toContain('A0 Rect');
    expect(markup).toContain('A1 Image');
    expect(markup).toContain('A2 Hidden');
    expect(markup).toContain('A3 Shown');
    expect(markup).toContain('data-testid="ren-008-component-id"');
    expect(markup).toContain('data-testid="ren-008-entity-id"');
    expect(markup).toContain('data-testid="ren-008-authored-size"');
    expect(markup).toContain('data-testid="ren-008-full-bounds"');
    expect(markup).toContain('data-testid="ren-008-visible-bounds"');
    expect(markup).toContain('data-testid="ren-008-source"');
    expect(markup).toContain('data-testid="ren-008-resource-state"');
    expect(markup).toContain('data-testid="ren-008-render-role"');
    expect(markup).toContain('data-testid="ren-008-binding-key"');
    expect(markup).toContain('data-testid="ren-008-generation"');
    expect(markup).toContain('data-testid="ren-008-render-object-count"');
    expect(markup).toContain('data-testid="ren-008-stale-count"');
    expect(markup).toContain('data-testid="ren-008-capture-row"');
    expect(markup).toContain('data-testid="ren-008-capture-id"');
    expect(markup).toContain('data-testid="ren-008-resource-count"');
    expect(markup).toContain('data-testid="ren-008-lease-count"');
    expect(markup).toContain('data-testid="ren-008-pending-release-count"');
    expect(markup).toContain('data-testid="ren-008-resource-journal"');
    expect(markup).toContain('data-testid="ren-008-run-fps"');
    expect(markup).toContain('data-testid="ren-008-run-max-frame-gap"');
    expect(markup).toContain('data-testid="ren-008-run-long-task-count"');
    expect(markup).toContain('displays only completed action products');
    expect(markup).not.toContain('data-testid="ren-005-image-inspector"');
    expect(markup).not.toContain('data-testid="ren-010-icon-inspector"');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders REN-010 with three actual icon phases and renderer-owned tint facts', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=REN-010&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('REN-010', '100', 319);
    const markup = renderCoreV2ContractLab(route);
    const iconIndex = CORE_V2_EXECUTABLE_CASE_IDS.indexOf('REN-010');

    expect(CORE_V2_EXECUTABLE_CASE_IDS[iconIndex - 1]).toBe('REN-008');
    expect(CORE_V2_EXECUTABLE_CASE_IDS[iconIndex + 1]).toBe('REN-011');
    expect(resolveCoreV2ExecutableRuntime('REN-010').key).toBe('render-component-assets');
    expect(route.presenter.executionStatus).toBe('actual-observable');
    expect(route.presenter.rootTestId).toBe('scenario-ren-010');
    expect(plan.route).toBe('/lab/core-v2?scenario=REN-010&size=100&seed=319');
    expect(plan.actionTrace).toEqual([
      {
        index: 0,
        type: 'loadDataset',
        operands: { datasetId: 'icon' },
      },
      {
        index: 1,
        type: 'replaceSource',
        operands: {
          target: { ownerId: 'item-a', id: 'icon' },
          source: 'fixture-icon-2',
          timeMs: 20,
        },
      },
      {
        index: 2,
        type: 'patch',
        operands: {
          target: { ownerId: 'item-a', id: 'icon' },
          changes: { tint: '#00ff00ff' },
        },
      },
    ]);
    expect(plan).not.toHaveProperty('expected');
    expect(JSON.stringify(plan)).not.toContain('catalog-normalized-expected');
    expect(markup).toContain('data-testid="scenario-ren-010"');
    expect(markup.match(/data-action-status="queued"/gu)).toHaveLength(3);
    expect(markup).toContain('data-testid="ren-010-icon-inspector"');
    expect(markup).toContain('data-testid="ren-010-phase-select" disabled');
    expect(markup).toContain('value="initial" data-action-index="0"');
    expect(markup).toContain('value="replacement" data-action-index="1"');
    expect(markup).toContain('value="tint" data-action-index="2"');
    expect(markup).toContain('A0 Initial alias');
    expect(markup).toContain('A1 Replacement alias');
    expect(markup).toContain('A2 Tint patch');
    expect(markup).toContain('data-testid="ren-010-component-id"');
    expect(markup).toContain('data-testid="ren-010-entity-id"');
    expect(markup).toContain('data-testid="ren-010-content-box"');
    expect(markup).toContain('data-testid="ren-010-icon-bounds"');
    expect(markup).toContain('data-testid="ren-010-authored-size"');
    expect(markup).toContain('data-testid="ren-010-placement"');
    expect(markup).toContain('data-testid="ren-010-margins"');
    expect(markup).toContain('data-testid="ren-010-source"');
    expect(markup).toContain('data-testid="ren-010-resource-state"');
    expect(markup).toContain('data-testid="ren-010-render-role"');
    expect(markup).toContain('data-testid="ren-010-binding-key"');
    expect(markup).toContain('data-testid="ren-010-generation"');
    expect(markup).toContain('data-testid="ren-010-semantic-tint"');
    expect(markup).toContain('data-testid="ren-010-renderer-tint"');
    expect(markup).toContain('data-testid="ren-010-render-object-count"');
    expect(markup).toContain('data-testid="ren-010-stale-count"');
    expect(markup).toContain('data-testid="ren-010-resource-count"');
    expect(markup).toContain('data-testid="ren-010-lease-count"');
    expect(markup).toContain('data-testid="ren-010-pending-release-count"');
    expect(markup).toContain('data-testid="ren-010-resource-journal"');
    expect(markup).toContain('data-testid="ren-010-run-fps"');
    expect(markup).toContain('data-testid="ren-010-run-max-frame-gap"');
    expect(markup).toContain('data-testid="ren-010-run-long-task-count"');
    expect(markup).toContain('displays only completed action products');
    expect(markup).not.toContain('data-testid="ren-005-image-inspector"');
    expect(markup).not.toContain('data-testid="ren-008-background-inspector"');
    expect(markup).not.toContain('ren-010-capture-row');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders AST-001 in canonical order with its exact asset action trace', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=AST-001&size=100&seed=319',
    );
    const plan = materializeCoreV2ExecutableCase('AST-001', '100', 319);
    const markup = renderCoreV2ContractLab(route);
    const assetIndex = CORE_V2_EXECUTABLE_CASE_IDS.indexOf('AST-001');

    expect(CORE_V2_EXECUTABLE_CASE_IDS[assetIndex - 1]).toBe('LAY-005');
    expect(CORE_V2_EXECUTABLE_CASE_IDS[assetIndex + 1]).toBe('CSM-001');
    expect(route.presenter.executionStatus).toBe('actual-observable');
    expect(route.presenter.rootTestId).toBe('scenario-ast-001');
    expect(plan.route).toBe('/lab/core-v2?scenario=AST-001&size=100&seed=319');
    expect(plan.actionTrace.map(({ type }) => type)).toEqual([
      'registerAssets',
      'registerAssets',
      'initializeWithRequiredAssetFailure',
      'acquireAsset',
      'acquireAsset',
      'destroy',
      'destroy',
      'registerAlias',
    ]);
    expect(markup).toContain('data-testid="scenario-ast-001"');
    expect(markup).toContain('data-contract-status="armed"');
    expect(markup).toContain('Actual-only case execution is available');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('keeps every non-executable route disabled and explicitly not implemented', () => {
    const route = parseCoreV2ContractRoute(
      '/lab/core-v2?scenario=LIF-003&size=500&seed=319',
    );
    const markup = renderCoreV2ContractLab(route);

    expect(markup).toContain('data-contract-status="not-implemented"');
    expect(markup).toContain('data-testid="load-dataset" disabled');
    expect(markup).toContain('data-action-status="not-implemented"');
    expect(markup).toContain('No engine action, semantic observation, or promotion result');
    expect(markup).not.toContain('data-contract-status="pass"');
  });

  it('renders malformed routes as an explicit non-passing error', () => {
    const error = new CoreV2ContractRouteError('INVALID_SEED', 'bad seed');
    const markup = renderCoreV2ContractRouteError(error);
    expect(markup).toContain('data-contract-status="invalid-route"');
    expect(markup).toContain('INVALID_SEED');
    expect(markup).not.toContain('scenario-lif-001');
  });
});

describe('Core v2 actual-only Lab bridge', () => {
  it('exposes only state, gesture, milestone, observation, and destroy operations', async () => {
    const presenter = selectCoreV2ContractPresenter('LIF-003');
    const bridge = createNotImplementedCoreV2ContractLabBridge({
      caseId: presenter.caseId,
      rootTestId: presenter.rootTestId,
      actionCount: presenter.actions.length,
    });

    expect(bridge.revision).toBe(CORE_V2_CONTRACT_LAB_BRIDGE_REVISION);
    expect(Object.keys(bridge).sort()).toEqual([
      'actualObservation',
      'armGesture',
      'awaitMilestone',
      'cleanup',
      'destroyCase',
      'execution',
      'repeatCase',
      'resetCase',
      'revision',
      'runCase',
      'state',
    ]);
    expect(bridge.state()).toMatchObject({
      caseId: 'LIF-003',
      rootTestId: 'scenario-lif-003',
      status: 'not-implemented',
      actionIndex: -1,
      repeatIndex: 0,
    });
    await expect(bridge.armGesture(0)).rejects.toBeInstanceOf(
      CoreV2ContractExecutionNotImplementedError,
    );
    await expect(bridge.awaitMilestone(0, 'published')).rejects.toBeInstanceOf(
      CoreV2ContractExecutionNotImplementedError,
    );
    await expect(bridge.runCase()).rejects.toBeInstanceOf(
      CoreV2ContractExecutionNotImplementedError,
    );
    await expect(bridge.repeatCase()).rejects.toBeInstanceOf(
      CoreV2ContractExecutionNotImplementedError,
    );
    expect(bridge.execution()).toBeNull();
    expect(bridge.cleanup()).toBeNull();

    const observation = await bridge.actualObservation();
    expect(observation).toMatchObject({
      $schema: 'core-v2-contract-lab-actual-stub/1',
      execution: { status: 'not-implemented' },
    });
    expect(JSON.stringify(observation)).not.toContain('"status":"pass"');
    expect(await bridge.destroyCase()).toEqual({ notImplemented: 1 });
    expect(bridge.state().status).toBe('destroyed');
  });

  it('keeps the Lab runtime dependency-firewalled from approved expected contents', async () => {
    const sources = await Promise.all([
      'presenters.ts',
      'route.ts',
      'bridge.ts',
      'executable-bridge.ts',
      'executable-cases.ts',
      'executable-runtime.ts',
      'main.ts',
    ].map((file) => readFile(new URL(`../../lab/performance-v2/contract/${file}`, import.meta.url), 'utf8')));
    const joined = sources.join('\n');
    expect(joined).not.toContain('catalog-normalized-expected');
    expect(joined).not.toMatch(/from ['"].*compare/);
    expect(joined).not.toMatch(/from ['"].*observe/);
    expect(joined).not.toMatch(/node:/);
    expect(joined).not.toMatch(/(?:execute|mutate|select|transform)(?:Scene|Entity|Selection|Viewport)/);
    expect(joined).toContain("state.status === 'failed'\n          ? 'not-run'");
    expect(joined).toContain("'.contract-case-action[data-action-index]'");
    expect(joined).not.toContain("querySelectorAll<HTMLElement>('[data-action-index]')");
  });
});
