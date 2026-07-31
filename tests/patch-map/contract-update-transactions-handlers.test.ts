import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import {
  UPDATE_TRANSACTIONS_ACTION_TYPES,
  UPDATE_TRANSACTIONS_CASE_IDS,
  compareObservation,
  createProductAdapter,
  createUpdateTransactionHandlerEntries,
  executeCase,
  foldUpdateTransactionExecution,
  selectedCase,
  actualAt,
  captureValues,
  isRecord,
  requireArray,
  requireRecord,
  segment,
  segmentCountTo,
  type CaseExecution,
  type JsonRecord,
} from './support/update-transactions-contract-runner';

const REMAINING_CASE_IDS = Object.freeze([
  'ERR-001',
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'UPD-013',
  'UPD-014',
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
  'CSM-014',
]);

describe('PatchMap shared update transaction action handlers', () => {
  it('registers one browser-safe product handler family with no answer-data imports', async () => {
    const source = await readFile(fileURLToPath(new URL(
      '../../scripts/verification/core-v2-contract/handlers/update-transactions.mjs',
      import.meta.url,
    )), 'utf8');
    const adapter = createProductAdapter();
    const entries = createUpdateTransactionHandlerEntries(adapter);

    expect(UPDATE_TRANSACTIONS_CASE_IDS).toEqual([
      'ERR-001',
      'UPD-001',
      'UPD-002',
      'UPD-003',
      'UPD-004',
      'UPD-006',
      'UPD-007',
      'UPD-008',
      'UPD-009',
      'UPD-010',
      'UPD-011',
      'UPD-012',
      'UPD-013',
      'UPD-014',
      'CSM-005',
      'CSM-006',
      'CSM-007',
      'CSM-008',
      'CSM-014',
    ]);
    expect(entries.map(([id]) => id)).toEqual(
      UPDATE_TRANSACTIONS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    await assertCommittedVerifierEntryImportFirewall('handlers/update-transactions.mjs', 'handler');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toContain('catalog-normalized-expected');
    expect(source).not.toContain('/evidence/');
    expect(source).toContain("callSync(engine, 'transact'");
    expect(source).toContain("callSync(engine, 'bulkPatch'");
    expect(source).not.toContain('emptyBulkResult');
    expect(source).toContain("callSync(engine, 'resolveTarget'");
    expect(source).toContain("callSync(engine, 'relationProbe'");
  });


  it.each(REMAINING_CASE_IDS)(
    'executes %s against public PatchMap state without mutating action inputs',
    async (caseId) => {
      const plan = selectedCase(caseId);
      const before = JSON.stringify(plan);
      const execution = await executeCase(plan);

      expect(execution.status).toBe('completed');
      expect(execution.eventJournalFailures).toEqual([]);
      expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(execution.actionResults).toHaveLength(plan.actionTrace.length);
      expect(execution.actionResults.every(({ status }) => status === 'completed')).toBe(true);
      expect(JSON.stringify(plan)).toBe(before);
      for (const result of execution.actionResults) {
        const actual = result.delta.actual;
        if (isRecord(actual.input)) expect(actual.input).toMatchObject({ unchanged: true });
        expect(requireRecord(actual.product, `${caseId} action product`)).toHaveProperty('snapshot');
      }

      assertRemainingCaseFacts(caseId, execution);
    },
    20_000,
  );


  it.each(['ERR-001', 'CSM-005', 'CSM-006', 'CSM-007', 'CSM-008', 'CSM-014'] as const)(
    'folds real %s product execution and compares it independently',
    async (caseId) => {
      const plan = selectedCase(caseId);
      const execution = await executeCase(plan);
      const folded = foldUpdateTransactionExecution({
        casePlan: plan,
        execution,
        provenance: {
          codeCommit: 'test-commit',
          packedPackageSha256: 'test-package',
        },
        environment: { browserVersion: 'test-browser', renderer: 'webgl' },
      });
      const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === caseId);
      if (expectedCase === undefined) throw new Error(`Missing expected ${caseId}`);
      const comparison = compareObservation({
        expectedCase: expectedCase as unknown as Readonly<JsonRecord>,
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });

      expect(comparison.failed).toBe(0);
      expect(comparison.passed).toBe(expectedCase.expected.assertions.length);
      expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
    },
    20_000,
  );
});


