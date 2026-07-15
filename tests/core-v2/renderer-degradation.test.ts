import { describe, expect, it } from 'vitest';

import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { withRendererDegradationDiagnostics } from '../../src/core-v2/renderers/degradation';

describe('Core v2 renderer fidelity diagnostics', () => {
  it('surfaces retained Mesh radius and omitted stroke semantics without mutating parse evidence', () => {
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
    expect(enriched.diagnostics.map((entry) => entry.code)).toEqual(
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
});
