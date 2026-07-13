const GRID_ITEM_COMPONENTS = Object.freeze([
  {
    type: 'background',
    source: {
      type: 'rect',
      fill: '#f8fafc',
      borderWidth: 1,
      borderColor: '#94a3b8',
      radius: 2,
    },
  },
  {
    type: 'bar',
    source: { type: 'rect', fill: '#ffffff' },
    size: { width: '72%', height: '36%' },
    placement: 'bottom',
    tint: '#0c73bf',
    animation: false,
  },
  {
    type: 'icon',
    source: 'device',
    size: 10,
    placement: 'top',
    tint: '#1a1a1a',
  },
  {
    type: 'text',
    text: 'P',
    placement: 'center',
    style: { fontSize: 8, fill: '#1a1a1a' },
  },
]);

export const createScalingFixture = (itemCount) => {
  assertItemCount(itemCount);
  const columns = Math.ceil(Math.sqrt(itemCount));
  const rows = Math.ceil(itemCount / columns);
  let remaining = itemCount;
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => {
      if (remaining <= 0) return 0;
      remaining -= 1;
      return 1;
    }),
  );

  return [
    {
      type: 'grid',
      id: `perf-grid-${itemCount}`,
      label: `perf-grid-${itemCount}`,
      cells,
      gap: 1,
      item: {
        size: { width: 18, height: 24 },
        padding: 1,
        contentOrientation: 'upright',
        components: GRID_ITEM_COMPONENTS,
      },
      attrs: { x: 0, y: 0 },
    },
  ];
};

const assertItemCount = (itemCount) => {
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) {
    throw new TypeError('itemCount must be a positive safe integer.');
  }
};