function assertRemainingCaseFacts(caseId: string, execution: CaseExecution): void {
  switch (caseId) {
    case 'ERR-001': {
      const matrix = actualAt(execution, 1);
      const results = requireArray(matrix.results, 'ERR-001 results');
      expect(results).toHaveLength(5);
      expect(results.map((value) => requireRecord(
        requireRecord(value, 'ERR-001 result').diagnostic,
        'ERR-001 diagnostic',
      ).code)).toEqual([
        'INVALID_VALUE',
        'DUPLICATE_ID',
        'INVALID_VALUE',
        'MISSING_TARGET',
        'OVERLAPPING_PATH',
      ]);
      expect(results.every((value) =>
        requireRecord(value, 'ERR-001 result').atomic === true)).toBe(true);
      expect(matrix).toMatchObject({
        baselineInput: { unchanged: true },
        product: {
          snapshot: {
            revisions: { sceneRevision: 1 },
            selectionIds: [],
            historyDepth: 0,
          },
        },
      });
      break;
    }
    case 'UPD-001': {
      expect(actualAt(execution, 3).currentTarget).toMatchObject({
        ownerId: 'item-a',
        id: 'bar',
        lifecycleGeneration: 2,
      });
      expect(actualAt(execution, 4)).toMatchObject({
        diagnostic: { code: 'STALE_TARGET' },
        currentTarget: { id: 'bar' },
      });
      break;
    }
    case 'UPD-002': {
      expect(actualAt(execution, 1)).toMatchObject({
        record: { id: 'bar', size: { width: 60, height: 30 } },
        revisionDelta: 1,
      });
      expect(actualAt(execution, 2)).toMatchObject({
        revisionDelta: 0,
        events: { change: [] },
      });
      expect(captureValues(execution, 'before')).toMatchObject({
        'target/size/width': 60,
        'target/source': { type: 'rect' },
      });
      break;
    }
    case 'UPD-003': {
      expect(actualAt(execution, 0).record).toMatchObject({
        type: 'rect',
        id: 'rect-b',
        size: { width: 60, height: 20 },
      });
      expect(actualAt(execution, 1).record).toMatchObject({ type: 'text', id: 'rect-b' });
      expect(actualAt(execution, 2)).toMatchObject({
        diagnostic: { code: 'INVALID_RECORD_KIND' },
        publicationCount: 0,
      });
      break;
    }
    case 'UPD-004': {
      expect(actualAt(execution, 0).record).toMatchObject({ attrs: { x: 200, y: 100 } });
      expect(actualAt(execution, 1).record).toMatchObject({ attrs: { x: 210, y: 95, angle: 45 } });
      expect(actualAt(execution, 2)).toMatchObject({
        record: { size: { width: 80, height: 50 } },
        hit: { id: 'rect-b' },
      });
      const resize = actualAt(execution, 2);
      expect(resize.centerAfter).toEqual(resize.centerBefore);
      expect(resize.selectionOverlay).not.toBeNull();
      break;
    }
    case 'UPD-009': {
      expect(actualAt(execution, 1)).toMatchObject({
        selectionIds: ['rect-b'],
      });
      expect(actualAt(execution, 2)).toMatchObject({
        hierarchy: {
          parentId: 'group-b',
          worldPosition: [160, 40],
        },
        result: { history: { recorded: true, depthDelta: 1 } },
      });
      expect(actualAt(execution, 3)).toMatchObject({
        selectionIds: ['group-c'],
        result: { history: { recorded: true, depthDelta: 1 } },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        hierarchy: { parentId: 'group-b', worldPosition: [160, 40] },
        selectionIds: ['rect-b'],
        result: { history: { recorded: true, depthDelta: 1 } },
      });
      expect(actualAt(execution, 5)).toMatchObject({
        result: { history: { recorded: false, depthDelta: 0 } },
      });
      expect(actualAt(execution, 6)).toMatchObject({
        diagnostic: { code: 'CONFLICT' },
        revisionDelta: 0,
        result: { status: 'rejected' },
      });
      break;
    }
    case 'UPD-010': {
      expect(actualAt(execution, 1)).toMatchObject({
        relationState: { counts: { 'a>a': 1, 'a>b': 1, 'b>a': 1 } },
      });
      expect(segment(actualAt(execution, 1), 'a>b').endWorld).toEqual([150, 70]);
      expect(actualAt(execution, 2)).toMatchObject({
        relationState: { visibleSegments: ['a>a'] },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        relationState: { visibleSegments: ['a>a'] },
      });
      expect(segmentCountTo(actualAt(execution, 4), 'b')).toBe(0);
      break;
    }
    case 'UPD-011': {
      expect(actualAt(execution, 3)).toMatchObject({
        requestId: 'B',
        revision: 3,
        result: { status: 'superseded' },
        publicationEventDelta: 0,
        frameDelta: 0,
      });
      expect(actualAt(execution, 4)).toMatchObject({
        requestId: 'C',
        revision: 4,
        result: { status: 'committed' },
        published: { revisions: [4], requestIds: ['C'] },
      });
      expect(actualAt(execution, 5)).toMatchObject({
        result: { status: 'destroyed', returned: true },
      });
      expect(actualAt(execution, 6)).toMatchObject({
        requestId: 'A',
        revision: 2,
        result: { status: 'superseded' },
        published: { revisions: [4], requestIds: ['C'] },
        supersededEventCount: 0,
        postDestroy: { events: 0, frames: 0 },
        temporary: { allocated: 3, released: 3, unreleased: 0 },
      });
      break;
    }
    case 'UPD-012': {
      expect(actualAt(execution, 0)).toMatchObject({
        presentation: {
          status: 'active',
          highlightIds: ['item-a', 'rect-b'],
          deEmphasisAlpha: 0.2,
        },
      });
      const presentation = requireRecord(
        actualAt(execution, 1).presentation,
        'UPD-012 active presentation',
      );
      expect(presentation).toMatchObject({
        status: 'active',
        hiddenLayerIds: ['links'],
      });
      const entities = requireArray(presentation.entities, 'UPD-012 presentation entities');
      const entity = (id: string): JsonRecord => requireRecord(
        entities.find((value) => isRecord(value) && value.id === id),
        `UPD-012 presentation entity ${id}`,
      );
      expect(entity('item-a')).toMatchObject({ emphasis: 1, visible: true });
      expect(entity('rect-b')).toMatchObject({ emphasis: 1, visible: true });
      expect(entity('text-c')).toMatchObject({ emphasis: 0.2, visible: true });
      expect(entity('links')).toMatchObject({ visible: false, renderObjectCount: 0 });
      expect(actualAt(execution, 2)).toMatchObject({
        presentation: { status: 'normal' },
      });
      break;
    }
    case 'UPD-013': {
      expect(actualAt(execution, 0)).toMatchObject({
        result: { status: 'streamed', count: 12 },
        overlay: {
          latestAccepted: {
            sourceRevision: 13,
            payloadHash: 'overlay-319-13',
          },
          acceptedCount: 12,
          pendingPublicationCount: 1,
        },
      });
      expect(actualAt(execution, 0).acceptedEvents).toHaveLength(12);
      expect(actualAt(execution, 1)).toMatchObject({
        overlay: {
          latestPublished: {
            sourceRevision: 13,
            payloadHash: 'overlay-319-13',
          },
          publicationCount: 1,
          pendingPublicationCount: 0,
        },
        publicationEvents: [
          expect.objectContaining({ sourceRevision: 13, payloadHash: 'overlay-319-13' }),
        ],
      });
      break;
    }
    case 'UPD-014': {
      expect(actualAt(execution, 1)).toMatchObject({
        result: {
          changed: true,
          dependencyId: 'font-fixture',
          revision: 'font-fixture-2',
        },
        dependencies: { 'font-fixture': 'font-fixture-2' },
      });
      expect(actualAt(execution, 2)).toMatchObject({
        result: {
          status: 'committed',
          changed: true,
          recomputedTargets: ['item-a/label', 'links'],
          dataDiffCount: 0,
        },
      });
      const refresh = actualAt(execution, 2);
      const previous = requireRecord(
        requireRecord(refresh.result, 'refresh result').previousRevisions,
        'refresh previous revisions',
      );
      const revisions = requireRecord(
        requireRecord(refresh.result, 'refresh result').revisions,
        'refresh revisions',
      );
      expect(Number(revisions.sceneRevision) - Number(previous.sceneRevision)).toBe(1);
      expect(captureValues(execution, 'refresh')).toEqual({
        revision: revisions.sceneRevision,
      });
      break;
    }
    case 'CSM-005': {
      expect(actualAt(execution, 3)).toMatchObject({
        result: {
          status: 'committed',
          applied: [{ kind: 'element', id: 'rect-b' }],
        },
        record: { id: 'rect-b', attrs: { x: 180 } },
        product: { snapshot: { revisions: { sceneRevision: 4 } } },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        rollback: {
          strictAtomic: true,
          targetMissingCode: 'MISSING_TARGET',
          sceneUnchangedOnFailure: true,
        },
      });
      break;
    }
    case 'CSM-006': {
      expect(actualAt(execution, 2)).toMatchObject({
        result: { status: 'published', sceneRevision: 2 },
        facts: {
          rootIds: ['item-a', 'rect-b', 'text-c', 'links'],
          components: {
            bar: { record: { size: { width: 60, height: 45 } } },
            label: { record: { text: 'ACTIVE' } },
            icon: { record: { source: 'active', tint: '#00ff00' } },
          },
          selectedIds: [],
          mode: 'select',
          unresolvedIntentCount: 0,
        },
      });
      expect(actualAt(execution, 3)).toMatchObject({
        rollback: {
          keepLastOverlayRevision: 1,
          partialPublicationCount: 0,
          strictInvalidCode: 'INVALID_VALUE',
        },
      });
      break;
    }
    case 'CSM-007': {
      expect(actualAt(execution, 3)).toMatchObject({
        acceptedHostRevision: 12,
        supersededHostRevisions: [10, 11],
        pendingHostRevisions: [],
        facts: {
          components: {
            bar: { record: { size: { width: 60, height: 18 } } },
          },
        },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        product: {
          snapshot: { lifecycle: 'destroyed', pendingWork: 0 },
        },
        postDestroy: { events: 0, frames: 0, callbacks: 0 },
      });
      expect(actualAt(execution, 5)).toMatchObject({
        rollback: {
          priorCompleteSceneAvailable: true,
          latePublicationAfterDestroy: 0,
          staleSuccessCallbacks: 0,
        },
        postDestroy: { events: 0, frames: 0, callbacks: 0 },
      });
      break;
    }
    case 'CSM-008': {
      expect(actualAt(execution, 1)).toMatchObject({
        presentation: {
          status: 'active',
          highlightIds: ['item-a', 'rect-b'],
          hiddenLayerIds: ['links'],
        },
        persisted: { unchanged: true },
        unresolvedIntentCount: 0,
      });
      expect(actualAt(execution, 2)).toMatchObject({
        result: { status: 'exported', root: 'array', rootCount: 4 },
        export: { unchanged: true },
      });
      expect(actualAt(execution, 3)).toMatchObject({
        rollback: {
          removeOverlayOnFailure: true,
          persistedDataUnchanged: true,
        },
      });
      break;
    }
    case 'CSM-014': {
      expect(actualAt(execution, 0)).toMatchObject({
        column: 'chart',
        result: { status: 'committed' },
        facts: {
          components: {
            bar: {
              record: {
                show: true,
                tint: '#ff8800',
                size: { width: 60, height: 15 },
              },
            },
            label: {
              record: {
                show: true,
                tint: '#ff8800',
                text: '25%',
              },
            },
          },
        },
        appliedColumnTrace: ['chart'],
      });
      expect(actualAt(execution, 3)).toMatchObject({
        remountedColumn: 'percent',
        appliedColumnTrace: ['chart', 'percent', 'number'],
        activeCanvasCount: 1,
        facts: {
          components: {
            bar: {
              record: {
                show: true,
                tint: '#00aa66',
                size: { width: 60, height: 45 },
              },
            },
            label: {
              record: {
                show: true,
                tint: '#00aa66',
                text: '75%',
              },
            },
          },
          mode: 'select',
          unresolvedIntentCount: 0,
        },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        rollback: {
          invalidColumnRejected: true,
          priorColumnRetained: true,
          sceneUnchangedOnFailure: true,
        },
      });
      break;
    }
    default:
      throw new Error(`Unknown update case ${caseId}`);
  }
}
