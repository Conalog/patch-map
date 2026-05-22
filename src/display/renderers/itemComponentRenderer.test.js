import { describe, expect, it, vi } from 'vitest';
import { tryApplyItemComponentChanges } from './itemComponentRenderer';

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

const createItemWithComponents = () => {
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

describe('itemComponentRenderer', () => {
  it('updates cached unkeyed item components without rewriting the wrong parent props', () => {
    const { item, background, bar, text } = createItemWithComponents();

    const applied = tryApplyItemComponentChanges(
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

  it('deep merges nested component style patches like the regular component path', () => {
    const { item, text } = createItemWithComponents();
    text.props.style = {
      fill: 'black',
      dropShadow: { color: 'red', blur: 2 },
    };
    item.props.components[2].style = { ...text.props.style };

    const applied = tryApplyItemComponentChanges(
      item,
      [{ type: 'text', style: { dropShadow: { blur: 4 } } }],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(true);
    expect(text.props.style).toEqual({
      fill: 'black',
      dropShadow: { color: 'red', blur: 4 },
    });
    expect(item.props.components[2].style).toEqual(text.props.style);
  });

  it('falls back for duplicate unkeyed component changes to preserve duplicate semantics', () => {
    const { item, text } = createItemWithComponents();

    const applied = tryApplyItemComponentChanges(
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
    const { item } = createItemWithComponents();
    item.children = item.children.filter((child) => child.type !== 'icon');

    const applied = tryApplyItemComponentChanges(
      item,
      [{ type: 'icon', show: true, source: 'warning' }],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(false);
  });

  it('treats missing hidden components as already hidden', () => {
    const { item } = createItemWithComponents();
    item.children = item.children.filter((child) => child.type !== 'icon');

    const applied = tryApplyItemComponentChanges(
      item,
      [{ type: 'icon', show: false }],
      { validateSchema: false, mergeStrategy: 'merge' },
    );

    expect(applied).toBe(true);
  });
});
