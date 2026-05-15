import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

const GRID_CHILDREN_PATH = '$..children[?(@.type=="grid")].children';
const GRID_PATH = '$..children[?(@.type=="grid")]';
const ITEM_PATH = '$..[?(@.type=="item")]';
const RELATIONS_PATH = '$..[?(@.type=="relations")]';

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
            type: 'background',
            source: { type: 'rect', fill: 'white', radius: 4 },
            size: '100%',
            tint: 'gray.light',
          },
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

const redrawData = [
  {
    type: 'item',
    id: 'redraw-only-item',
    attrs: { display: 'redrawOnly', x: 40, y: 40 },
    size: { width: 48, height: 48 },
    components: [
      {
        type: 'background',
        source: { type: 'rect', fill: '#fff' },
        size: '100%',
      },
    ],
  },
];

const duplicateComponentData = [
  {
    type: 'item',
    id: 'component-host',
    size: { width: 100, height: 60 },
    components: [
      { type: 'text', id: 'duplicate-component', text: 'A' },
      { type: 'text', id: 'duplicate-component', text: 'B' },
    ],
  },
];

const waitForScene = (ms = 80) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getHitTarget = (patchmap, point) => {
  const rootBoundary = patchmap.app.renderer.events.rootBoundary;
  rootBoundary.rootTarget = patchmap.app.renderer.lastObjectRendered;
  return rootBoundary.hitTest(point.x, point.y);
};

describe('scene index browser contract', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('indexes browser-rendered scene objects without changing selector order', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    expect(patchmap.world.store.sceneIndex).toBeDefined();
    expect(patchmap.world.store.sceneIndex.getById('string-1.0.0')).toBe(
      patchmap.selector('$..[?(@.id=="string-1.0.0")]')[0],
    );

    expect(patchmap.selector(GRID_PATH).map((item) => item.id)).toEqual([
      'string-1',
      'string-2',
    ]);
    expect(
      patchmap.selector(GRID_CHILDREN_PATH).map((item) => item.id),
    ).toEqual([
      'string-1.0.0',
      'string-1.0.1',
      'string-1.0.2',
      'string-1.1.0',
      'string-1.1.2',
      'string-2.0.0',
      'string-2.0.1',
    ]);
    expect(patchmap.selector(ITEM_PATH)).toContain(
      patchmap.selector('$..[?(@.id=="inverter-1")]')[0],
    );
    expect(patchmap.selector(RELATIONS_PATH).map((item) => item.id)).toEqual([
      'plant-relations',
    ]);
  });

  it('keeps id selector semantics when duplicate component ids exist', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(duplicateComponentData);
    await waitForScene();

    const matches = patchmap.selector('$..[?(@.id=="duplicate-component")]');

    expect(matches).toHaveLength(2);
    expect(matches.map((item) => item.props.text)).toEqual(['A', 'B']);
    expect(
      patchmap.world.store.sceneIndex
        .getAllById('duplicate-component')
        .map((item) => item.props.text),
    ).toEqual(['A', 'B']);
  });

  it('keeps the id index fresh after update and preserves rendered hit targets', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    patchmap.update({
      path: '$..[?(@.id=="string-2")]',
      changes: { id: 'string-2-renamed' },
      validateSchema: false,
      emit: false,
    });
    await waitForScene();

    expect(patchmap.selector('$..[?(@.id=="string-2")]')).toEqual([]);
    expect(
      patchmap
        .selector('$..[?(@.id=="string-2-renamed")]')
        .map((item) => item.id),
    ).toEqual(['string-2-renamed']);
    expect(patchmap.selector(GRID_PATH).map((item) => item.id)).toEqual([
      'string-1',
      'string-2-renamed',
    ]);

    const inverter = patchmap.selector('$..[?(@.id=="inverter-1")]')[0];
    patchmap.app.renderer.render({ container: patchmap.app.stage });
    expect(getHitTarget(patchmap, inverter.getGlobalPosition())).toBeDefined();
  });

  it('resets the scene index on redraw and keeps relation rendering live', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(plantMapData);
    await waitForScene();

    const relations = patchmap.selector(RELATIONS_PATH)[0];
    relations.renderLink();
    expect(relations.linkPoints).toHaveLength(3);

    patchmap.draw(redrawData);
    await waitForScene();

    expect(patchmap.world.store.sceneIndex.getById('string-1')).toBeNull();
    expect(patchmap.selector('$..[?(@.id=="string-1")]')).toEqual([]);
    expect(
      patchmap
        .selector('$..[?(@.id=="redraw-only-item")]')
        .map((item) => item.id),
    ).toEqual(['redraw-only-item']);
  });
});
