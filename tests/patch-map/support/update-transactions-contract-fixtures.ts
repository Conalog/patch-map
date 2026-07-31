import {
  deepFreeze,
  type JsonRecord,
} from './update-transactions-contract-surface';

export function testDatasets(): ReadonlyMap<string, unknown> {
  return new Map([
    ['interactive-scene', interactiveScene()],
    ['all-kinds-scene', allKindsScene()],
    ['replacement-interactive-scene', replacementScene()],
    ['relation-variants-scene', relationScene()],
  ]);
}

function interactiveScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'item',
      id: 'item-a',
      label: 'Item A',
      size: { width: 100, height: 80 },
      padding: 4,
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#336699' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#00aa66' },
          size: { width: 60, height: 10 },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
        {
          type: 'icon',
          id: 'icon',
          source: 'active',
          size: { width: 16, height: 16 },
          placement: 'left-top',
          tint: '#ffffff',
        },
        {
          type: 'text',
          id: 'label',
          text: 'Alpha',
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
        },
      ],
      attrs: { x: 10, y: 20, zIndex: 1 },
    },
    rect('rect-b', 160, 40, 40, 30),
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
  ]);
}

function allKindsScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      padding: 4,
      attrs: { x: 10, y: 20 },
      components: [
        { type: 'background', id: 'bg', source: { type: 'rect', fill: '#336699' } },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#00aa66' },
          size: { width: 60, height: 10 },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
        { type: 'icon', id: 'icon', source: 'warning', size: 16, placement: 'left' },
        {
          type: 'text',
          id: 'label',
          text: 'Alpha',
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
        },
        {
          type: 'text',
          id: 'hidden-label',
          text: 'Hidden',
          show: false,
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 12, fill: '#222222' },
        },
      ],
    },
    rect('rect-b', 160, 40, 40, 30),
    {
      type: 'relations',
      id: 'links',
      links: [
        { source: 'item-a', target: 'item-a' },
        { source: 'item-a', target: 'rect-b' },
      ],
      style: { color: '#222222', width: 2 },
    },
    {
      type: 'image',
      id: 'image-a',
      source: 'fixture://image-a.png',
      size: { width: 80, height: 40 },
      attrs: { x: -20, y: 200 },
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
  ]);
}


export function hierarchyScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'group',
      id: 'group-a',
      attrs: { x: 0, y: 0 },
      children: [
        {
          type: 'item',
          id: 'item-a',
          size: { width: 100, height: 80 },
          padding: 4,
          attrs: { x: 10, y: 20 },
          components: [],
        },
        rect('rect-b', 160, 40, 40, 30),
      ],
    },
    { type: 'group', id: 'group-b', attrs: { x: 240, y: 0 }, children: [] },
    {
      type: 'relations',
      id: 'links',
      links: [
        { source: 'item-a', target: 'item-a' },
        { source: 'item-a', target: 'rect-b' },
        { source: 'rect-b', target: 'item-a' },
      ],
      style: { color: '#222222', width: 2 },
    },
  ]);
}

function replacementScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'item',
      id: 'item-a',
      size: { width: 120, height: 90 },
      padding: 5,
      attrs: { x: 20, y: 30 },
      components: [
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#228866' },
          size: { width: 70, height: 14 },
          placement: 'bottom',
        },
      ],
    },
    rect('rect-c', 240, 60, 30, 20),
  ]);
}

function relationScene(): readonly unknown[] {
  return deepFreeze([
    rect('a', 0, 0, 20, 20),
    rect('b', 100, 0, 20, 20),
    {
      type: 'relations',
      id: 'links',
      links: [
        { source: 'a', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      style: { color: '#222222', width: 2 },
    },
  ]);
}

function rect(id: string, x: number, y: number, width: number, height: number): JsonRecord {
  return {
    type: 'rect',
    id,
    size: { width, height },
    fill: '#ff8800',
    attrs: { x, y, zIndex: 2 },
  };
}


