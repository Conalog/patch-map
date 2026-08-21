import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

describe('Standalone Text Render', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('supports a width-only update when optional size was initially absent', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'text',
        id: 'natural-size-text',
        text: 'A standalone label',
      },
    ]);
    const text = patchmap.selector('$..[?(@.id=="natural-size-text")]')[0];

    patchmap.update({
      elements: text,
      changes: { size: { width: 120 } },
    });

    expect(text.props.size).toEqual({ width: 120 });
    expect(text.bitmapText.style.wordWrap).toBe(true);
    expect(text.bitmapText.style.wordWrapWidth).toBe(120);
  });
});
