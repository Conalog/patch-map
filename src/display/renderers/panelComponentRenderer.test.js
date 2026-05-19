import { describe, expect, it, vi } from 'vitest';
import { tryApplyPanelComponentChanges } from './panelComponentRenderer';

const createComponent = (type, props = {}) => ({
  type,
  props: { type, ...props },
  renderable: props.show ?? true,
  destroyed: false,
  store: { theme: {} },
  _applyAnimationSize: vi.fn(),
  _applyComponentSize: vi.fn(),
  _applyPlacement: vi.fn(),
  _applySource: vi.fn(),
  _applyText: vi.fn(),
  _applyTextstyle: vi.fn(),
  _applyTextLayout: vi.fn(),
});

const createPanelItem = () => {
  const background = createComponent('background', {
    source: { fill: 'white' },
    size: '100%',
  });
  const bar = createComponent('bar', {
    source: { fill: 'blue' },
    size: { width: '100%', height: '20%' },
    animation: false,
    animationDuration: 200,
    placement: 'bottom',
    tint: 0xffffff,
  });
  const text = createComponent('text', {
    text: 'A',
    show: true,
    style: { fill: 'black' },
  });
  const item = {
    type: 'item',
    children: [background, bar, text],
    props: {
      components: [
        { ...background.props },
        { ...bar.props },
        { ...text.props },
      ],
    },
  };
  for (const child of item.children) {
    child.parent = item;
  }
  return { item, background, bar, text };
};

describe('panelComponentRenderer', () => {
  it('updates cached unkeyed panel components without rewriting the wrong parent props', () => {
    const { item, background, bar, text } = createPanelItem();

    const applied = tryApplyPanelComponentChanges(
      item,
      [
        { type: 'bar', size: { height: '50%' }, tint: 0xff0000 },
        { type: 'text', show: false },
      ],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(true);
    expect(background.props.source.fill).toBe('white');
    expect(item.props.components[0].source.fill).toBe('white');
    expect(item.props.components[1].size.height).toEqual({
      value: 50,
      unit: '%',
    });
    expect(item.props.components[1].tint).toBe(0xff0000);
    expect(item.props.components[2].show).toBe(false);
    expect(bar.tint).toBe(0xff0000);
    expect(bar._applyAnimationSize).toHaveBeenCalledOnce();
    expect(text.renderable).toBe(false);
  });

  it('falls back for duplicate unkeyed component changes to preserve duplicate semantics', () => {
    const { item, text } = createPanelItem();

    const applied = tryApplyPanelComponentChanges(
      item,
      [
        { type: 'text', text: 'B' },
        { type: 'text', text: 'C' },
      ],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(false);
    expect(text.props.text).toBe('A');
  });

  it('falls back when a visible component would need to be created', () => {
    const { item } = createPanelItem();
    item.children = item.children.filter((child) => child.type !== 'icon');

    const applied = tryApplyPanelComponentChanges(
      item,
      [{ type: 'icon', show: true, source: 'warning' }],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(false);
  });

  it('treats missing hidden components as already hidden', () => {
    const { item } = createPanelItem();
    item.children = item.children.filter((child) => child.type !== 'icon');

    const applied = tryApplyPanelComponentChanges(
      item,
      [{ type: 'icon', show: false }],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(true);
  });
});
