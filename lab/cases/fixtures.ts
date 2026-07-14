import type { MapData, PatchmapAssets } from '../../src/contracts';

import type { LabFixture, LabFixtureKey } from './types';

export const INLINE_LAB_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="4" fill="%23131a22"/%3E%3Cpath d="M7 22L14 9l4 8 3-5 4 10H7z" fill="%232bd9c4"/%3E%3C/svg%3E';

const INLINE_LAB_URL_IMAGE = INLINE_LAB_IMAGE.replace('%232bd9c4', '%23f2aa4c');
const INLINE_LAB_DESCRIPTOR_IMAGE = INLINE_LAB_IMAGE.replace('%232bd9c4', '%234f86c6');

/** Public Pixi asset input consumed by the lab-owned init sequence. */
export const LAB_ASSET_DEFINITIONS: PatchmapAssets = [
  { alias: 'lab-alias', src: INLINE_LAB_IMAGE },
];

const allElements: MapData = [
  {
    id: 'element-group',
    label: 'Group',
    type: 'group',
    attrs: { x: 20, y: 20 },
    children: [
      {
        id: 'group-child',
        label: 'Nested rect',
        type: 'rect',
        size: { width: 90, height: 52 },
        fill: '#243647',
        radius: 7,
      },
    ],
  },
  {
    id: 'element-grid',
    label: 'Grid',
    type: 'grid',
    attrs: { x: 170, y: 20 },
    cells: [
      ['A', 'B'],
      [1, 0],
    ],
    item: { size: { width: 56, height: 42 } },
    gap: { x: 8, y: 8 },
  },
  {
    id: 'element-item',
    label: 'Item',
    type: 'item',
    attrs: { x: 340, y: 20 },
    size: { width: 130, height: 84 },
  },
  {
    id: 'element-image',
    label: 'Image',
    type: 'image',
    attrs: { x: 20, y: 160 },
    source: INLINE_LAB_IMAGE,
    size: 64,
  },
  {
    id: 'element-text',
    label: 'Text',
    type: 'text',
    attrs: { x: 130, y: 168 },
    text: 'PATCH MAP',
    style: { fontSize: 24, fill: '#eef7f6' },
  },
  {
    id: 'element-rect',
    label: 'Rect',
    type: 'rect',
    attrs: { x: 320, y: 160 },
    size: { width: 150, height: 72 },
    fill: '#a54f35',
    stroke: { color: '#ffd9bf', width: 2 },
    radius: 12,
  },
  {
    id: 'element-relations',
    label: 'Relations',
    type: 'relations',
    links: [
      { source: 'group-child', target: 'element-rect' },
      { source: { id: 'element-item' }, target: { id: 'element-image' } },
    ],
    style: { color: '#2bd9c4', width: 3 },
  },
];

const allComponents: MapData = [
  {
    id: 'component-host',
    label: 'Component host',
    type: 'item',
    attrs: { x: 70, y: 50 },
    size: { width: 320, height: 190 },
    padding: 18,
    components: [
      {
        id: 'component-background',
        label: 'Background',
        type: 'background',
        source: {
          type: 'rect',
          fill: '#16222e',
          borderWidth: 2,
          borderColor: '#40576a',
          radius: 12,
        },
      },
      {
        id: 'component-bar',
        label: 'Bar',
        type: 'bar',
        source: { type: 'rect', fill: '#2bd9c4', radius: 4 },
        size: { width: '72%', height: 16 },
        placement: 'bottom',
        margin: { bottom: 14 },
        animation: false,
      },
      {
        id: 'component-icon',
        label: 'Icon',
        type: 'icon',
        source: INLINE_LAB_IMAGE,
        size: 58,
        placement: 'left',
        margin: { left: 22 },
      },
      {
        id: 'component-text',
        label: 'Text',
        type: 'text',
        text: 'Four public component kinds',
        placement: 'center',
        margin: { left: 58 },
        split: 0,
        style: { fontSize: 18, fill: '#eef7f6', wordWrap: true },
      },
    ],
  },
];

