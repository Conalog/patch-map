import { describe, expect, it } from 'vitest';

import {
  materializeElement,
  normalizeLiveItemTextComponents,
} from '../src/model/materialize';
import {
  layoutAnimatedBar,
  layoutComponent,
  measureText,
  resolveTextLines,
} from '../src/scene/layout';

const expectGeometry = (
  actual: {
    x: number;
    y: number;
    localWidth: number;
    localHeight: number;
  },
  expected: {
    x: number;
    y: number;
    localWidth: number;
    localHeight: number;
  },
): void => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
  expect(actual.localWidth).toBeCloseTo(expected.localWidth, 4);
  expect(actual.localHeight).toBeCloseTo(expected.localHeight, 4);
};

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

describe('text layout', () => {
  const item = {
    type: 'item',
    size: { width: 180, height: 120 },
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
  };

  it('keeps one line of height for empty standalone text', () => {
    const size = measureText('', { fontSize: 16 });

    expect(size.width).toBe(0);
    expect(size.height).toBeCloseTo(18.9538, 4);
  });

  it('preserves explicit newline geometry', () => {
    expect(resolveTextLines('alpha beta\ngamma delta')).toEqual([
      'alpha beta',
      'gamma delta',
    ]);
    const standalone = measureText(
      'alpha beta\ngamma delta',
      { fontSize: 14, wordWrap: true, wordWrapWidth: 90 },
    );
    expect(standalone.width).toBeCloseTo(94.7692, 4);
    expect(standalone.height).toBeCloseTo(33.1692, 4);

    expectGeometry(
      layoutComponent({
        type: 'text',
        text: 'line one\nline two',
        placement: 'bottom',
        split: 0,
        style: { fontSize: 12, wordWrap: true, wordWrapWidth: 80 },
      }, item),
      {
        x: 60.4615,
        y: 83.5692,
        localWidth: 59.0769,
        localHeight: 28.4308,
      },
    );
  });

  it('uses the normalized live 16px default for component geometry', () => {
    expectGeometry(
      layoutComponent({
        type: 'text',
        text: 'component default',
        placement: 'center',
        split: 0,
        style: { fontSize: 16 },
      }, item),
      {
        x: 6.3077,
        y: 50.5231,
        localWidth: 167.3846,
        localHeight: 18.9538,
      },
    );
  });

  it('measures split-2 top text as narrow observable lines', () => {
    expect(resolveTextLines('AUTO FONT WRAPS HERE', 2)).toEqual([
      'AU',
      'TO',
      ' F',
      'ON',
      'T ',
      'WR',
      'AP',
      'S ',
      'HE',
      'RE',
    ]);
    expectGeometry(
      layoutComponent({
        type: 'text',
        text: 'AUTO FONT WRAPS HERE',
        placement: 'top',
        split: 2,
        style: { fontSize: 20, wordWrap: true, wordWrapWidth: 72 },
      }, item),
      {
        x: 77.6923,
        y: 8,
        localWidth: 24.6154,
        localHeight: 236.9231,
      },
    );
  });

  it('measures split-1 right-bottom update geometry', () => {
    expectGeometry(
      layoutComponent({
        type: 'text',
        text: 'UPDATED AUTO FONT CONTENT',
        placement: 'right-bottom',
        split: 1,
        style: { fontSize: 20, wordWrap: true, wordWrapWidth: 64 },
      }, item),
      {
        x: 159.6923,
        y: -480.3077,
        localWidth: 12.3077,
        localHeight: 592.3077,
      },
    );
  });

  it('adds the 16px default only to cloned live item props', () => {
    const materialized = materializeElement({
      type: 'item',
      id: 'txt-item',
      size: { width: 180, height: 120 },
      components: [
        { type: 'text', id: 'default', text: 'component default' },
        {
          type: 'text',
          id: 'explicit',
          text: 'explicit',
          style: { fontSize: 20, autoFont: {} },
        },
      ],
    });
    if (materialized.type !== 'item') throw new Error('Expected item');

    const live = normalizeLiveItemTextComponents(materialized);
    const materializedDefault = materialized.components[0];
    const liveDefault = live.components[0];
    const liveExplicit = live.components[1];
    if (
      materializedDefault?.type !== 'text' ||
      liveDefault?.type !== 'text' ||
      liveExplicit?.type !== 'text'
    ) {
      throw new Error('Expected text components');
    }

    expect(materializedDefault.style).not.toHaveProperty('fontSize');
    expect(live).not.toBe(materialized);
    expect(liveDefault.style).toMatchObject({
      fontSize: 16,
      autoFont: { min: 1, max: 100 },
      overflow: 'visible',
    });
    expect(liveExplicit.style.fontSize).toBe(20);
  });
});
