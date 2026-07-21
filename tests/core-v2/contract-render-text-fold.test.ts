import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { resolveCoreV2ExecutableDataset } from '../../lab/performance-v2/contract/executable-cases';
import { createCoreV2RenderTextSpecimens } from '../../lab/performance-v2/contract/render-text-fixtures';
import type { CoreV2TextProjection } from '../../src/core-v2/contracts';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';
import {
  layoutCoreV2Text,
  type CoreV2TextLayout,
} from '../../src/core-v2/semantic/text-layout';

type JsonRecord = Record<string, unknown>;
type TextTarget =
  | Readonly<{ kind: 'element'; id: string }>
  | Readonly<{ kind: 'component'; ownerId: string; id: string }>;

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    options: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface FoldResult {
  readonly actual: Readonly<JsonRecord>;
  readonly fixtures: Readonly<JsonRecord>;
  readonly captures: Readonly<JsonRecord>;
}

interface FoldRuntime {
  readonly RENDER_TEXT_FOLD_REVISION: string;
  foldRenderTextExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: Readonly<JsonRecord>;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly operator: string;
      readonly value?: unknown;
    }>[];
  }>;
  readonly volatileFields: readonly string[];
}

interface CompareResult {
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
    readonly failure: Readonly<{ readonly code: string }> | null;
  }>[];
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: ExpectedCase;
      actual: Readonly<JsonRecord>;
      fixtures: Readonly<JsonRecord>;
      captures: Readonly<JsonRecord>;
    }>,
  ): CompareResult;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-render-text.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { RENDER_TEXT_FOLD_REVISION, foldRenderTextExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

const DOMAIN_NAMES = [
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
] as const;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 REN-006 / REN-011 actual-only fold', () => {
  it('is browser-safe, import-free, and independent of answer evidence', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-text.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_TEXT_FOLD_REVISION).toBe('core-v2-render-text-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(/node:/u);
  });

  it('folds REN-006 into immutable actual domains with capture and final-only publication proof', () => {
    const plan = selectedCase('REN-006');
    const folded = fold(plan, standaloneExecution());

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    expect(folded.actual).toMatchObject({
      $schema: 'core-v2-semantic-observation/1',
      case: { id: 'REN-006', caseType: 'capability' },
      geometry: {
        text: {
          positionWorld: [10, 20],
          rotationDegrees: 15,
        },
      },
      text: {
        content: 'مرحبا world',
        lines: ['مرحبا world'],
        layoutBounds: { x: 0, y: 0, width: 88, height: 20 },
        worldBounds: { x: 4.823619, y: 20, width: 90.177854, height: 42.094592 },
        hitBounds: { x: 4.823619, y: 20, width: 90.177854, height: 42.094592 },
        staleGlyphCount: 0,
        phases: {
          'initial-text': { source: 'A\r\n中😀é' },
        },
        empty: { visibleText: '', layoutBounds: [0, 0, 0, 20] },
        long: { lines: ['ABCD', 'EFGH', 'IJ'], layoutBounds: [0, 0, 32, 60] },
        missingFont: {
          fontRuns: [{ text: 'fallback', font: 'unifont-base-16.0.04' }],
          layoutBounds: [0, 0, 64, 20],
        },
        rapid: {
          visibleText: 'final中',
          layoutBounds: [0, 0, 56, 20],
          intermediatePublicationCount: 0,
          staleGlyphCount: 0,
        },
      },
      paint: {
        text: {
          opacity: 1,
          style: {
            fontFamily: 'Unifont',
            fontSize: 16,
            lineHeight: 20,
            letterSpacing: 0,
            fill: '#222222ff',
          },
        },
      },
      outcome: {
        text: {
          contentChangePreservedStyleAndTransform: true,
        },
      },
      resources: { retainedDelta: 0, cleanup: { status: 'completed' } },
    });
    expect(folded.captures).toEqual({
      text: {
        worldBounds: { x: 4.823619, y: 20, width: 90.177854, height: 42.094592 },
      },
    });
    const text = requireRecord(folded.actual.text, 'text');
    expect(Object.keys(requireRecord(text.phases, 'phases'))).toEqual(['initial-text']);
    expect(Object.keys(requireRecord(text.rapid, 'rapid'))).toEqual([
      'visibleText',
      'layoutBounds',
      'intermediatePublicationCount',
      'staleGlyphCount',
    ]);
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.actual.text)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);
  });

  it('folds four canonical and seven independently observed REN-011 rows', () => {
    const plan = selectedCase('REN-011');
    const folded = fold(plan, itemTextExecution());
    const text = requireRecord(folded.actual.text, 'text');
    const specimens = arrayValue(text.contractMatrix, 'contract matrix');

    expect(folded.actual).toMatchObject({
      case: { id: 'REN-011', caseType: 'capability' },
      scene: { itemText: { logicalCount: 4, renderObjectCount: 4, publication: 'current' } },
      text: {
        texts: {
          zero: {
            visibleText: 'AB😀CD',
            layoutBounds: { x: 0, y: 0, width: 48, height: 20 },
          },
          positive: {
            lines: ['AB', '😀C', 'D'],
            layoutBounds: { x: 0, y: 0, width: 24, height: 60 },
          },
          negative: {
            visibleText: 'AB😀CD',
            lineCount: 1,
            layoutBounds: { x: 0, y: 0, width: 48, height: 20 },
          },
          bidi: {
            visibleText: '中😀é\nمرحبا',
            lines: ['中😀é', 'مرحبا'],
            layoutBounds: { x: 0, y: 0, width: 40, height: 40 },
            staleGlyphCount: 0,
          },
          graphemeIntegrity: true,
        },
      },
      geometry: {
        texts: {
          placed: { localBounds: [219, 135, 16, 20] },
          upright: { screenAngle: 0 },
        },
      },
      paint: { texts: { placed: { tint: '#ff0000ff' } } },
      outcome: {
        textContractMatrix: { allRowsExact: true },
        itemText: { inputImmutable: true, graphemeIntegrity: true, staleGlyphCount: 0 },
      },
    });
    expect(specimens.map((entry) => requireRecord(entry, 'specimen').id)).toEqual([
      'placed',
      'auto',
      'wrap',
      'overflow-visible',
      'overflow-hidden',
      'overflow-ellipsis',
      'upright',
    ]);
    expect(specimens.map((entry) => Object.keys(requireRecord(entry, 'specimen')))).toEqual([
      ['id', 'source', 'placement', 'margin', 'tint', 'localBounds', 'rgba'],
      ['id', 'source', 'frame', 'autoFont', 'visibleText', 'layoutBounds'],
      ['id', 'source', 'wrapWidth', 'lines', 'layoutBounds'],
      ['id', 'source', 'frame', 'overflow', 'visibleText', 'layoutBounds'],
      ['id', 'source', 'frame', 'overflow', 'visibleText', 'layoutBounds'],
      ['id', 'source', 'frame', 'overflow', 'visibleText', 'layoutBounds'],
      ['id', 'source', 'placement', 'itemAngle', 'orientation', 'screenAngle', 'layoutBounds'],
    ]);
    expect(folded.fixtures).toEqual({
      datasetRef: 'item-text-corpus',
      fixtureParamKeys: ['datasetRef', 'fontProfile', 'itemTextContractMatrix', 'texts'],
    });
    expect(folded.fixtures).not.toHaveProperty('itemTextContractMatrix');
  });

  it('matches the immutable approved REN-006 and REN-011 catalogs exactly', () => {
    const cases = [
      ['REN-006', standaloneExecution(), 30],
      ['REN-011', itemTextExecution(), 20],
    ] as const;
    for (const [caseId, execution, count] of cases) {
      const folded = fold(selectedCase(caseId), execution);
      const comparison = compareObservation({
        expectedCase: approvedExpectedCase(caseId),
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });
      const failures = comparison.assertions.filter(({ passed }) => !passed);
      expect(comparison, JSON.stringify(failures)).toMatchObject({ passed: count, failed: 0 });
      expect(comparison.assertions.every(({ passed, failure }) => passed && failure === null))
        .toBe(true);
    }
  });

  it('is unaffected by poisoned result-looking REN-011 fixture rows', () => {
    const plan = structuredClone(selectedCase('REN-011')) as MutablePlan;
    const execution = itemTextExecution();
    const baseline = fold(plan, execution);
    plan.fixture.setup.params.itemTextContractMatrix = [{
      chosen: -9,
      lines: ['poison'],
      visibleText: 'poison',
      layoutBounds: [999, 999, 999, 999],
      screenAngle: 123,
      rgba: '#00ff00ff',
    }];

    expect(fold(plan, execution)).toEqual(baseline);
  });

  it.each([
    ['missing required probe', (execution: JsonRecord) => {
      const after = actionActual(execution, 3).after;
      const probes = arrayValue(requireRecord(after, 'after').textProbes, 'terminal probes');
      probes.pop();
    }],
    ['corrupt renderer signature', (execution: JsonRecord) => {
      const probe = terminalProbe(execution, 'item-a:bidi');
      requireRecord(requireRecord(probe.renderer, 'renderer').semanticSignatures, 'signatures')
        .content = 'corrupt';
    }],
    ['retain a stale glyph', (execution: JsonRecord) => {
      const probe = terminalProbe(execution, 'item-a:bidi');
      requireRecord(probe.renderer, 'renderer').staleGlyphCount = 1;
    }],
    ['misorder supplemental rows', (execution: JsonRecord) => {
      const supplemental = arrayValue(actionActual(execution, 1).supplemental, 'supplemental');
      const first = supplemental[0];
      const second = supplemental[1];
      if (!first || !second) throw new Error('Missing supplemental rows');
      supplemental[0] = second;
      supplemental[1] = first;
    }],
    ['skip canonical restoration before patch', (execution: JsonRecord) => {
      const before = requireRecord(actionActual(execution, 2).before, 'patch before');
      const probes = arrayValue(before.textProbes, 'patch before probes');
      const entry = requireRecord(probes[0], 'patch before entry');
      requireRecord(requireRecord(entry.probe, 'patch before probe').projection, 'projection')
        .source = 'specimen residue';
    }],
    ['retain a cleanup canvas', (execution: JsonRecord) => {
      const cleanup = requireRecord(execution.cleanup, 'cleanup');
      const releases = arrayValue(cleanup.releases, 'releases');
      const remaining = requireRecord(requireRecord(releases[0], 'release').remainingResources, 'remaining');
      remaining.canvasCount = 1;
    }],
    ['record an external font request', (execution: JsonRecord) => {
      const after = requireRecord(actionActual(execution, 3).after, 'terminal product');
      const resources = requireRecord(after.resources, 'terminal resources');
      requireRecord(resources.transport, 'transport').externalFontRequestCount = 1;
    }],
  ] as const)('fails closed when evidence has %s', (_label, mutate) => {
    const execution = structuredClone(itemTextExecution());
    mutate(execution);
    expect(() => fold(selectedCase('REN-011'), execution)).toThrow(/render-text fold invalid/u);
  });

  it.each([
    ['authored source', (execution: JsonRecord) => {
      exportedTextComponent(execution, 'placed').text = 'poison';
    }],
    ['placed projection placement', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'placed').projection, 'placed projection')
        .placement = 'left-top';
    }],
    ['placed semantic margin', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'placed').semantic, 'placed semantic')
        .margin = { top: 6, right: 6, bottom: 6, left: 6 };
    }],
    ['placed projected tint', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'placed').projection, 'placed projection')
        .color = 0x00ff00ff;
    }],
    ['auto authored frame', (execution: JsonRecord) => {
      requireRecord(exportedOwner(execution, 'auto').size, 'auto size').width = 31;
    }],
    ['auto chosen font', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'auto').projection, 'auto projection')
        .fontSizePx = 99;
    }],
    ['wrap authored width', (execution: JsonRecord) => {
      requireRecord(exportedTextComponent(execution, 'wrap').style, 'wrap style')
        .wordWrapWidth = 31;
    }],
    ['visible overflow projection', (execution: JsonRecord) => {
      requireRecord(
        supplementalProbe(execution, 'overflow-visible').projection,
        'visible projection',
      ).overflow = 'hidden';
    }],
    ['hidden overflow projection', (execution: JsonRecord) => {
      requireRecord(
        supplementalProbe(execution, 'overflow-hidden').projection,
        'hidden projection',
      ).overflow = 'visible';
    }],
    ['ellipsis overflow projection', (execution: JsonRecord) => {
      requireRecord(
        supplementalProbe(execution, 'overflow-ellipsis').projection,
        'ellipsis projection',
      ).overflow = 'hidden';
    }],
    ['upright semantic orientation', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'upright').semantic, 'upright semantic')
        .contentOrientation = 'follow-item';
    }],
    ['upright projection placement', (execution: JsonRecord) => {
      requireRecord(supplementalProbe(execution, 'upright').projection, 'upright projection')
        .placement = 'left';
    }],
    ['upright item angle', (execution: JsonRecord) => {
      requireRecord(exportedOwner(execution, 'upright').attrs, 'upright attrs').angle = 38;
    }],
  ] as const)('fails closed when supplemental %s is poisoned', (_label, mutate) => {
    const execution = structuredClone(itemTextExecution());
    mutate(execution);
    expect(() => fold(selectedCase('REN-011'), execution)).toThrow(/render-text fold invalid/u);
  });

  it.each([
    ['is missing', (cleanup: JsonRecord) => {
      delete cleanup.productResources;
    }],
    ['has the wrong revision', (cleanup: JsonRecord) => {
      requireRecord(cleanup.productResources, 'product resources').revision = 'wrong';
    }],
    ['has the wrong case', (cleanup: JsonRecord) => {
      requireRecord(cleanup.productResources, 'product resources').caseId = 'REN-006';
    }],
    ['retains a runtime session', (cleanup: JsonRecord) => {
      const product = requireRecord(cleanup.productResources, 'product resources');
      requireRecord(product.runtimeCounts, 'runtime counts').activeSessionCount = 1;
    }],
    ['retains transport work', (cleanup: JsonRecord) => {
      const product = requireRecord(cleanup.productResources, 'product resources');
      requireRecord(product.transport, 'transport').networkRequestCount = 1;
    }],
    ['misreports supplemental count', (cleanup: JsonRecord) => {
      const product = requireRecord(cleanup.productResources, 'product resources');
      requireRecord(product.supplemental, 'supplemental').specimenCount = 6;
    }],
    ['omits the terminal release event', (cleanup: JsonRecord) => {
      const product = requireRecord(cleanup.productResources, 'product resources');
      arrayValue(product.journal, 'product journal').pop();
    }],
    ['does not extend the terminal resource journal', (cleanup: JsonRecord) => {
      const product = requireRecord(cleanup.productResources, 'product resources');
      const journal = arrayValue(product.journal, 'product journal');
      requireRecord(journal[0], 'first journal event').event = 'text-runtime-observed';
    }],
  ] as const)('fails closed when cleanup productResources %s', (_label, mutate) => {
    const execution = structuredClone(itemTextExecution());
    mutate(requireRecord(execution.cleanup, 'cleanup'));
    expect(() => fold(selectedCase('REN-011'), execution)).toThrow(/render-text fold invalid/u);
  });

  it('fails closed when exported source/frame and product projection/geometry drift coherently', () => {
    const execution = structuredClone(itemTextExecution());
    exportedTextComponent(execution, 'placed').text = 'CD';
    requireRecord(exportedOwner(execution, 'placed').size, 'placed size').width = 260;
    rebuildSupplementalProductFromExport(execution, 'placed');

    expect(() => fold(selectedCase('REN-011'), execution)).toThrow(
      /product export fidelity to pre-load authored facts/u,
    );
  });

  it.each([
    [
      'upright screen cancellation',
      (execution: JsonRecord) => {
        supplementalSurfaceGeometry(execution, 'upright').screenAngle = 1;
      },
      ['/geometry/texts/upright/screenAngle'],
    ],
    [
      'placed bounds',
      (execution: JsonRecord) => {
        const placed = supplementalProbe(execution, 'placed');
        requireRecord(placed.projection, 'placed projection').ownerLocalBounds = {
          x: 218,
          y: 135,
          width: 16,
          height: 20,
        };
        requireRecord(placed.geometry, 'placed geometry').ownerLocalBounds = [218, 135, 16, 20];
      },
      ['/geometry/texts/placed/localBounds'],
    ],
    [
      'auto font choice',
      (execution: JsonRecord) => {
        requireRecord(supplementalProbe(execution, 'auto').projection, 'auto projection')
          .fontSizePx = 17;
      },
      ['/text/contractMatrix'],
    ],
    [
      'wrap lines and count',
      (execution: JsonRecord) => {
        mutateSupplementalLayout(execution, 'wrap', {
          lines: ['ABCDE', 'FGHIJ'],
          visibleLines: ['ABCDE', 'FGHIJ'],
          visibleText: 'ABCDE\nFGHIJ',
          layoutBounds: [0, 0, 40, 40],
          ownerLocalBounds: [100, 60, 40, 40],
        });
      },
      ['/text/contractMatrix'],
    ],
    [
      'overflow visible content',
      (execution: JsonRecord) => {
        mutateSupplementalLayout(execution, 'overflow-visible', {
          lines: ['ABCDEFGHI'],
          visibleLines: ['ABCDEFGHI'],
          visibleText: 'ABCDEFGHI',
          layoutBounds: [0, 0, 72, 20],
          ownerLocalBounds: [-20, 0, 72, 20],
        });
      },
      ['/text/contractMatrix'],
    ],
  ] as const)(
    'reports coherent %s drift as allRowsExact=false',
    (_label, mutate, relevantPaths) => {
      const execution = structuredClone(itemTextExecution());
      mutate(execution);
      const folded = fold(selectedCase('REN-011'), execution);
      expect(valueAt(folded.actual, ['outcome', 'textContractMatrix', 'allRowsExact']))
        .toBe(false);

      const comparison = compareObservation({
        expectedCase: approvedExpectedCase('REN-011'),
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });
      const paths = comparison.assertions
        .filter(({ passed }) => !passed)
        .map(({ path }) => path);
      expect(paths).toEqual(expect.arrayContaining([
        '/outcome/textContractMatrix/allRowsExact',
        ...relevantPaths,
      ]));
    },
  );
});