const defaults: MapData = [
  { type: 'rect', id: 'default-rect', size: 84 },
  { type: 'text', id: 'default-text' },
  { type: 'item', id: 'default-item', size: 92 },
  {
    type: 'grid',
    id: 'default-grid',
    cells: [[1]],
    item: { size: 64 },
  },
];

const visibility: MapData = [
  {
    id: 'visible-rect',
    label: 'visible',
    type: 'rect',
    attrs: { x: 30, y: 40 },
    size: 100,
    fill: '#2bd9c4',
  },
  {
    id: 'hidden-rect',
    label: 'hidden',
    type: 'rect',
    attrs: { x: 180, y: 40 },
    size: 100,
    fill: '#a54f35',
    show: false,
  },
];

const assets: MapData = [
  {
    id: 'asset-alias',
    label: 'alias',
    type: 'image',
    attrs: { x: 30, y: 40 },
    source: 'lab-alias',
    size: 80,
  },
  {
    id: 'asset-url',
    label: 'URL',
    type: 'image',
    attrs: { x: 150, y: 40 },
    source: INLINE_LAB_URL_IMAGE,
    size: 80,
  },
  {
    id: 'asset-descriptor',
    label: 'descriptor',
    type: 'image',
    attrs: { x: 270, y: 40 },
    source: { src: INLINE_LAB_DESCRIPTOR_IMAGE, format: 'svg' },
    size: 80,
  },
];

const advancedText: MapData = [
  {
    id: 'text-wrap',
    label: 'wrapped text element',
    type: 'text',
    attrs: { x: 24, y: 24 },
    text: 'Public geometry and line wrapping remain inspectable without pixel matching.',
    style: {
      fontSize: 24,
      fill: '#eef7f6',
      wordWrap: true,
      wordWrapWidth: 270,
      overflow: 'visible',
      autoFont: { min: 10, max: 24 },
    },
  },
  {
    id: 'text-item',
    type: 'item',
    attrs: { x: 24, y: 150 },
    size: { width: 360, height: 130 },
    padding: 12,
    components: [
      {
        id: 'text-component-split',
        type: 'text',
        text: 'alpha / beta / gamma',
        split: 1,
        placement: 'center',
        style: {
          fontSize: 22,
          wordWrap: true,
          wordWrapWidth: 260,
          overflow: 'visible',
          autoFont: { min: 11, max: 22 },
        },
      },
    ],
  },
];

const relations: MapData = [
  {
    id: 'relation-a',
    label: 'A',
    type: 'rect',
    attrs: { x: 30, y: 80 },
    size: 70,
    fill: '#2bd9c4',
  },
  {
    id: 'relation-b',
    label: 'B',
    type: 'rect',
    attrs: { x: 210, y: 40 },
    size: 70,
    fill: '#e3aa55',
  },
  {
    id: 'relation-c',
    label: 'C',
    type: 'rect',
    attrs: { x: 210, y: 160 },
    size: 70,
    fill: '#a54f35',
  },
  {
    id: 'relation-lines',
    type: 'relations',
    links: [
      { source: 'relation-a', target: 'relation-b' },
      { source: 'relation-a', target: 'relation-c' },
    ],
    style: { color: '#dce7e5', width: 2 },
  },
];

const gridCells: MapData = [
  {
    id: 'grid-destroy',
    label: 'destroy inactive',
    type: 'grid',
    attrs: { x: 20, y: 30 },
    cells: [
      ['A', 0, 'C'],
      [1, 'E', 0],
    ],
    item: { size: 52 },
    gap: 6,
    inactiveCellStrategy: 'destroy',
  },
  {
    id: 'grid-hide',
    label: 'hide inactive',
    type: 'grid',
    attrs: { x: 250, y: 30 },
    cells: [
      ['A', 0, 'C'],
      [1, 'E', 0],
    ],
    item: { size: 52 },
    gap: 6,
    inactiveCellStrategy: 'hide',
  },
];

