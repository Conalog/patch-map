import { describe, expect, it } from 'vitest';

import { layoutAnimatedBar } from '../src/scene/layout';

describe('bar animation layout', () => {
  it('interpolates from the observable 1px seed to final placed geometry', () => {
    const component = {
      type: 'bar',
      source: { type: 'rect', fill: '#fff' },
      size: {
        width: { value: 50, unit: '%' },
        height: { value: 20, unit: '%' },
      },
      placement: 'bottom',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      animation: true,
    };
    const item = {
      type: 'item',
      size: { width: 100, height: 50 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    };

    expect(layoutAnimatedBar(component, item, 0)).toMatchObject({
      x: 49.5,
      y: 49,
      localWidth: 1,
      localHeight: 1,
    });
    expect(layoutAnimatedBar(component, item, 0.5)).toMatchObject({
      x: 37.25,
      y: 44.5,
      localWidth: 25.5,
      localHeight: 5.5,
    });
    expect(layoutAnimatedBar(component, item, 1)).toMatchObject({
      x: 25,
      y: 40,
      localWidth: 50,
      localHeight: 10,
    });
  });
});
