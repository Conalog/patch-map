import { describe, expect, it } from 'vitest';
import { PatchMapEngine } from './PatchMapEngine';

const createPanelData = () => [
  {
    type: 'grid',
    id: 'panel-grid',
    attrs: { display: 'panelGroup', x: 10, y: 20 },
    cells: [
      ['A', 'B'],
      [0, 'C'],
    ],
    gap: { x: 5, y: 7 },
    item: {
      size: { width: 100, height: 40 },
      padding: 2,
      components: [
        {
          type: 'background',
          source: { type: 'rect', fill: '#f8fafc', radius: 4 },
        },
        {
          type: 'bar',
          source: { type: 'rect', fill: '#38bdf8', radius: 3 },
          size: { width: '100%', height: '50%' },
          placement: 'bottom',
          animation: true,
        },
        { type: 'icon', source: 'wifi', show: false, size: 16 },
        { type: 'text', text: '', show: false, size: '100%' },
      ],
    },
  },
];

describe('PatchMapEngine', () => {
  it('creates a normalized model with generated grid items and indexes', () => {
    const engine = new PatchMapEngine();
    const { model } = engine.draw(createPanelData());

    expect(model.get('panel-grid')).toMatchObject({
      id: 'panel-grid',
      type: 'grid',
      display: 'panelGroup',
    });
    expect(model.get('panel-grid.0.0')).toMatchObject({
      id: 'panel-grid.0.0',
      type: 'item',
      parentId: 'panel-grid',
      generated: true,
    });
    expect(model.get('panel-grid.1.0')).toBe(null);
    expect(model.getByDisplay('panelGroup').map((record) => record.id)).toEqual(
      ['panel-grid'],
    );
    expect(
      model
        .selector('$..children[?(@.display=="panelGroup")].children')
        .map((record) => record.id),
    ).toEqual(['panel-grid.0.0', 'panel-grid.0.1', 'panel-grid.1.1']);
  });

  it('builds render IR for styled panel background and bars', () => {
    const engine = new PatchMapEngine();
    const { renderIR, renderPlan } = engine.draw(createPanelData());

    const bars = renderIR.byFeature.get('bar');
    const backgrounds = renderIR.byFeature.get('background');
    expect(bars).toHaveLength(3);
    expect(backgrounds).toHaveLength(3);
    expect(backgrounds[0].frame).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
    expect(bars[0]).toMatchObject({
      feature: 'bar',
      layer: 'bar',
      ownerId: 'panel-grid.0.0',
      material: {
        animation: true,
        animationDuration: 200,
      },
    });
    expect(bars[0].frame).toMatchObject({
      x: 12,
      y: 40,
      width: 96,
      height: 18,
    });
    expect(renderPlan.aggregateBars).toHaveLength(3);
    expect(renderPlan.aggregateBackgrounds).toHaveLength(3);
    expect(renderPlan.stats.estimatedDisplayObjects).toBe(2);
  });

  it('applies patch-service style component updates to the model and IR', () => {
    const engine = new PatchMapEngine();
    engine.draw(createPanelData());

    const updated = engine.update({
      path: '$..[?(@.id=="panel-grid.0.0")]',
      changes: {
        components: [
          {
            type: 'bar',
            size: { height: '75%' },
            animation: true,
          },
          { type: 'icon', show: false },
          { type: 'text', show: false },
        ],
      },
      validateSchema: false,
    });

    expect(updated.map((element) => element.id)).toEqual(['panel-grid.0.0']);
    const bar = engine.renderIR.byFeature
      .get('bar')
      .find((node) => node.ownerId === 'panel-grid.0.0');
    expect(bar.frame).toMatchObject({
      x: 12,
      y: 31,
      width: 96,
      height: 27,
    });
    expect(engine.renderDiff.updated.map((node) => node.id)).toContain(bar.id);
  });

  it('keeps selector compatibility refs stable across direct element updates', () => {
    const engine = new PatchMapEngine();
    engine.draw(createPanelData());
    const [item] = engine.selector('$..[?(@.id=="panel-grid.0.0")]');

    const updated = engine.update({
      elements: item,
      changes: { attrs: { display: 'selected-panel-item' } },
      validateSchema: false,
    });

    expect(updated).toEqual([item]);
    expect(item.display).toBe('selected-panel-item');
    expect(item._record.display).toBe('selected-panel-item');
    expect(engine.selector('$..[?(@.display=="selected-panel-item")]')).toEqual(
      [item],
    );
  });

  it('supports patch-service type selector paths for relation refreshes', () => {
    const engine = new PatchMapEngine();
    engine.draw([
      ...createPanelData(),
      {
        type: 'relations',
        id: 'relations-1',
        links: [{ source: 'panel-grid.0.0', target: 'panel-grid.0.1' }],
      },
    ]);

    expect(engine.selector('$..[?(@.type=="relations")]')).toMatchObject([
      { id: 'relations-1', type: 'relations' },
    ]);
  });

  it('namespaces duplicated component ids by owner while preserving update matching', () => {
    const engine = new PatchMapEngine();
    engine.draw([
      {
        type: 'item',
        id: 'panel-a',
        size: { width: 10, height: 10 },
        components: [{ type: 'bar', id: 'shared-bar', size: '50%' }],
      },
      {
        type: 'item',
        id: 'panel-b',
        size: { width: 10, height: 10 },
        components: [{ type: 'bar', id: 'shared-bar', size: '50%' }],
      },
    ]);

    expect(engine.model.get('panel-a.shared-bar')).toBeTruthy();
    expect(engine.model.get('panel-b.shared-bar')).toBeTruthy();

    engine.update({
      elements: engine.selector('$..[?(@.id=="panel-a")]')[0],
      changes: {
        components: [{ type: 'bar', id: 'shared-bar', size: '80%' }],
      },
      validateSchema: false,
    });

    expect(engine.model.get('panel-a.shared-bar').props.size).toBe('80%');
    expect(engine.model.get('panel-b.shared-bar').props.size.height).toEqual({
      value: 50,
      unit: '%',
    });
  });

  it('keeps a styled panel owner in Pixi fallback policy when icon becomes visible', () => {
    const engine = new PatchMapEngine();
    engine.draw(createPanelData());

    engine.update({
      path: '$..[?(@.id=="panel-grid.0.0")]',
      changes: {
        components: [
          { type: 'bar', size: { height: '75%' } },
          { type: 'icon', show: true },
          { type: 'text', show: false },
        ],
      },
      validateSchema: false,
    });

    const fallbackNodeIds = engine.renderPlan.pixiNodes.map((node) => node.id);
    const bar = engine.renderIR.byFeature
      .get('bar')
      .find((node) => node.ownerId === 'panel-grid.0.0');
    const icon = engine.renderIR.byFeature
      .get('icon')
      .find((node) => node.ownerId === 'panel-grid.0.0');

    expect(engine.renderPlan.aggregateBars).toHaveLength(2);
    expect(
      engine.renderPlan.aggregateBars.map((node) => node.id),
    ).not.toContain(bar.id);
    expect(fallbackNodeIds).toContain(bar.id);
    expect(fallbackNodeIds).toContain(icon.id);
  });

  it('coalesces repeated render work while keeping the latest revision available', () => {
    const scheduled = [];
    const engine = new PatchMapEngine();
    engine.scheduler.schedule = (callback) => scheduled.push(callback);
    engine.draw(createPanelData());

    engine.update({
      path: '$..[?(@.id=="panel-grid.0.0")]',
      changes: { components: [{ type: 'bar', size: { height: '20%' } }] },
      validateSchema: false,
    });
    engine.update({
      path: '$..[?(@.id=="panel-grid.0.0")]',
      changes: { components: [{ type: 'bar', size: { height: '80%' } }] },
      validateSchema: false,
    });

    expect(scheduled).toHaveLength(1);
    const flushed = engine.scheduler.flush();
    const latestBar = flushed.renderIR.byFeature
      .get('bar')
      .find((node) => node.ownerId === 'panel-grid.0.0');
    expect(flushed.revision).toBe(engine.revision);
    expect(latestBar.frame.height).toBeCloseTo(28.8);
  });

  it('defers repeated model updates until an explicit flush', () => {
    const engine = new PatchMapEngine();
    engine.draw(createPanelData());
    const initialRevision = engine.revision;
    const [firstPanel] = engine.selector('$..[?(@.id=="panel-grid.0.0")]');

    engine.update({
      elements: firstPanel,
      changes: { components: [{ type: 'bar', size: { height: '20%' } }] },
      validateSchema: false,
      deferRender: true,
    });
    engine.update({
      elements: firstPanel,
      changes: { components: [{ type: 'bar', size: { height: '80%' } }] },
      validateSchema: false,
      deferRender: true,
    });

    expect(engine.revision).toBe(initialRevision);
    expect(engine.dirty).toBe(true);

    const snapshot = engine.flush();
    const latestBar = snapshot.renderIR.byFeature
      .get('bar')
      .find((node) => node.ownerId === 'panel-grid.0.0');

    expect(engine.revision).toBe(initialRevision + 1);
    expect(latestBar.frame.height).toBeCloseTo(28.8);
  });
});
