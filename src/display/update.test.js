import { describe, expect, it, vi } from 'vitest';
import { update } from './update';

const createBar = () => ({
  type: 'bar',
  props: {
    type: 'bar',
    source: { fill: 'blue' },
    size: { width: '100%', height: '20%' },
    animation: false,
    animationDuration: 200,
    placement: 'bottom',
  },
  renderable: true,
  destroyed: false,
  store: { theme: {} },
  _applyAnimationSize: vi.fn(),
});

const createItem = () => {
  const bar = createBar();
  const item = {
    type: 'item',
    children: [bar],
    props: { components: [{ ...bar.props }] },
    apply: vi.fn(),
  };
  bar.parent = item;
  return { item, bar };
};

describe('display update', () => {
  it('uses the direct panel component path for trusted single element updates', () => {
    const { item, bar } = createItem();

    const result = update(null, {
      elements: item,
      changes: { components: [{ type: 'bar', size: { height: '50%' } }] },
      validateSchema: false,
    });

    expect(result).toEqual([item]);
    expect(item.apply).not.toHaveBeenCalled();
    expect(bar.props.size.height).toEqual({ value: 50, unit: '%' });
    expect(bar._applyAnimationSize).toHaveBeenCalledOnce();
  });

  it('falls back to regular apply when the direct panel path cannot handle the update', () => {
    const { item } = createItem();

    const result = update(null, {
      elements: item,
      changes: { components: [{ type: 'icon', show: true }] },
      validateSchema: false,
    });

    expect(result).toEqual([item]);
    expect(item.apply).toHaveBeenCalledOnce();
  });
});
