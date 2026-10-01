export const colorFixture = {
  themeA: { 'primary.default': '#0c73bfff' },
  themeB: { 'primary.default': '#112233ff' },
  colors: ['primary.default', '#ff0000', 0x00ff00, [0, 0, 1, 0.5]],
  colorInputMatrix: [
    { id: 'typed-array', construct: 'Uint8Array', values: [255, 128, 0, 128] },
    {
      id: 'pixijs-color-object',
      construct: 'PixiJS.Color',
      value: { r: 12, g: 34, b: 56, a: 0.25 },
    },
    {
      id: 'non-finite-typed-array',
      construct: 'Float32Array',
      values: [0, 'NaN', 1, 1],
      datasetPath: '$[0].fill',
    },
    {
      id: 'infinite-color-object',
      construct: 'PixiJS.Color',
      value: { r: 0, g: 'Infinity', b: 1, a: 1 },
      datasetPath: '$[1].fill',
    },
  ],
} as const;

export const dimensionFixture = {
  itemSize: [200, 100],
  padding: { x: 10, y: 5, top: 7 },
  componentSizes: [100, '50%', { value: 50, unit: '%' }, 'calc(100% - 20px)'],
} as const;

export const gridFixture = {
  grid: {
    id: 'grid',
    cells: [[1, 0, 'B'], [1, 1, 0]],
    itemSize: [20, 10],
    gap: [2, 3],
    padding: 1,
    inactiveCellStrategy: 'hide',
  },
  edgeMatrices: {
    ragged: [[1, 0, 'A'], [1]],
    empty: [],
    duplicateLabels: [['A', 'A']],
  },
} as const;

export const placementFixture = {
  item: {
    size: [100, 80],
    padding: { top: 7, right: 11, bottom: 13, left: 17 },
  },
  componentSize: [30, 10],
  margin: { top: 3, right: 5, bottom: 7, left: 9 },
  placements: [
    'left',
    'left-top',
    'left-bottom',
    'top',
    'right',
    'right-top',
    'right-bottom',
    'bottom',
    'center',
  ],
  placementMatrix: {
    left: { localBounds: [26, 32, 30, 10], worldBounds: [36, 52, 30, 10] },
    'left-top': { localBounds: [26, 10, 30, 10], worldBounds: [36, 30, 30, 10] },
    'left-bottom': { localBounds: [26, 50, 30, 10], worldBounds: [36, 70, 30, 10] },
    top: { localBounds: [38, 10, 30, 10], worldBounds: [48, 30, 30, 10] },
    right: { localBounds: [54, 32, 30, 10], worldBounds: [64, 52, 30, 10] },
    'right-top': { localBounds: [54, 10, 30, 10], worldBounds: [64, 30, 30, 10] },
    'right-bottom': { localBounds: [54, 50, 30, 10], worldBounds: [64, 70, 30, 10] },
    bottom: { localBounds: [38, 50, 30, 10], worldBounds: [48, 70, 30, 10] },
    center: { localBounds: [38, 32, 30, 10], worldBounds: [48, 52, 30, 10] },
  },
} as const;
