import { describe, expect, it } from 'vitest';

import { composeOverlaySelectionPaths } from '../../src/patch-map/renderers/pixi-renderer/interaction-overlay';

describe('PatchMap aggregate selection bounds display', () => {
  const first = Object.freeze([0, 0, 10, 0, 10, 10, 0, 10]);
  const second = Object.freeze([30, 0, 40, 0, 40, 10, 30, 10]);
  const group = Object.freeze([0, 0, 40, 0, 40, 10, 0, 10]);

  it('keeps separated individual paths distinct from their group union', () => {
    const elementOnly = composeOverlaySelectionPaths([first, second], group, 'element-only');
    const groupOnly = composeOverlaySelectionPaths([first, second], group, 'group-only');
    const all = composeOverlaySelectionPaths([first, second], group, 'all');

    expect(elementOnly).toEqual([first, second]);
    expect(elementOnly.flat()).not.toContain(20);
    expect(groupOnly).toEqual([group]);
    expect(all).toEqual([first, second, group]);
  });

  it('does not rasterize the same single geometry twice in all mode', () => {
    expect(composeOverlaySelectionPaths([first], first, 'all')).toEqual([first]);
    expect(composeOverlaySelectionPaths([first], first, 'hidden')).toEqual([]);
  });
});
