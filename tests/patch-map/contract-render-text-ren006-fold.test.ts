import { describe, expect, it } from 'vitest';

import {
  DOMAIN_NAMES,
  fold,
  requireRecord,
  selectedCase,
} from './support/contract-render-text-fold-harness';
import { standaloneExecution } from './support/contract-render-text-fold-fixtures';

describe('PatchMap REN-006 actual-only fold', () => {
  it('folds REN-006 into immutable actual domains with capture and final-only publication proof', () => {
    const plan = selectedCase('REN-006');
    const folded = fold(plan, standaloneExecution());

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    expect(folded.actual).toMatchObject({
      $schema: 'patch-map-semantic-observation/1',
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
});

