import { describe, expect, it, vi } from 'vitest';
import { Transformer } from '../../patch-map';
import { setupPatchmapTests } from './patchmap.setup';

const PANEL_ITEM_PATH = '$..children[?(@.display=="panelGroup")].children';
const INVERTER_PATH = '$..children[?(@.display=="inverter")]';
const RELATIONS_PATH = '$..children[?(@.type==="relations")]';

const panelComponents = [
  {
    type: 'background',
    source: { type: 'rect', fill: '#f8fafc', radius: 4 },
    size: '100%',
  },
  {
    type: 'bar',
    show: false,
    source: { type: 'rect', fill: 'white', radius: 3 },
    size: '100%',
    tint: 'primary.default',
    animation: false,
  },
  { type: 'icon', show: false, source: 'warning', size: 20 },
  { type: 'text', show: false, text: '' },
];

const plantMapData = [
  {
    type: 'group',
    id: 'strings',
    children: [
      {
        type: 'grid',
        id: 'string-1',
        attrs: { display: 'panelGroup', x: 100, y: 100 },
        cells: [
          [1, 1, 1],
          [1, 0, 1],
        ],
        gap: 4,
        item: {
          size: { width: 36, height: 72 },
          components: panelComponents,
        },
      },
      {
        type: 'grid',
        id: 'string-2',
        attrs: { display: 'panelGroup', x: 260, y: 100 },
        cells: [[1, 1]],
        gap: 4,
        item: {
          size: { width: 36, height: 72 },
          components: panelComponents,
        },
      },
      {
        type: 'item',
        id: 'inverter-1',
        attrs: { display: 'inverter', x: 180, y: 240 },
        size: { width: 80, height: 48 },
        components: [
          {
            type: 'bar',
            show: true,
            source: { type: 'rect', fill: 'white', radius: 4 },
            size: '100%',
            tint: 'gray.dark',
            animation: false,
          },
          { type: 'icon', show: false, source: 'loading', size: 20 },
          { type: 'text', show: true, text: 'INV' },
        ],
      },
    ],
  },
  {
    type: 'relations',
    id: 'plant-relations',
    links: [
      { source: 'string-1.0.0', target: 'string-1.0.1' },
      { source: 'string-1.0.1', target: 'string-1.0.2' },
      { source: 'string-1.0.2', target: 'inverter-1' },
    ],
  },
];

const waitForScene = (ms = 80) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const emitPointer = (viewport, type, position, extras = {}) => {
  viewport.emit(type, {
    global: viewport.toGlobal(position),
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    data: { pointerId: 1, pointerType: 'mouse' },
    stopPropagation: () => {},
    preventDefault: () => {},
    ...extras,
  });
};

const getComponent = (item, type) =>
  item.children.find((child) => child.type === type);

