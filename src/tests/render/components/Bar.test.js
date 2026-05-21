import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../patchmap.setup';

describe('Bar Component Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  const itemWithBar = {
    type: 'item',
    id: 'item-with-bar',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'bar',
        id: 'bar-1',
        source: { type: 'rect', fill: 'blue' },
        size: { width: '50%', height: 20 },
      },
    ],
  };

  it('should render a bar with minimal required properties and correct default values', async () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithBar]);

    const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
    expect(bar).toBeDefined();

    expect(bar.props.placement).toBe('bottom');
    expect(bar.props.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(bar.props.animation).toBe(true);
    expect(bar.props.animationDuration).toBe(200);

    expect(bar.width).toBe(1);
    expect(bar.height).toBe(1);
    gsap.exportRoot().totalProgress(1);
    expect(bar.width).toBe(100);
    expect(bar.height).toBe(20);
    expect(bar.x).toBe(50);
    expect(bar.y).toBe(80);
  });

  it("should update the bar's appearance when source property is changed", () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithBar]);
    gsap.exportRoot().totalProgress(1);

    const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
    expect(bar.props.source.fill).toBe('blue');

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { source: { type: 'rect', fill: 'red' } },
    });
    expect(bar.props.source.fill).toBe('red');
  });

  it('uses the aggregate bar layer for trusted bar-only item component updates', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-bar-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-bar',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          {
            type: 'text',
            id: 'aggregate-label',
            text: 'hidden',
            show: false,
          },
        ],
      },
    ]);

    const item = patchmap.selector('$..[?(@.id=="aggregate-bar-item")]')[0];
    const bar = patchmap.selector('$..[?(@.id=="aggregate-bar")]')[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-bar',
            size: { width: '75%', height: 24 },
            tint: 0xff0000,
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });

    patchmap.selector('$..[?(@.id=="aggregate-bar")]');

    expect(patchmap.world.store.aggregateBarLayer).toBeDefined();
    expect(patchmap.world.store.aggregateBarLayer.particleChildren.length).toBe(
      6,
    );
    expect(bar.renderable).toBe(false);
    expect(bar._patchmapUseAggregateBar).toBe(true);
    expect(bar.props.size.width).toEqual({ value: 75, unit: '%' });
  });

  it('keeps the aggregate bar layer below relations after reordering', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-relations-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-relations-bar',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
        ],
      },
      { type: 'relations', id: 'aggregate-relations', links: [] },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="aggregate-relations-item")]',
    )[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-relations-bar',
            size: { width: '75%', height: 24 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-relations-bar")]');

    const layer = patchmap.world.store.aggregateBarLayer;
    const relations = patchmap.selector(
      '$..[?(@.id=="aggregate-relations")]',
    )[0];
    expect(patchmap.world.children.indexOf(layer)).toBeLessThan(
      patchmap.world.children.indexOf(relations),
    );

    patchmap.world.setChildIndex(layer, patchmap.world.children.length - 1);
    expect(patchmap.world.children.indexOf(layer)).toBeGreaterThan(
      patchmap.world.children.indexOf(relations),
    );

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-relations-bar',
            tint: 0xff0000,
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-relations-bar")]');

    expect(patchmap.world.children.indexOf(layer)).toBeLessThan(
      patchmap.world.children.indexOf(relations),
    );
  });

  it('uses separate aggregate bar layers for different texture sources', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-source-item-a',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-source-bar-a',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
        ],
      },
      {
        type: 'item',
        id: 'aggregate-source-item-b',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-source-bar-b',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
        ],
      },
      { type: 'relations', id: 'aggregate-source-relations', links: [] },
    ]);

    const items = [
      patchmap.selector('$..[?(@.id=="aggregate-source-item-a")]')[0],
      patchmap.selector('$..[?(@.id=="aggregate-source-item-b")]')[0],
    ];

    patchmap.update({
      elements: items,
      changes: {
        components: [{ type: 'bar', size: { width: '75%', height: 24 } }],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-source-bar-a")]');

    const layers = [...patchmap.world.store.aggregateBarLayers.values()];
    expect(layers).toHaveLength(2);
    expect(layers.map((layer) => layer.textureSource)).toHaveLength(2);
    expect(new Set(layers.map((layer) => layer.textureSource)).size).toBe(2);
    expect(layers.map((layer) => layer.particleChildren.length)).toEqual([
      6, 6,
    ]);

    const relations = patchmap.selector(
      '$..[?(@.id=="aggregate-source-relations")]',
    )[0];
    const relationIndex = patchmap.world.children.indexOf(relations);
    for (const layer of layers) {
      expect(patchmap.world.children.indexOf(layer)).toBeLessThan(
        relationIndex,
      );
    }
  });

  it('moves aggregate bar particles when the texture source changes', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-source-change-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-source-change-bar',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
        ],
      },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="aggregate-source-change-item")]',
    )[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-source-change-bar',
            size: { width: '75%', height: 24 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-source-change-bar")]');

    const oldLayer = patchmap.world.store.aggregateBarLayer;
    expect(oldLayer.particleChildren.length).toBe(6);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-source-change-bar',
            source: { type: 'rect', fill: 'red', radius: 4 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-source-change-bar")]');

    const layers = [...patchmap.world.store.aggregateBarLayers.values()];
    const activeLayer = layers.find((layer) => layer !== oldLayer);
    expect(oldLayer.destroyed).toBe(true);
    expect(layers).not.toContain(oldLayer);
    expect(activeLayer.particleChildren.length).toBe(6);
  });

  it('keeps aggregate bar particles aligned when the parent item moves or fades', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-moving-item',
        attrs: { x: 10, y: 20 },
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-moving-bar',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
        ],
      },
    ]);

    const item = patchmap.selector('$..[?(@.id=="aggregate-moving-item")]')[0];
    const bar = patchmap.selector('$..[?(@.id=="aggregate-moving-bar")]')[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-moving-bar',
            size: { width: '75%', height: 24 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-moving-bar")]');

    const layer = patchmap.world.store.aggregateBarLayer;
    const initialParticle = layer.particleChildren[0];
    const initialX = initialParticle.x;
    const initialY = initialParticle.y;

    patchmap.update({
      elements: item,
      changes: { attrs: { x: 40, y: 55, alpha: 0.5 } },
      validateSchema: false,
      emit: false,
    });

    expect(bar._patchmapUseAggregateBar).toBe(true);
    expect(initialParticle.x).toBeCloseTo(initialX + 30);
    expect(initialParticle.y).toBeCloseTo(initialY + 35);
    expect(initialParticle.alpha).toBe(0.5);
  });

  it('restores regular bar rendering when visible text makes aggregation unsafe', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-fallback-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-fallback-bar',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          {
            type: 'text',
            id: 'aggregate-fallback-label',
            text: 'visible',
            show: false,
          },
        ],
      },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="aggregate-fallback-item")]',
    )[0];
    const bar = patchmap.selector('$..[?(@.id=="aggregate-fallback-bar")]')[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-fallback-bar',
            size: { width: '75%', height: 24 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-fallback-bar")]');
    expect(bar.renderable).toBe(false);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          { type: 'text', id: 'aggregate-fallback-label', show: true },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-fallback-bar")]');

    expect(bar.renderable).toBe(true);
    expect(bar._patchmapUseAggregateBar).toBe(false);
    expect(patchmap.world.store.aggregateBarLayers.size).toBe(1);
    expect(
      patchmap.world.store.aggregateBarLayer.particleChildren.every(
        (particle) => particle.alpha === 0,
      ),
    ).toBe(true);
    expect(bar.width).toBe(150);
    expect(bar.height).toBe(24);
  });

  it('reuses hidden aggregate bar particles when visible icon toggles fallback', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-icon-toggle-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-icon-toggle-bar',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          {
            type: 'icon',
            id: 'aggregate-icon-toggle-icon',
            source: 'warning',
            show: false,
            size: 20,
          },
        ],
      },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="aggregate-icon-toggle-item")]',
    )[0];
    const bar = patchmap.selector(
      '$..[?(@.id=="aggregate-icon-toggle-bar")]',
    )[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          { type: 'bar', id: 'aggregate-icon-toggle-bar', size: '80%' },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-icon-toggle-bar")]');

    const layer = patchmap.world.store.aggregateBarLayer;
    const particleCount = layer.particleChildren.length;
    const firstParticle = layer.particleChildren[0];
    expect(bar._patchmapUseAggregateBar).toBe(true);
    expect(bar.renderable).toBe(false);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          { type: 'icon', id: 'aggregate-icon-toggle-icon', show: true },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-icon-toggle-bar")]');

    expect(bar._patchmapUseAggregateBar).toBe(false);
    expect(bar.renderable).toBe(true);
    expect(layer.particleChildren.length).toBe(particleCount);
    expect(layer.particleChildren[0]).toBe(firstParticle);
    expect(
      layer.particleChildren.every((particle) => particle.alpha === 0),
    ).toBe(true);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          { type: 'icon', id: 'aggregate-icon-toggle-icon', show: false },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-icon-toggle-bar")]');

    expect(bar._patchmapUseAggregateBar).toBe(true);
    expect(bar.renderable).toBe(false);
    expect(layer.particleChildren.length).toBe(particleCount);
    expect(layer.particleChildren[0]).toBe(firstParticle);
  });

  it('snaps the hidden Pixi bar to the final size when leaving aggregate rendering', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'aggregate-to-fallback-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'aggregate-to-fallback-bar',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: true,
            animationDuration: 800,
          },
          {
            type: 'text',
            id: 'aggregate-to-fallback-text',
            text: '1',
            show: false,
          },
        ],
      },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="aggregate-to-fallback-item")]',
    )[0];
    const bar = patchmap.selector(
      '$..[?(@.id=="aggregate-to-fallback-bar")]',
    )[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-to-fallback-bar',
            size: { width: '80%', height: 32 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-to-fallback-bar")]');
    expect(bar._patchmapUseAggregateBar).toBe(true);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'aggregate-to-fallback-bar',
            size: { width: '85%', height: 36 },
          },
          {
            type: 'text',
            id: 'aggregate-to-fallback-text',
            show: true,
            text: '1',
            style: { fill: 'black' },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="aggregate-to-fallback-bar")]');

    expect(bar._patchmapUseAggregateBar).toBe(false);
    expect(bar.renderable).toBe(true);
    expect(bar.width).toBe(170);
    expect(bar.height).toBe(36);
    gsap.exportRoot().totalProgress(1);
    expect(bar.width).toBe(170);
    expect(bar.height).toBe(36);
  });

  it('snaps the Pixi bar before re-entering aggregate rendering', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'fallback-to-aggregate-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'fallback-to-aggregate-bar',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: true,
            animationDuration: 800,
          },
          {
            type: 'text',
            id: 'fallback-to-aggregate-text',
            text: '1',
            show: true,
          },
        ],
      },
    ]);

    const item = patchmap.selector(
      '$..[?(@.id=="fallback-to-aggregate-item")]',
    )[0];
    const bar = patchmap.selector(
      '$..[?(@.id=="fallback-to-aggregate-bar")]',
    )[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'fallback-to-aggregate-bar',
            size: { width: '80%', height: 32 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="fallback-to-aggregate-bar")]');
    expect(bar._patchmapUseAggregateBar).toBe(false);
    expect(bar._sizeAnimJob?.done).toBe(false);

    patchmap.update({
      elements: item,
      changes: {
        components: [
          { type: 'text', id: 'fallback-to-aggregate-text', show: false },
        ],
      },
      validateSchema: false,
      emit: false,
    });
    patchmap.selector('$..[?(@.id=="fallback-to-aggregate-bar")]');

    expect(bar._patchmapUseAggregateBar).toBe(true);
    expect(bar.renderable).toBe(false);
    expect(bar.width).toBe(160);
    expect(bar.height).toBe(32);
    gsap.exportRoot().totalProgress(1);
    expect(bar.width).toBe(160);
    expect(bar.height).toBe(32);
  });

  it('applies trusted silent single item component updates immediately', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'queued-item-item',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'queued-item-bar',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          {
            type: 'text',
            id: 'queued-item-text',
            text: 'visible',
            show: true,
          },
        ],
      },
    ]);

    const item = patchmap.selector('$..[?(@.id=="queued-item-item")]')[0];
    const bar = patchmap.selector('$..[?(@.id=="queued-item-bar")]')[0];

    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            id: 'queued-item-bar',
            size: { width: '80%', height: 28 },
          },
        ],
      },
      validateSchema: false,
      emit: false,
    });

    expect(bar.props.size.width).toEqual({ value: 80, unit: '%' });
    expect(bar.width).toBe(160);
    expect(bar.height).toBe(28);

    const flushedBar = patchmap.selector('$..[?(@.id=="queued-item-bar")]')[0];
    expect(flushedBar.props.size.width).toEqual({ value: 80, unit: '%' });
    expect(flushedBar.width).toBe(160);
    expect(flushedBar.height).toBe(28);
  });

  it('applies trusted silent bulk item component updates immediately', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      {
        type: 'item',
        id: 'queued-bulk-item-a',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'queued-bulk-bar-a',
            source: { type: 'rect', fill: 'blue', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          { type: 'text', id: 'queued-bulk-text-a', text: 'A', show: true },
        ],
      },
      {
        type: 'item',
        id: 'queued-bulk-item-b',
        size: { width: 200, height: 100 },
        components: [
          {
            type: 'bar',
            id: 'queued-bulk-bar-b',
            source: { type: 'rect', fill: 'green', radius: 4 },
            size: { width: '50%', height: 20 },
            animation: false,
          },
          { type: 'text', id: 'queued-bulk-text-b', text: 'B', show: true },
        ],
      },
    ]);

    const items = [
      patchmap.selector('$..[?(@.id=="queued-bulk-item-a")]')[0],
      patchmap.selector('$..[?(@.id=="queued-bulk-item-b")]')[0],
    ];
    const firstBar = patchmap.selector('$..[?(@.id=="queued-bulk-bar-a")]')[0];
    const secondBar = patchmap.selector('$..[?(@.id=="queued-bulk-bar-b")]')[0];

    patchmap.update({
      elements: items,
      changes: {
        components: [{ type: 'bar', size: { width: '80%', height: 28 } }],
      },
      validateSchema: false,
      emit: false,
    });

    expect(firstBar.props.size.width).toEqual({ value: 80, unit: '%' });
    expect(secondBar.props.size.width).toEqual({ value: 80, unit: '%' });
    expect(firstBar.width).toBe(160);
    expect(secondBar.width).toBe(160);
  });

  describe('when updating size', () => {
    const testCases = [
      {
        description: 'percentage width and fixed height',
        size: { width: '25%', height: 40 },
        expected: { width: 50, height: 40 },
      },
      {
        description: 'fixed width and percentage height',
        size: { width: 60, height: '10%' },
        expected: { width: 60, height: 10 },
      },
      {
        description: 'percentage for both width and height',
        size: { width: '100%', height: '50%' },
        expected: { width: 200, height: 50 },
      },
      {
        description: 'fixed values for both width and height',
        size: { width: 120, height: 30 },
        expected: { width: 120, height: 30 },
      },
      {
        description: 'zero size',
        size: { width: 0, height: 0 },
        expected: { width: 0, height: 0 },
      },
      {
        description: 'size overflowing parent with fixed values',
        size: { width: 300, height: 150 },
        expected: { width: 300, height: 150 },
      },
      {
        description: 'size overflowing parent with percentage values',
        size: { width: '200%', height: '110%' },
        expected: { width: 400, height: 110 },
      },
    ];

    it.each(testCases)('should correctly update to $description', ({
      size,
      expected,
    }) => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithBar]);
      gsap.exportRoot().totalProgress(1);

      const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];

      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { size },
      });
      gsap.exportRoot().totalProgress(1);

      expect(bar.width).toBe(expected.width);
      expect(bar.height).toBe(expected.height);
    });
  });

  describe('when parent item has padding', () => {
    const itemWithPaddedBar = {
      type: 'item',
      id: 'padded-item',
      size: { width: 200, height: 100 },
      padding: 20,
      components: [
        {
          type: 'bar',
          id: 'bar-in-padded',
          source: { type: 'rect', fill: 'green' },
          size: { width: '50%', height: '100%' },
        },
      ],
    };

    it('should calculate size based on parent content area', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithPaddedBar]);
      gsap.exportRoot().totalProgress(1);

      const bar = patchmap.selector('$..[?(@.id=="bar-in-padded")]')[0];
      const contentWidth = 200 - 20 * 2; // 160
      const contentHeight = 100 - 20 * 2; // 60
      expect(bar.width).toBe(contentWidth * 0.5); // 80
      expect(bar.height).toBe(contentHeight * 1); // 60
    });
  });

  describe('when toggling animation property', () => {
    it('should apply size changes immediately if animation is false from the start', () => {
      const patchmap = getPatchmap();
      const itemWithNonAnimatedBar = {
        ...itemWithBar,
        components: [{ ...itemWithBar.components[0], animation: false }],
      };

      patchmap.draw([itemWithNonAnimatedBar]);
      const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
      expect(bar.width).toBe(100);
      expect(bar.height).toBe(20);
    });

    it('should kill the in-progress animation and jump to the final state when animation is set to false', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithBar]);
      gsap.exportRoot().totalProgress(1);
      const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];

      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { size: { width: 200, height: 50 } },
      });
      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { animation: false },
      });
      expect(bar.width).toBe(200);
      expect(bar.height).toBe(50);
    });
  });

  describe('when combining various layout properties', () => {
    const layoutTestCases = [
      {
        description: 'basic center placement with no padding or margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: 75, y: 40, width: 50, height: 20 },
      },
      {
        description: 'top-left placement with uniform padding',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left-top',
        barMargin: 0,
        expected: { x: 10, y: 10, width: 50, height: 20 },
      },
      {
        description: 'bottom-right with uniform padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'right-bottom',
        barMargin: 5,
        expected: { x: 135, y: 65, width: 50, height: 20 },
      },
      {
        description: 'center with non-uniform padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: { top: 10, right: 20, bottom: 30, left: 40 },
        barSize: { width: 50, height: 20 },
        barPlacement: 'center',
        barMargin: { top: 1, right: 2, bottom: 3, left: 4 },
        expected: { x: 86, y: 29, width: 50, height: 20 },
      },
      {
        description: 'percentage size with padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 20,
        barSize: { width: '50%', height: '25%' },
        barPlacement: 'right-top',
        barMargin: 5,
        expected: { x: 95, y: 25, width: 80, height: 15 },
      },
      {
        description: 'full-size bar with padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: '100%', height: '100%' },
        barPlacement: 'left-top',
        barMargin: 5,
        expected: { x: 15, y: 15, width: 180, height: 80 },
      },
      {
        description:
          'single axis placement (top) should be horizontally centered',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'top',
        barMargin: 10,
        expected: { x: 75, y: 10, width: 50, height: 20 },
      },
      {
        description:
          'single axis placement (left) should be vertically centered',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left',
        barMargin: 10,
        expected: { x: 10, y: 40, width: 50, height: 20 },
      },
      {
        description: 'edge case: bar larger than content area',
        itemSize: { width: 100, height: 100 },
        itemPadding: 10,
        barSize: { width: 100, height: 100 },
        barPlacement: 'left-top',
        barMargin: 0,
        expected: { x: 10, y: 10, width: 100, height: 100 },
      },
      {
        description: 'edge case: padding larger than item size',
        itemSize: { width: 100, height: 100 },
        itemPadding: 60,
        barSize: { width: '100%', height: '100%' },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: 60, y: 60, width: 0, height: 0 },
      },
      {
        description: 'edge case: zero size item',
        itemSize: { width: 0, height: 0 },
        itemPadding: 0,
        barSize: { width: 10, height: 10 },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: -5, y: -5, width: 10, height: 10 },
      },

      {
        description: 'edge case: negative margin should shift element outside',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left-top',
        barMargin: -5,
        expected: { x: 5, y: 5, width: 50, height: 20 },
      },
    ];

    it.each(layoutTestCases)('$description', ({
      itemSize,
      itemPadding,
      barSize,
      barPlacement,
      barMargin,
      expected,
    }) => {
      const patchmap = getPatchmap();
      const testItem = {
        type: 'item',
        id: 'test-item',
        size: itemSize,
        padding: itemPadding,
        components: [
          {
            type: 'bar',
            id: 'test-bar',
            source: { type: 'rect', fill: 'magenta' },
            size: barSize,
            placement: barPlacement,
            margin: barMargin,
          },
        ],
      };

      patchmap.draw([testItem]);
      gsap.exportRoot().totalProgress(1);

      const bar = patchmap.selector('$..[?(@.id=="test-bar")]')[0];
      expect(bar.width).toBeCloseTo(expected.width);
      expect(bar.height).toBeCloseTo(expected.height);
      expect(bar.x).toBeCloseTo(expected.x);
      expect(bar.y).toBeCloseTo(expected.y);
    });
  });
});