interface MutablePlan extends MaterializedCase {
  fixture: {
    setup: { params: JsonRecord };
    actionTrace: readonly ContractAction[];
    captureCheckpoints: readonly unknown[];
    cleanupTrace: readonly unknown[];
  };
}

function selectedCase(caseId: 'REN-006' | 'REN-011'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function approvedExpectedCase(caseId: 'REN-006' | 'REN-011'): ExpectedCase {
  const record = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find((candidate) => candidate.id === caseId);
  if (!record) throw new Error(`Missing approved expected ${caseId}`);
  return record;
}

function fold(plan: MaterializedCase, execution: JsonRecord): FoldResult {
  return foldRenderTextExecution({
    casePlan: plan,
    execution,
    provenance: {
      codeCommit: 'test-commit',
      packedPackageSha256: 'test-package',
      contractRevision: 'core-v2-functional-contract/2026-07-16.2',
    },
    environment: {
      browserVersion: 'unit-test',
      platform: process.platform,
      locale: 'en-US',
      devicePixelRatio: 1,
    },
  });
}

function standaloneExecution(): JsonRecord {
  const targets = [
    elementTarget('text'),
    elementTarget('empty-text'),
    elementTarget('long-text'),
    elementTarget('missing-font'),
    elementTarget('rapid-text'),
  ];
  const initialDataset = executableDataset('standalone-text');
  const primaryDataset = patchText(initialDataset, elementTarget('text'), 'مرحبا world');
  const intermediateDataset = patchText(primaryDataset, elementTarget('rapid-text'), 'intermediate');
  const terminalDataset = patchText(primaryDataset, elementTarget('rapid-text'), 'final中');
  const initial = productForDataset(initialDataset, targets, 1, 1, 'current');
  const primary = productForDataset(
    primaryDataset,
    [elementTarget('text')],
    2,
    2,
    'current',
  );
  const intermediate = productForDataset(
    intermediateDataset,
    [elementTarget('rapid-text')],
    3,
    2,
    'pending',
    initialDataset,
  );
  const pendingFinal = productForDataset(
    terminalDataset,
    [elementTarget('rapid-text')],
    4,
    2,
    'pending',
    initialDataset,
  );
  const terminal = productForDataset(terminalDataset, targets, 4, 3, 'current');
  const trace = [
    actionResult(0, 'loadDataset', {
      input: inputEvidence('standalone-text'),
      product: initial,
    }),
    actionResult(1, 'snapshot-observation', {
      label: 'initial-text',
      input: inputEvidence('standalone-text'),
      product: initial,
    }),
    actionResult(2, 'patch', {
      input: inputEvidence('standalone-text'),
      publishTriggered: true,
      after: primary,
    }),
    actionResult(3, 'patch', {
      input: inputEvidence('standalone-text'),
      publishTriggered: false,
      after: intermediate,
    }),
    actionResult(4, 'patch', {
      input: inputEvidence('standalone-text'),
      publishTriggered: false,
      after: pendingFinal,
    }),
    actionResult(5, 'publishFrame', {
      input: inputEvidence('standalone-text'),
      before: pendingFinal,
      after: terminal,
    }),
  ];
  const primaryProbe = probeFromProduct(terminal, 'text');
  const worldBounds = arrayValue(
    requireRecord(primaryProbe.geometry, 'primary geometry').worldBounds,
    'primary world bounds',
  );
  return execution('REN-006', trace, terminal, [{
    id: 'text',
    phase: 'after-action',
    afterActionIndex: 5,
    values: {
      worldBounds: {
        x: worldBounds[0],
        y: worldBounds[1],
        width: worldBounds[2],
        height: worldBounds[3],
      },
    },
  }], ['main']);
}

function itemTextExecution(): JsonRecord {
  const canonicalTargets = [
    componentTarget('item-a', 'zero'),
    componentTarget('item-a', 'positive'),
    componentTarget('item-a', 'negative'),
    componentTarget('item-a', 'bidi'),
  ];
  const initialSources: Readonly<Record<string, string>> = {
    zero: 'AB😀CD',
    positive: 'AB😀CD',
    negative: 'AB😀CD',
    bidi: 'ABC مرحبا 😀',
  };
  const splitById: Readonly<Record<string, number>> = { zero: 0, positive: 2, negative: -1, bidi: 0 };
  const canonical = product(canonicalTargets.map((target) => probe({
    target,
    source: initialSources[target.id] ?? '',
    split: splitById[target.id] ?? 0,
    sceneRevision: 1,
    frameRevision: 1,
    status: 'current',
  })), 1, 1, 'REN-011');
  const supplemental = createCoreV2RenderTextSpecimens().map((specimen, index) => {
    const exportedDataset = materializeCoreV2Dataset(specimen.dataset).dataset;
    const parsed = parsePatchMapV010(exportedDataset);
    const entityId = `${specimen.target.ownerId}::text:${specimen.id}`;
    const projection = parsed.projection.textsByEntityId?.[entityId];
    const entityProjection = parsed.projection.byEntityId[entityId];
    if (!projection || !entityProjection) throw new Error(`Missing ${specimen.id} projection`);
    const specimenProbe = probe({
      target: specimen.target,
      source: projection.source,
      sceneRevision: index + 1,
      frameRevision: index + 1,
      status: 'current',
      projection,
      affine: entityProjection.affine,
      worldBasis: entityProjection.worldBasis,
      rotationDegrees: entityProjection.rotationDegrees,
    });
    return {
      id: specimen.id,
      datasetId: specimen.datasetId,
      target: specimen.target,
      authored: authoredFactsForSpecimen(specimen),
      loaded: { lifecycle: 'scene-ready', sceneRevision: index + 1 },
      input: supplementalInputEvidence(specimen.datasetId),
      product: product(
        [specimenProbe],
        index + 1,
        index + 1,
        'REN-011',
        structuredClone(exportedDataset) as unknown as JsonRecord[],
      ),
    };
  });
  const initialBidi = initialSources.bidi;
  if (initialBidi === undefined) throw new Error('Missing initial bidi source');
  const pendingBidi = product([probe({
    target: componentTarget('item-a', 'bidi'),
    source: '中😀é\nمرحبا',
    previousSource: initialBidi,
    sceneRevision: 2,
    frameRevision: 1,
    status: 'pending',
  })], 2, 1, 'REN-011');
  const restoredBidi = product([probe({
    target: componentTarget('item-a', 'bidi'),
    source: initialBidi,
    sceneRevision: 9,
    frameRevision: 9,
    status: 'current',
  })], 9, 9, 'REN-011');
  const terminal = product(canonicalTargets.map((target) => probe({
    target,
    source: target.id === 'bidi'
      ? '中😀é\nمرحبا'
      : initialSources[target.id] ?? '',
    split: splitById[target.id] ?? 0,
    sceneRevision: 2,
    frameRevision: 2,
    status: 'current',
  })), 2, 2, 'REN-011');
  const trace = [
    actionResult(0, 'loadDataset', {
      input: inputEvidence('item-text-corpus'),
      product: canonical,
    }),
    actionResult(1, 'observeItemTextMatrix', {
      valueRef: 'itemTextContractMatrix',
      input: inputEvidence('item-text-corpus'),
      canonical,
      supplemental,
      resources: resourceProbe('REN-011'),
    }),
    actionResult(2, 'patch', {
      input: inputEvidence('item-text-corpus'),
      publishTriggered: false,
      before: restoredBidi,
      after: pendingBidi,
    }),
    actionResult(3, 'publishFrame', {
      input: inputEvidence('item-text-corpus'),
      before: pendingBidi,
      after: terminal,
    }),
  ];
  return execution('REN-011', trace, terminal, [], ['main']);
}

function authoredFactsForSpecimen(
  specimen: ReturnType<typeof createCoreV2RenderTextSpecimens>[number],
): JsonRecord {
  const owner = requireRecord(specimen.dataset[0], `${specimen.id} authored owner`);
  const components = arrayValue(owner.components, `${specimen.id} authored components`);
  const component = requireRecord(
    components.find((value) => isRecord(value) && value.id === specimen.id),
    `${specimen.id} authored component`,
  );
  const style = requireRecord(component.style, `${specimen.id} authored style`);
  const size = requireRecord(owner.size, `${specimen.id} authored size`);
  const marginValue = component.margin;
  const margin = typeof marginValue === 'number'
    ? { top: marginValue, right: marginValue, bottom: marginValue, left: marginValue }
    : isRecord(marginValue)
      ? structuredClone(marginValue)
      : { top: 0, right: 0, bottom: 0, left: 0 };
  const autoFont = isRecord(style.autoFont)
    ? { min: style.autoFont.min, max: style.autoFont.max }
    : null;
  const attrs = isRecord(owner.attrs) ? owner.attrs : null;
  return {
    revision: 'core-v2-render-text-authored-facts/1',
    datasetId: specimen.datasetId,
    ownerId: specimen.target.ownerId,
    componentId: specimen.id,
    source: component.text,
    frame: [size.width, size.height],
    metrics: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    },
    placement: component.placement ?? null,
    margin,
    tint: component.tint ?? null,
    autoFont,
    wrap: {
      enabled: style.wordWrap === true,
      breakWords: style.breakWords === true,
      width: style.wordWrapWidth ?? null,
    },
    overflow: style.overflow ?? null,
    itemAngle: attrs?.angle ?? null,
    orientation: owner.contentOrientation ?? null,
  };
}

