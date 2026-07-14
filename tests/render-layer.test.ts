import {
  Cache,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';

import { materializeMapData } from '../src/model/materialize';
import { buildManagedScene } from '../src/scene/build-scene';
import { AggregateRenderLayer } from '../src/scene/render-layer';
import { materializeTheme } from '../src/theme';

const TEXTURE_KEY = 'patch-map-render-layer-test-texture';

const closeMatrix = (actual: Matrix, expected: Matrix): void => {
  expect(actual.a).toBeCloseTo(expected.a);
  expect(actual.b).toBeCloseTo(expected.b);
  expect(actual.c).toBeCloseTo(expected.c);
  expect(actual.d).toBeCloseTo(expected.d);
  expect(actual.tx).toBeCloseTo(expected.tx);
  expect(actual.ty).toBeCloseTo(expected.ty);
};

describe('AggregateRenderLayer', () => {
  const layers: AggregateRenderLayer[] = [];
  const worlds: Container[] = [];

  const layer = (): AggregateRenderLayer => {
    const value = new AggregateRenderLayer(() => materializeTheme());
    layers.push(value);
    return value;
  };

  afterEach(() => {
    if (Cache.has(TEXTURE_KEY)) Cache.remove(TEXTURE_KEY);
    for (const world of worlds.splice(0)) {
      if (!world.destroyed) world.destroy({ children: true });
    }
    for (const value of layers.splice(0)) {
      if (!value.destroyed) value.destroy({ children: true });
    }
  });

  it('preserves visual stacking while pooling vector, text, and sprite leaves', () => {
    Cache.set(TEXTURE_KEY, Texture.WHITE);
    const renderLayer = layer();
    const map = [
      { type: 'rect', id: 'first', size: 10, fill: 'primary.default' },
      { type: 'text', id: 'copy', text: 'PATCH', style: { fontSize: 12 } },
      { type: 'image', id: 'image', source: TEXTURE_KEY, size: 14 },
      { type: 'rect', id: 'last', size: 8, fill: 'gray.dark' },
    ];

    renderLayer.renderMap(map);
    expect(renderLayer.children).toHaveLength(4);
    expect(renderLayer.children[0]).toBeInstanceOf(Graphics);
    expect(renderLayer.children[1]).toBeInstanceOf(Text);
    expect(renderLayer.children[2]).toBeInstanceOf(Sprite);
    expect(renderLayer.children[3]).toBeInstanceOf(Graphics);
    const firstPass = [...renderLayer.children];

    renderLayer.renderMap(map);
    expect(renderLayer.children).toEqual(firstPass);
    expect((renderLayer.children[1] as Text).text).toBe('PATCH');
    expect((renderLayer.children[2] as Sprite).texture).toBe(Texture.WHITE);
  });

  it('copies nested live rotation, scale, and origin into pooled text transforms', () => {
    const scene = buildManagedScene(materializeMapData([
      {
        type: 'group',
        id: 'group',
        attrs: { x: 30, y: 40, angle: 25 },
        children: [
          {
            type: 'text',
            id: 'copy',
            text: 'nested',
            attrs: { x: 9, y: 7, rotation: 0.2 },
          },
        ],
      },
    ]), materializeTheme());
    const world = new Container();
    worlds.push(world);
    world.addChild(...scene.roots);
    const group = scene.byId.get('group');
    const copy = scene.byId.get('copy');
    if (!group || !copy) throw new Error('Expected managed nodes');
    group.scale.set(1.5, 0.75);
    group.origin.set(4, 3);
    copy.scale.set(-0.5, 2);
    copy.origin.set(2, 1);

    const expected = new Matrix().appendFrom(group.localTransform, copy.localTransform);
    const renderLayer = layer();
    renderLayer.renderScene(scene.roots);

    expect(renderLayer.children).toHaveLength(1);
    const rendered = renderLayer.children[0]!;
    expect(rendered).toBeInstanceOf(Text);
    closeMatrix(rendered.localTransform, expected);
  });

  it('uses a geometry placeholder only until a public Assets cache texture exists', () => {
    const renderLayer = layer();
    const image = [
      { type: 'image', id: 'image', source: TEXTURE_KEY, size: { width: 20, height: 10 } },
    ];

    renderLayer.renderMap(image);
    expect(renderLayer.children).toHaveLength(1);
    expect(renderLayer.children[0]).toBeInstanceOf(Graphics);
    expect(renderLayer.children[0]?.getLocalBounds().width).toBeCloseTo(20);

    Cache.set(TEXTURE_KEY, Texture.WHITE);
    renderLayer.renderMap(image);
    expect(renderLayer.children).toHaveLength(1);
    const sprite = renderLayer.children[0]!;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.width).toBeCloseTo(20);
    expect(sprite.height).toBeCloseTo(10);
  });

  it('draws only unambiguous id-to-id relation links', () => {
    const renderLayer = layer();
    renderLayer.renderMap([
      {
        type: 'item',
        id: 'left',
        size: 10,
        components: [],
        attrs: { x: 0, y: 0 },
      },
      {
        type: 'item',
        id: 'right',
        size: 10,
        components: [],
        attrs: { x: 100, y: 0 },
      },
      {
        type: 'relations',
        id: 'links',
        links: [
          ['left', 'right'],
          { source: { id: 'left' }, target: { id: 'right' } },
          { path: 'unsupported-shape' },
        ],
        style: { color: 'primary.default', width: 2 },
      },
    ]);

    expect(renderLayer.children).toHaveLength(1);
    const relations = renderLayer.children[0]!;
    expect(relations).toBeInstanceOf(Graphics);
    expect(relations.getLocalBounds().width).toBeGreaterThanOrEqual(100);
  });

  it('detaches hidden visuals without destroying their pooled leaf', () => {
    const renderLayer = layer();
    const copy = { type: 'text', id: 'copy', text: 'pooled' };
    renderLayer.renderMap([copy]);
    const first = renderLayer.children[0];
    expect(first).toBeInstanceOf(Text);

    renderLayer.renderMap([{ ...copy, show: false }]);
    expect(renderLayer.children).toHaveLength(0);
    expect(first?.destroyed).toBe(false);

    renderLayer.renderMap([copy]);
    expect(renderLayer.children[0]).toBe(first);
  });

  it('omits hidden bars while rendering trusted-update bars', () => {
    const scene = buildManagedScene(materializeMapData([{
      type: 'item',
      id: 'bar-owner',
      size: 40,
      components: [
        {
          type: 'bar',
          id: 'hidden-bar',
          show: false,
          source: { type: 'rect', fill: '#fff' },
          size: 20,
          animation: false,
        },
        {
          type: 'bar',
          id: 'trusted-bar',
          source: { type: 'rect', fill: '#fff' },
          size: 20,
          animation: false,
        },
      ],
    }]), materializeTheme());
    const world = new Container();
    worlds.push(world);
    world.addChild(...scene.roots);
    const renderLayer = layer();

    expect(scene.byId.has('hidden-bar')).toBe(false);
    const bar = scene.byId.get('trusted-bar');
    if (!bar) throw new Error('Expected trusted-update bar');
    bar.renderable = false;
    renderLayer.renderScene(scene.roots);
    expect(renderLayer.children).toHaveLength(1);
  });

  it('preserves animated-bar managed scale, rotation, and origin transforms', () => {
    Cache.set(TEXTURE_KEY, Texture.WHITE);
    const scene = buildManagedScene(materializeMapData([{
      type: 'item',
      id: 'animated-owner',
      size: { width: 100, height: 50 },
      attrs: { x: 20, y: 30, angle: 15 },
      components: [{
        type: 'bar',
        id: 'animated-bar',
        source: TEXTURE_KEY,
        size: { width: '50%', height: '20%' },
        animationDuration: 1_000,
      }],
    }]), materializeTheme());
    const world = new Container();
    worlds.push(world);
    world.addChild(...scene.roots);
    const owner = scene.byId.get('animated-owner');
    const bar = scene.byId.get('animated-bar');
    if (!owner || !bar) throw new Error('Expected animated managed nodes');
    bar.scale.set(-2, 3);
    bar.angle = 35;
    bar.origin.set(4, 5);
    owner.updateLocalTransform();
    bar.updateLocalTransform();
    const expected = new Matrix().appendFrom(
      owner.localTransform,
      bar.localTransform,
    );
    const renderLayer = layer();

    renderLayer.renderScene(scene.roots);

    expect(renderLayer.children).toHaveLength(1);
    expect(renderLayer.children[0]).toBeInstanceOf(Sprite);
    const rendered = renderLayer.children[0] as Sprite;
    rendered.updateLocalTransform();
    const expectedRendered = expected.clone();
    expectedRendered.a /= Texture.WHITE.width;
    expectedRendered.b /= Texture.WHITE.width;
    expectedRendered.c /= Texture.WHITE.height;
    expectedRendered.d /= Texture.WHITE.height;
    closeMatrix(rendered.localTransform, expectedRendered);
  });
});
