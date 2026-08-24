import { describe, expect, it } from 'vitest';

import { parsePatchMapV010 } from '../../src/patch-map/parser';
import {
  inheritRendererDegradationDiagnostics,
  withRendererDegradationDiagnostics,
} from '../../src/patch-map/renderers/degradation';

describe('PatchMap renderer fidelity diagnostics', () => {
  it('does not report implemented standalone rect radius and stroke as degraded', () => {
    const parsed = parsePatchMapV010([{
      type: 'rect',
      id: 'rounded',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fill: '#ffffff',
      stroke: { color: '#000000', width: 2 },
      radius: 4,
    }]);
    const originalDiagnostics = parsed.diagnostics;
    const enriched = withRendererDegradationDiagnostics(parsed, 'mesh');

    expect(parsed.diagnostics).toBe(originalDiagnostics);
    expect(enriched.diagnostics.map((entry) => entry.code)).not.toEqual(
      expect.arrayContaining(['mesh-radius-degraded', 'mesh-stroke-unsupported']),
    );
    expect(enriched.document).toBe(parsed.document);
    expect(Object.isFrozen(enriched.diagnostics)).toBe(true);
  });

  it('keeps Particle/Graphics fidelity diagnostics unchanged', () => {
    const parsed = parsePatchMapV010([{
      type: 'rect',
      id: 'rounded',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fill: '#ffffff',
      radius: 4,
    }]);
    expect(withRendererDegradationDiagnostics(parsed, 'particle')).toBe(parsed);
  });

  it('keeps rounded bars free of retired Mesh degradation warnings across shells', () => {
    const parsed = parsePatchMapV010([{
      type: 'item',
      id: 'meter',
      size: { width: 20, height: 10 },
      components: [{
        type: 'bar',
        id: 'rounded-bar',
        size: { width: 20, height: 10 },
        source: { type: 'rect', fill: '#ffffff', radius: 4 },
      }],
    }]);
    const enriched = withRendererDegradationDiagnostics(parsed, 'mesh');
    const incrementalShell = Object.freeze({
      ...enriched,
      diagnostics: Object.freeze([...enriched.diagnostics]),
    });
    inheritRendererDegradationDiagnostics(enriched, incrementalShell);

    const reused = withRendererDegradationDiagnostics(incrementalShell, 'mesh');
    expect(reused.diagnostics.filter(
      ({ code }) => code === 'mesh-radius-degraded',
    )).toHaveLength(0);
    expect(reused.document).toBe(enriched.document);
  });
});