function execution(
  caseId: 'REN-006' | 'REN-011',
  actionResults: JsonRecord[],
  terminal: JsonRecord,
  captures: JsonRecord[],
  releaseRoles: string[],
): JsonRecord {
  const snapshot = requireRecord(terminal.snapshot, 'terminal snapshot');
  for (const resultValue of actionResults) {
    const delta = requireRecord(resultValue.delta, 'action delta');
    delta.caseId = caseId;
  }
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId,
    caseType: 'capability',
    status: 'completed',
    actionResults,
    captures,
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {
      [caseId === 'REN-006' ? 'standalone-text' : 'item-text-corpus']: {
        beforeFingerprint: 'input-sha256',
        afterFingerprint: 'input-sha256',
        unchanged: true,
      },
    },
    hostSeamDelta: null,
    terminalSnapshot: snapshot,
    terminalSemanticProbe: semanticProbe(terminalTextCount(terminal)),
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: releaseRoles.map((role, index) => cleanupRelease(role, index + 1)),
      productResources: cleanupProductResources(caseId),
      errors: [],
    },
    error: null,
  };
}

function actionResult(index: number, type: string, actual: JsonRecord): JsonRecord {
  return {
    index,
    type,
    handlerId: `contract/${type}`,
    status: 'completed',
    startedAtMs: index,
    completedAtMs: index,
    delta: {
      $schema: 'core-v2-semantic-observation-delta/1',
      caseId: type === 'observeItemTextMatrix' || type === 'publishFrame' && index === 3
        ? 'REN-011'
        : 'REN-006',
      actionIndex: index,
      actionType: type,
      actual,
      semanticProbe: semanticProbe(1),
    },
  };
}