const updatePlayground: MapData = [
  {
    id: 'update-rect-a',
    label: 'alpha',
    type: 'rect',
    attrs: { x: 30, y: 30, angle: 0 },
    size: { width: 100, height: 70 },
    fill: '#2bd9c4',
    stroke: { color: '#eef7f6', width: 2 },
  },
  {
    id: 'update-rect-b',
    label: 'beta',
    type: 'rect',
    attrs: { x: 190, y: 30, angle: 0 },
    size: { width: 100, height: 70 },
    fill: '#e3aa55',
  },
  {
    id: 'update-item',
    label: 'item',
    type: 'item',
    attrs: { x: 30, y: 150 },
    size: { width: 260, height: 120 },
    padding: 10,
    components: [
      {
        id: 'update-background',
        type: 'background',
        source: { type: 'rect', fill: '#172431', radius: 8 },
      },
      {
        id: 'update-bar',
        label: 'capacity',
        type: 'bar',
        source: { type: 'rect', fill: '#2bd9c4' },
        size: { width: '40%', height: 14 },
        animation: true,
        animationDuration: 200,
      },
      {
        id: 'update-text',
        type: 'text',
        text: 'before update',
        placement: 'center',
      },
    ],
  },
  {
    id: 'update-grid',
    type: 'grid',
    attrs: { x: 350, y: 30 },
    cells: [
      ['A', 'B'],
      [1, 0],
    ],
    item: {
      size: 58,
      components: [
        {
          id: 'grid-cell-text',
          type: 'text',
          text: 'cell',
          placement: 'center',
        },
      ],
    },
    gap: 5,
  },
  {
    id: 'update-relations',
    type: 'relations',
    links: [{ source: 'update-rect-a', target: 'update-rect-b' }],
  },
];

const transformPlayground: MapData = [
  {
    id: 'transform-a',
    label: 'transformable',
    type: 'rect',
    attrs: { x: 80, y: 70 },
    size: { width: 120, height: 90 },
    fill: '#2bd9c4',
  },
  {
    id: 'transform-b',
    label: 'group peer',
    type: 'rect',
    attrs: { x: 280, y: 120 },
    size: { width: 100, height: 70 },
    fill: '#e3aa55',
  },
  {
    id: 'transform-locked',
    label: 'locked',
    type: 'rect',
    attrs: { x: 160, y: 260 },
    size: 70,
    fill: '#a54f35',
    locked: true,
  },
];

export const LAB_FIXTURES = {
  'all-elements': { key: 'all-elements', title: 'All seven element kinds', data: allElements },
  'all-components': { key: 'all-components', title: 'All four item components', data: allComponents },
  defaults: { key: 'defaults', title: 'Materialized defaults', data: defaults },
  visibility: { key: 'visibility', title: 'Visibility lifecycle', data: visibility },
  assets: { key: 'assets', title: 'Asset source forms', data: assets },
  'advanced-text': { key: 'advanced-text', title: 'Advanced text', data: advancedText },
  relations: { key: 'relations', title: 'Relation endpoints', data: relations },
  'grid-cells': { key: 'grid-cells', title: 'Grid inactive strategies', data: gridCells },
  'update-playground': {
    key: 'update-playground',
    title: 'Update targets and components',
    data: updatePlayground,
  },
  'transform-playground': {
    key: 'transform-playground',
    title: 'Interaction and transformer targets',
    data: transformPlayground,
  },
} satisfies Record<Exclude<LabFixtureKey, 'production-like' | 'sandbox'>, LabFixture>;

/** Inputs are deliberately unknown so the runner can pass them to draw verbatim. */
export const LAB_INVALID_INPUTS: Readonly<Record<string, unknown>> = {
  'not-an-array': { type: 'rect', size: 20 },
  'rect-without-size': [{ id: 'invalid-rect', type: 'rect' }],
  'grid-without-item': [{ id: 'invalid-grid', type: 'grid', cells: [[1]] }],
  'image-without-source': [{ id: 'invalid-image', type: 'image' }],
  'duplicate-element-id': [
    { id: 'duplicate', type: 'rect', size: 20 },
    { id: 'duplicate', type: 'text', text: 'duplicate' },
  ],
};
