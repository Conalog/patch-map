import { describe, expect, it } from 'vitest';

import {
  arrayValue,
  fold,
  requireRecord,
  selectedCase,
} from './support/contract-render-text-fold-harness';
import { itemTextExecution } from './support/contract-render-text-fold-fixtures';

describe('PatchMap REN-011 actual-only fold', () => {
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
});