function executableDataset(reference: string): JsonRecord[] {
  const value = resolveCoreV2ExecutableDataset(reference);
  if (!Array.isArray(value)) throw new Error(`Missing executable dataset ${reference}`);
  return structuredClone(value) as unknown as JsonRecord[];
}

function patchText(dataset: JsonRecord[], target: TextTarget, text: string): JsonRecord[] {
  const next = structuredClone(dataset);
  const roots = next;
  const owner = findElement(roots, target.kind === 'element' ? target.id : target.ownerId);
  if (target.kind === 'element') {
    owner.text = text;
    return roots;
  }
  const components = arrayValue(owner.components, `${target.ownerId} components`);
  const component = components.find((value) => (
    isRecord(value) && value.type === 'text' && value.id === target.id
  ));
  requireRecord(component, `${target.ownerId}:${target.id} component`).text = text;
  return roots;
}

function findElement(elements: JsonRecord[], id: string): JsonRecord {
  const found = findElementOrNull(elements, id);
  if (found) return found;
  throw new Error(`Missing element ${id}`);
}

function findElementOrNull(elements: JsonRecord[], id: string): JsonRecord | null {
  for (const element of elements) {
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const child = findElementOrNull(element.children.filter(isRecord), id);
      if (child) return child;
    }
  }
  return null;
}

