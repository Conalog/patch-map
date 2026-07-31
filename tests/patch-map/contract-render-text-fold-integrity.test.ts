import { describe, expect, it } from 'vitest';

import {
  approvedExpectedCase,
  arrayValue,
  compareObservation,
  fold,
  requireRecord,
  selectedCase,
  valueAt,
  type ContractAction,
  type JsonRecord,
  type MaterializedCase,
} from './support/contract-render-text-fold-harness';
import {
  actionActual,
  exportedOwner,
  exportedTextComponent,
  itemTextExecution,
  mutateSupplementalLayout,
  probeFromProduct,
  rebuildSupplementalProductFromExport,
  supplementalProbe,
  supplementalSurfaceGeometry,
} from './support/contract-render-text-fold-fixtures';

describe('PatchMap render-text fold evidence integrity', () => {
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

function terminalProbe(execution: JsonRecord, key: string): JsonRecord {
  const after = requireRecord(actionActual(execution, 3).after, 'terminal product');
  return probeFromProduct(after, key);
}