describe('patch-service plant map contract', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('keeps patch-service selector paths stable after draw', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    const panelItems = patchmap.selector(PANEL_ITEM_PATH);
    const inverterItems = patchmap.selector(INVERTER_PATH);
    const relations = patchmap.selector(RELATIONS_PATH);

    expect(panelItems.map((item) => item.id)).toEqual([
      'string-1.0.0',
      'string-1.0.1',
      'string-1.0.2',
      'string-1.1.0',
      'string-1.1.2',
      'string-2.0.0',
      'string-2.0.1',
    ]);
    expect(inverterItems.map((item) => item.id)).toEqual(['inverter-1']);
    expect(relations).toHaveLength(1);
    expect(relations[0].id).toBe('plant-relations');
  });

  it('keeps display/type indexes compatible with selector paths after updates', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    patchmap.update({
      path: '$..[?(@.id=="string-2")]',
      changes: { attrs: { display: 'panelGroupInactive' } },
      validateSchema: false,
      emit: false,
    });

    expect(patchmap.selector(PANEL_ITEM_PATH).map((item) => item.id)).toEqual([
      'string-1.0.0',
      'string-1.0.1',
      'string-1.0.2',
      'string-1.1.0',
      'string-1.1.2',
    ]);
    expect(
      patchmap
        .selector('$..children[?(@.display=="panelGroupInactive")]')
        .map((item) => item.id),
    ).toEqual(['string-2']);
    expect(patchmap.selector(RELATIONS_PATH)[0].id).toBe('plant-relations');
  });

  it('supports patch-service item-by-item animated panel bar updates', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    const panelItems = patchmap.selector(PANEL_ITEM_PATH);
    for (const [index, item] of panelItems.entries()) {
      const percent = 8 + index * 11;
      patchmap.update({
        elements: item,
        changes: {
          components: [
            {
              type: 'bar',
              show: true,
              size: { height: `${percent}%` },
              tint: percent > 50 ? '#0C73BF' : '#1099FF',
              animation: true,
            },
            { type: 'icon', show: false },
            { type: 'text', show: false },
          ],
        },
        validateSchema: false,
        emit: false,
      });
    }
    await waitForScene(260);

    const worldChildren = patchmap.world.children;
    const groupIndex = worldChildren.findIndex(
      (child) => child.id === 'strings',
    );
    const barLayerIndex = worldChildren.findIndex(
      (child) => child.label === 'patchmap-panel-bar-layer',
    );
    const relationsIndex = worldChildren.findIndex(
      (child) => child.id === 'plant-relations',
    );

    expect(groupIndex).toBeGreaterThanOrEqual(0);
    expect(barLayerIndex).toBeGreaterThan(groupIndex);
    expect(barLayerIndex).toBeLessThan(relationsIndex);

    for (const [index, item] of panelItems.entries()) {
      const percent = 8 + index * 11;
      const bar = getComponent(item, 'bar');
      const icon = getComponent(item, 'icon');
      const text = getComponent(item, 'text');

      expect(bar.visible).toBe(true);
      expect(bar.props.size.height).toMatchObject({
        value: percent,
        unit: '%',
      });
      expect(bar.props.animation).toBe(true);
      expect(icon?.renderable ?? false).toBe(false);
      expect(text?.renderable ?? false).toBe(false);
    }
  });

  it('supports report-style panel background and relations path updates', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    const panelItems = patchmap.selector(PANEL_ITEM_PATH);
    for (const item of panelItems) {
      patchmap.update({
        elements: item,
        changes: {
          components: [
            {
              type: 'background',
              size: '100%',
              source: {
                type: 'rect',
                fill: '#22c55e',
                borderWidth: 2,
              },
            },
          ],
        },
        validateSchema: false,
        emit: false,
      });
    }

    patchmap.update({
      path: RELATIONS_PATH,
      changes: { show: false },
      validateSchema: false,
      emit: false,
    });
    await waitForScene();

    expect(
      panelItems.every(
        (item) =>
          getComponent(item, 'background')?.props.source.fill === '#22c55e',
      ),
    ).toBe(true);
    expect(patchmap.selector(RELATIONS_PATH)[0].renderable).toBe(false);
  });

  it('keeps transformer selection callbacks compatible with panel items', async () => {
    const patchmap = getPatchmap();
    patchmap.transformer = new Transformer();
    patchmap.draw(plantMapData);
    await waitForScene();

    const onClick = vi.fn((target) => {
      patchmap.transformer.elements = target ? [target] : [];
    });
    patchmap.stateManager.setState('selection', {
      enabled: true,
      draggable: true,
      selectUnit: 'entity',
      filter: (target) => target.type === 'item',
      onClick,
    });

    emitPointer(patchmap.viewport, 'pointerdown', { x: 118, y: 136 });
    emitPointer(patchmap.viewport, 'pointerup', { x: 118, y: 136 });
    patchmap.viewport.emit('click', {
      global: patchmap.viewport.toGlobal({ x: 118, y: 136 }),
      detail: 1,
      stopPropagation: () => {},
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]?.id).toBe('string-1.0.0');
    expect(patchmap.transformer.elements.map((item) => item.id)).toEqual([
      'string-1.0.0',
    ]);
  });
});