function productForDataset(
  dataset: JsonRecord[],
  targets: TextTarget[],
  sceneRevision: number,
  frameRevision: number,
  status: 'current' | 'pending',
  previousDataset?: JsonRecord[],
): JsonRecord {
  const exportedDataset = materializeCoreV2Dataset(dataset).dataset;
  const parsed = parsePatchMapV010(exportedDataset);
  const previousParsed = previousDataset === undefined
    ? null
    : parsePatchMapV010(materializeCoreV2Dataset(previousDataset).dataset);
  const probes = targets.map((target) => {
    const entityId = target.kind === 'element'
      ? target.id
      : `${target.ownerId}::text:${target.id}`;
    const projection = parsed.projection.textsByEntityId?.[entityId];
    const entityProjection = parsed.projection.byEntityId[entityId];
    const previousProjection = previousParsed?.projection.textsByEntityId?.[entityId];
    if (!projection || !entityProjection) throw new Error(`Missing parsed text ${entityId}`);
    return probe({
      target,
      source: projection.source,
      sceneRevision,
      frameRevision,
      status,
      projection,
      ...(previousProjection ? { previousProjection } : {}),
      affine: entityProjection.affine,
      localBounds: entityProjection.localBounds,
      worldBasis: entityProjection.worldBasis,
      visibleCenter: entityProjection.visibleCenter,
      rotationDegrees: entityProjection.rotationDegrees,
    });
  });
  return product(
    probes,
    sceneRevision,
    frameRevision,
    'REN-006',
    structuredClone(exportedDataset) as unknown as JsonRecord[],
  );
}

function product(
  probes: JsonRecord[],
  sceneRevision: number,
  frameRevision: number,
  caseId: 'REN-006' | 'REN-011' = 'REN-006',
  exportedDataset: JsonRecord[] = [],
): JsonRecord {
  const publishedScene = probes.every((entry) => (
    requireRecord(entry.publication, 'probe publication').status === 'current'
  )) ? sceneRevision : sceneRevision - 1;
  return {
    snapshot: snapshot(sceneRevision, frameRevision, publishedScene, probes.length),
    semanticProbe: semanticProbe(probes.length),
    geometryProbe: {
      revision: sceneRevision,
      revisionLag: 0,
      entities: probes.map(surfaceGeometry),
      relations: [],
      omittedRelations: [],
      selectionOverlay: null,
    },
    exportedDataset,
    textProbes: probes.map((probeValue) => ({
      key: targetKey(requireRecord(probeValue.target, 'probe target')),
      target: structuredClone(probeValue.target),
      probe: probeValue,
    })),
    resources: resourceProbe(caseId),
  };
}

