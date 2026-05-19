import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushQueuedPanelComponentUpdates, update } from './update';

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
  afterEach(() => {
    flushQueuedPanelComponentUpdates();
  });

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

  it('coalesces trusted silent panel component updates until flush', () => {
    const { item, bar } = createItem();

    const first = update(null, {
      elements: item,
      changes: { components: [{ type: 'bar', size: { height: '30%' } }] },
      validateSchema: false,
      emit: false,
    });
    update(null, {
      elements: item,
      changes: {
        components: [{ type: 'bar', size: { height: '70%' }, tint: 0xff0000 }],
      },
      validateSchema: false,
      emit: false,
    });

    expect(first).toEqual([item]);
    expect(bar.props.size.height).toBe('20%');
    expect(bar._applyAnimationSize).not.toHaveBeenCalled();

    flushQueuedPanelComponentUpdates();

    expect(item.apply).not.toHaveBeenCalled();
    expect(bar.props.size.height).toEqual({ value: 70, unit: '%' });
    expect(bar.tint).toBe(0xff0000);
    expect(bar._applyAnimationSize).toHaveBeenCalledOnce();
  });

  it('flushes queued panel component updates before synchronous updates', () => {
    const { item, bar } = createItem();

    update(null, {
      elements: item,
      changes: { components: [{ type: 'bar', size: { height: '60%' } }] },
      validateSchema: false,
      emit: false,
    });

    update(null, {
      elements: item,
      changes: { components: [{ type: 'bar', tint: 0x00ff00 }] },
      validateSchema: false,
    });

    expect(bar.props.size.height).toEqual({ value: 60, unit: '%' });
    expect(bar.tint).toBe(0x00ff00);
    expect(bar._applyAnimationSize).toHaveBeenCalledOnce();
  });

  it('uses the direct panel component path for trusted silent array updates', () => {
    const first = createItem();
    const second = createItem();

    const result = update(null, {
      elements: [first.item, second.item],
      changes: {
        components: [{ type: 'bar', size: { height: '80%' }, tint: 0xff0000 }],
      },
      validateSchema: false,
      emit: false,
    });

    expect(result).toEqual([first.item, second.item]);
    expect(first.item.apply).not.toHaveBeenCalled();
    expect(second.item.apply).not.toHaveBeenCalled();
    expect(first.bar.props.size.height).toEqual({ value: 80, unit: '%' });
    expect(second.bar.props.size.height).toEqual({ value: 80, unit: '%' });
    expect(first.bar.tint).toBe(0xff0000);
    expect(second.bar.tint).toBe(0xff0000);
  });

  it('keeps mixed array updates on the synchronous fallback path', () => {
    const { item, bar } = createItem();
    const nonPanel = { type: 'group', apply: vi.fn() };

    const result = update(null, {
      elements: [item, nonPanel],
      changes: { components: [{ type: 'bar', size: { height: '80%' } }] },
      validateSchema: false,
      emit: false,
    });

    expect(result).toEqual([item, nonPanel]);
    expect(item.apply).toHaveBeenCalledOnce();
    expect(nonPanel.apply).toHaveBeenCalledOnce();
    expect(bar.props.size.height).toBe('20%');
  });
});