function probe(options: Readonly<{
  target: TextTarget;
  source: string;
  previousSource?: string;
  split?: number;
  sceneRevision: number;
  frameRevision: number;
  status: 'current' | 'pending';
  projection?: CoreV2TextProjection;
  previousProjection?: CoreV2TextProjection;
  affine?: readonly [number, number, number, number, number, number];
  localBounds?: readonly [number, number, number, number];
  worldBasis?: readonly [number, number, number, number];
  visibleCenter?: readonly [number, number];
  rotationDegrees?: number;
}>): JsonRecord {
  const target = structuredClone(options.target);
  const layout = options.projection ?? textLayout(options.source, options.split ?? 0);
  const previousLayout = options.previousProjection ??
    textLayout(options.previousSource ?? options.source, options.split ?? 0);
  const entityId = target.kind === 'element'
    ? String(target.id)
    : `${String(target.ownerId)}::text:${String(target.id)}`;
  const ownerBounds: readonly [number, number, number, number] = options.projection
    ? [
        options.projection.ownerLocalBounds.x,
        options.projection.ownerLocalBounds.y,
        options.projection.ownerLocalBounds.width,
        options.projection.ownerLocalBounds.height,
      ]
    : [0, 0, layout.layoutBounds.width, layout.layoutBounds.height];
  const localBounds = options.localBounds ?? [
    0,
    0,
    layout.layoutBounds.width,
    layout.layoutBounds.height,
  ];
  const worldBounds = options.affine
    ? transformedBounds(options.affine, localBounds)
    : [ownerBounds[0], ownerBounds[1], ownerBounds[2], ownerBounds[3]] as const;
  const semanticSignatures = signatures(layout);
  const previousSignatures = signatures(previousLayout);
  const attachedSignatures = options.status === 'current'
    ? { ...semanticSignatures, renderer: `renderer:${layout.contentSignature}` }
    : { ...previousSignatures, renderer: `renderer:${previousLayout.contentSignature}` };
  const renderedSignatures = attachedSignatures;
  const publishedScene = options.status === 'current'
    ? options.sceneRevision
    : options.sceneRevision - 1;
  const authoredStyle = options.projection?.authoredStyle ?? {
    fontFamily: 'Unifont',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    fill: '#222222',
  };
  const projection: JsonRecord = options.projection
    ? structuredClone(options.projection) as unknown as JsonRecord
    : {
        ...layout,
        entityId,
        targetKind: target.kind,
        ...(target.kind === 'component'
          ? { ownerId: target.ownerId, componentId: target.id }
          : {}),
        authoredStyle,
        color: 0x222222ff,
        placement: null,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        contentOrientation: 'follow-item',
      };
  const color = numberValue(projection.color, 'projection color');
  const contentOrientation = stringValue(
    projection.contentOrientation,
    'projection orientation',
  );
  const affine = options.affine ?? [1, 0, 0, 1, worldBounds[0], worldBounds[1]];
  const worldBasis = options.worldBasis ?? [1, 0, 0, 1];
  const rotationDegrees = options.rotationDegrees ?? 0;
  const semantic = {
    target,
    semanticOwnerId: target.kind === 'component' ? target.ownerId : target.id,
    source: projection.source,
    authoredStyle,
    placement: projection.placement,
    margin: structuredClone(projection.margin),
    tint: target.kind === 'component' ? packedRgba(color) : null,
    split: projection.split,
    show: true,
    locked: false,
    contentOrientation,
  };
  return {
    target,
    semantic,
    semanticOwnerId: target.kind === 'component' ? target.ownerId : target.id,
    entityId,
    projection,
    geometry: {
      localBounds,
      ownerLocalBounds: ownerBounds,
      worldBounds,
      hitBounds: worldBounds,
      visibleBounds: worldBounds,
    },
    state: { visible: true, interactive: true, zIndex: 0, opacity: 1 },
    transform: {
      affine,
      worldBasis,
      visibleCenter: options.visibleCenter ?? [
        worldBounds[0] + worldBounds[2] / 2,
        worldBounds[1] + worldBounds[3] / 2,
      ],
      rotationDegrees,
      scaleX: 1,
      scaleY: 1,
      contentOrientation,
    },
    renderer: {
      semanticRoute: layout.rendererRoute,
      route: 'fallback-text',
      rendererKind: 'fallback-text',
      routeReason: 'atlas-coverage-unproven',
      objectCount: 1,
      semanticSignatures,
      attachedSignatures,
      lastRenderedSignatures: renderedSignatures,
      lastRenderedFrame: options.frameRevision,
      staleGlyphCount: options.status === 'current' ? 0 : Math.max(1, previousLayout.graphemes.length),
    },
    rendererPaint: options.status === 'current' ? {
      entityId,
      lane: 'text',
      rendererKind: 'text',
      primitiveCount: 1,
      renderObjectCount: 1,
      packedTint: color,
      rgbTint: color >>> 8,
      alpha: (color & 0xff) / 0xff,
    } : null,
    renderLanes: options.status === 'current' ? {
      text: {
        role: 'text',
        label: 'PATCH MAP Core v2 / text',
        renderObjectCount: 1,
        visiblePrimitiveCount: 1,
      },
    } : null,
    publication: {
      status: options.status,
      revisions: {
        current: {
          lifecycleGeneration: 1,
          sceneRevision: options.sceneRevision,
          viewRevision: 0,
          interactionRevision: 0,
        },
        published: { scene: publishedScene, view: 0, interaction: 0 },
        frameRevision: options.frameRevision,
        surfaceSceneRevision: options.sceneRevision,
        surfaceRenderedSceneRevision: publishedScene,
        rendererFrame: options.frameRevision,
      },
    },
    availability: {
      semantic: true,
      surface: true,
      renderer: true,
      rendererPaint: options.status === 'current',
      renderLanes: options.status === 'current',
    },
  };
}

function packedRgba(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function surfaceGeometry(probeValue: JsonRecord): JsonRecord {
  const target = requireRecord(probeValue.target, 'surface target');
  const projection = requireRecord(probeValue.projection, 'surface projection');
  const geometry = requireRecord(probeValue.geometry, 'surface geometry');
  const state = requireRecord(probeValue.state, 'surface state');
  const transform = requireRecord(probeValue.transform, 'surface transform');
  const orientation = stringValue(projection.contentOrientation, 'surface orientation');
  return {
    id: stringValue(probeValue.entityId, 'surface entity ID'),
    kind: 'text',
    localBounds: structuredClone(geometry.localBounds),
    worldBounds: structuredClone(geometry.worldBounds),
    screenBounds: structuredClone(geometry.worldBounds),
    visibleBounds: structuredClone(geometry.visibleBounds),
    visible: state.visible,
    interactive: state.interactive,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    ...(target.kind === 'component'
      ? {
          ownerItemId: target.ownerId,
          componentId: target.id,
          componentType: 'text',
        }
      : {}),
    contentOrientation: orientation,
    screenBasis: structuredClone(transform.worldBasis),
    visibleCenter: structuredClone(transform.visibleCenter),
    screenAngle: orientation === 'upright' ? 0 : transform.rotationDegrees,
  };
}

function transformedBounds(
  affine: readonly [number, number, number, number, number, number],
  bounds: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const [a, b, c, d, tx, ty] = affine;
  const [x, y, width, height] = bounds;
  const points = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map(([localX = 0, localY = 0]) => [
    a * localX + c * localY + tx,
    b * localX + d * localY + ty,
  ] as const);
  const xs = points.map(([pointX]) => pointX);
  const ys = points.map(([, pointY]) => pointY);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX - minX, maxY - minY];
}

function textLayout(source: string, split: number): CoreV2TextLayout {
  return layoutCoreV2Text({
    source,
    requestedFont: 'Unifont',
    availableRequestedFonts: ['Unifont'],
    fontSizePx: 16,
    lineHeightPx: 20,
    letterSpacingPx: 0,
    split,
    breakWords: true,
    wordWrapWidthPx: source === 'ABCDEFGHIJ' ? 32 : null,
    origin: { x: 0, y: 0 },
  });
}

function signatures(layout: CoreV2TextLayout): JsonRecord {
  return {
    content: layout.contentSignature,
    style: layout.styleSignature,
    layout: layout.layoutSignature,
  };
}

function snapshot(
  sceneRevision: number,
  frameRevision: number,
  publishedScene: number,
  textCount: number,
  lifecycle = 'scene-ready',
): JsonRecord {
  const destroyed = lifecycle === 'destroyed';
  return {
    lifecycle,
    instanceId: destroyed ? null : 'text-engine',
    revisions: {
      lifecycleGeneration: 1,
      sceneRevision,
      viewRevision: 0,
      interactionRevision: 0,
    },
    publishedTuple: { scene: publishedScene, view: 0, interaction: 0 },
    frameRevision,
    datasetRef: null,
    semanticHash: destroyed ? null : `scene-${sceneRevision}`,
    rootIds: destroyed ? [] : ['root'],
    historyDepth: 0,
    pendingWork: 0,
    zoomLimits: [0.5, 30],
    viewport: { centerWorld: [0, 0], scale: 1, screenBounds: [0, 0, 800, 600] },
    selectionIds: [],
    facilities: destroyed ? [] : ['renderer'],
    resources: {
      canvasCount: destroyed ? 0 : 1,
      canvas: { cssSize: [800, 600], backingSize: [800, 600] },
      renderer: destroyed ? null : {
        resolution: 1,
        antialias: true,
        background: '#00000000',
        backend: 'webgl',
      },
      rendering: {
        commandCount: destroyed ? 0 : textCount,
        visiblePrimitiveCount: destroyed ? 0 : textCount,
      },
      assets: null,
      subscriptions: { active: destroyed ? 0 : 6, duplicates: 0 },
    },
  };
}

function semanticProbe(textCount: number): JsonRecord {
  return {
    lifecycle: 'scene-ready',
    geometry: { finiteValueCount: textCount * 12 },
    paint: { intentCount: textCount, resolvedCount: textCount, unresolvedCount: 0 },
    interaction: { activeGestureCount: 0 },
    history: { depth: 0 },
  };
}

function cleanupRelease(role: string, generation: number): JsonRecord {
  return {
    role,
    generation,
    reason: 'case-finally',
    destroyReturned: true,
    before: snapshot(2, 2, 2, 1),
    after: snapshot(2, 2, 2, 0, 'destroyed'),
    journalSubscriptions: { registeredCount: 6, releasedCount: 6 },
    remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
  };
}

function inputEvidence(datasetRef: string): JsonRecord {
  return {
    datasetRef,
    beforeFingerprint: `${datasetRef}-sha256`,
    afterFingerprint: `${datasetRef}-sha256`,
    unchanged: true,
  };
}

function supplementalInputEvidence(datasetRef: string): JsonRecord {
  return {
    beforeFingerprint: `${datasetRef}-sha256`,
    afterFingerprint: `${datasetRef}-sha256`,
    unchanged: true,
  };
}

function resourceProbe(caseId: 'REN-006' | 'REN-011'): JsonRecord {
  const supplemental = caseId === 'REN-011'
    ? { factoryCallCount: 1, specimenCount: 7 }
    : { factoryCallCount: 0, specimenCount: 0 };
  return {
    revision: 'core-v2-text-runtime-probe/1',
    caseId,
    fontRuntime: {
      mode: 'semantic-profile-only',
      fontFaceCount: 0,
      atlasLeaseCount: 0,
      assetLeaseCount: 0,
      pendingLoadCount: 0,
    },
    transport: { networkRequestCount: 0, externalFontRequestCount: 0 },
    supplemental,
    journal: resourceJournal(caseId),
  };
}

function cleanupProductResources(caseId: 'REN-006' | 'REN-011'): JsonRecord {
  const journal = resourceJournal(caseId);
  const factoryCallCount = caseId === 'REN-011' ? 1 : 0;
  return {
    revision: 'core-v2-text-runtime-cleanup/1',
    caseId,
    runtimeCounts: {
      activeSessionCount: 0,
      fontFaceCount: 0,
      atlasLeaseCount: 0,
      assetLeaseCount: 0,
      pendingLoadCount: 0,
      pendingWorkCount: 0,
    },
    transport: { networkRequestCount: 0, externalFontRequestCount: 0 },
    supplemental: {
      factoryCallCount,
      specimenCount: caseId === 'REN-011' ? 7 : 0,
    },
    journal: [
      ...journal,
      {
        sequence: journal.length + 1,
        event: 'text-runtime-released',
        caseId,
        factoryCallCount,
        resourceProbeCount: 1,
      },
    ],
  };
}

function resourceJournal(caseId: 'REN-006' | 'REN-011'): JsonRecord[] {
  const journal: JsonRecord[] = [];
  if (caseId === 'REN-011') {
    journal.push({
      sequence: 1,
      event: 'supplemental-specimens-created',
      caseId,
      factoryCallCount: 1,
      specimenCount: 7,
    });
  }
  journal.push({
    sequence: journal.length + 1,
    event: 'text-runtime-observed',
    caseId,
    resourceProbeCount: 1,
  });
  return journal;
}

function elementTarget(id: string): TextTarget {
  return { kind: 'element', id };
}

function componentTarget(ownerId: string, id: string): TextTarget {
  return { kind: 'component', ownerId, id };
}

function targetKey(target: JsonRecord): string {
  return target.kind === 'element'
    ? String(target.id)
    : `${String(target.ownerId)}:${String(target.id)}`;
}

function terminalTextCount(productValue: JsonRecord): number {
  return arrayValue(productValue.textProbes, 'terminal probes').length;
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const results = arrayValue(execution.actionResults, 'action results');
  const result = requireRecord(results[index], `action ${index}`);
  return requireRecord(requireRecord(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

function terminalProbe(execution: JsonRecord, key: string): JsonRecord {
  const after = requireRecord(actionActual(execution, 3).after, 'terminal product');
  return probeFromProduct(after, key);
}

function supplementalEntry(execution: JsonRecord, id: string): JsonRecord {
  const supplemental = arrayValue(actionActual(execution, 1).supplemental, 'supplemental');
  const entry = supplemental.find((value) => isRecord(value) && value.id === id);
  return requireRecord(entry, `supplemental ${id}`);
}

function supplementalProbe(execution: JsonRecord, id: string): JsonRecord {
  const entry = supplementalEntry(execution, id);
  const product = requireRecord(entry.product, `${id} product`);
  const target = requireRecord(entry.target, `${id} target`);
  return probeFromProduct(product, targetKey(target));
}

function supplementalSurfaceGeometry(execution: JsonRecord, id: string): JsonRecord {
  const entry = supplementalEntry(execution, id);
  const product = requireRecord(entry.product, `${id} product`);
  const probe = supplementalProbe(execution, id);
  const geometry = requireRecord(product.geometryProbe, `${id} geometry probe`);
  const entities = arrayValue(geometry.entities, `${id} geometry entities`);
  const entity = entities.find((value) => (
    isRecord(value) && value.id === probe.entityId
  ));
  return requireRecord(entity, `${id} surface geometry`);
}

function mutateSupplementalLayout(
  execution: JsonRecord,
  id: string,
  input: Readonly<{
    lines: readonly string[];
    visibleLines: readonly string[];
    visibleText: string;
    layoutBounds: readonly [number, number, number, number];
    ownerLocalBounds: readonly [number, number, number, number];
  }>,
): void {
  const probe = supplementalProbe(execution, id);
  const projection = requireRecord(probe.projection, `${id} projection`);
  projection.lines = [...input.lines];
  projection.lineCount = input.lines.length;
  projection.visibleLines = [...input.visibleLines];
  projection.visibleText = input.visibleText;
  projection.layoutBounds = tupleBoundsRecord(input.layoutBounds);
  projection.ownerLocalBounds = tupleBoundsRecord(input.ownerLocalBounds);

  const geometry = requireRecord(probe.geometry, `${id} geometry`);
  geometry.localBounds = [...input.layoutBounds];
  geometry.ownerLocalBounds = [...input.ownerLocalBounds];
  supplementalSurfaceGeometry(execution, id).localBounds = [...input.layoutBounds];
}

function rebuildSupplementalProductFromExport(execution: JsonRecord, id: string): void {
  const entry = supplementalEntry(execution, id);
  const target = requireRecord(entry.target, `${id} target`) as TextTarget;
  const priorProduct = requireRecord(entry.product, `${id} prior product`);
  const exportedDataset = structuredClone(
    arrayValue(priorProduct.exportedDataset, `${id} exported dataset`),
  ) as JsonRecord[];
  const parsed = parsePatchMapV010(exportedDataset);
  if (target.kind !== 'component') {
    throw new Error(`Expected rebuilt ${id} target to be a component`);
  }
  const entityId = `${target.ownerId}::text:${target.id}`;
  const projection = parsed.projection.textsByEntityId?.[entityId];
  const entityProjection = parsed.projection.byEntityId[entityId];
  if (!projection || !entityProjection) throw new Error(`Missing rebuilt ${id} projection`);
  const snapshotValue = requireRecord(priorProduct.snapshot, `${id} snapshot`);
  const revisions = requireRecord(snapshotValue.revisions, `${id} revisions`);
  const sceneRevision = numberValue(revisions.sceneRevision, `${id} scene revision`);
  const frameRevision = numberValue(snapshotValue.frameRevision, `${id} frame revision`);
  const rebuiltProbe = probe({
    target,
    source: projection.source,
    sceneRevision,
    frameRevision,
    status: 'current',
    projection,
    affine: entityProjection.affine,
    localBounds: entityProjection.localBounds,
    worldBasis: entityProjection.worldBasis,
    visibleCenter: entityProjection.visibleCenter,
    rotationDegrees: entityProjection.rotationDegrees,
  });
  entry.product = product(
    [rebuiltProbe],
    sceneRevision,
    frameRevision,
    'REN-011',
    exportedDataset,
  );
}

function tupleBoundsRecord(
  value: readonly [number, number, number, number],
): JsonRecord {
  return { x: value[0], y: value[1], width: value[2], height: value[3] };
}

function exportedOwner(execution: JsonRecord, id: string): JsonRecord {
  const product = requireRecord(supplementalEntry(execution, id).product, `${id} product`);
  const dataset = arrayValue(product.exportedDataset, `${id} exported dataset`);
  return requireRecord(dataset[0], `${id} exported owner`);
}

function exportedTextComponent(execution: JsonRecord, id: string): JsonRecord {
  const components = arrayValue(exportedOwner(execution, id).components, `${id} components`);
  const component = components.find((value) => (
    isRecord(value) && value.type === 'text' && value.id === id
  ));
  return requireRecord(component, `${id} exported text`);
}

function probeFromProduct(productValue: JsonRecord, key: string): JsonRecord {
  const after = requireRecord(productValue, 'product');
  const probes = arrayValue(after.textProbes, 'terminal probes');
  const entry = probes.find((value) => isRecord(value) && value.key === key);
  return requireRecord(requireRecord(entry, `entry ${key}`).probe, `probe ${key}`);
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) current = requireRecord(current, segment)[segment];
  return current;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
