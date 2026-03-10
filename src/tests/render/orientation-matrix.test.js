import { Point } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

const ANGLES = [0, 90, 180, 270];

const CARD_ID_BY_ANGLE = {
  0: 'ops-inverter-01',
  90: 'ops-edge-01',
  180: 'ops-card-generation',
  270: 'ops-card-maintenance',
};

const ORIENTATION_MATRIX = [
  {
    case: 'initial draw / rotation 0 / flip none',
    applyRotation: false,
    rotation: 0,
    flip: 'none',
    gridBar: 'BTTB',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation 0 / flip none',
    rotation: 0,
    flip: 'none',
    gridBar: 'BTTB',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation 0 / flip x',
    rotation: 0,
    flip: 'x',
    gridBar: 'BBTT',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation 0 / flip y',
    rotation: 0,
    flip: 'y',
    gridBar: 'TTBB',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation 0 / flip x+y',
    rotation: 0,
    flip: 'xy',
    gridBar: 'TBBT',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation -45 / flip none',
    rotation: -45,
    flip: 'none',
    gridBar: 'BBTT',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation -45 / flip x',
    rotation: -45,
    flip: 'x',
    gridBar: 'BTTB',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation -45 / flip y',
    rotation: -45,
    flip: 'y',
    gridBar: 'TBBT',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
  {
    case: 'rotation -45 / flip x+y',
    rotation: -45,
    flip: 'xy',
    gridBar: 'TTBB',
    gridText: 'TTTT',
    cardUprightPairs: ['0=180', '90=270'],
  },
];

const CARD_SCREEN_AXIS_BY_ROTATION = {
  0: { 0: 0, 90: -90 },
  '-45': { 0: -45, 90: 45 },
};

const CARD_FLIP_INVARIANT_MATRIX = [
  {
    case: 'card pose invariant to flip / rotation 0',
    rotation: 0,
    flips: ['x', 'y', 'xy'],
  },
  {
    case: 'card pose invariant to flip / rotation -45',
    rotation: -45,
    flips: ['x', 'y', 'xy'],
  },
];

const WORLD_POINT = new Point();
const PARENT_POINT = new Point();

const decodeAnchors = (pattern) => {
  const chars = String(pattern ?? '')
    .toUpperCase()
    .replaceAll(/\s+/g, '');
  expect(chars.length, `Anchor pattern must have 4 chars: ${pattern}`).toBe(4);
  return chars.split('').map((char) => {
    if (char === 'T') return 'top';
    if (char === 'B') return 'bottom';
    throw new Error(`Invalid anchor pattern char: ${char}`);
  });
};

const formatAnchors = (anchors) =>
  ANGLES.map((angle, index) => `${angle}:${anchors[index]}`).join(', ');

const applyRotationAndFlip = (patchmap, { rotation, flip }) => {
  patchmap.rotation.set(rotation);
  patchmap.flip.reset();

  if (flip === 'x') {
    patchmap.flip.set({ x: true, y: false });
  }
  if (flip === 'y') {
    patchmap.flip.set({ x: false, y: true });
  }
  if (flip === 'xy') {
    patchmap.flip.set({ x: true, y: true });
  }
};

const getBoundsInParent = (component) => {
  const bounds = component.getBounds();
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    WORLD_POINT.set(corner.x, corner.y);
    component.parent.toLocal(WORLD_POINT, undefined, PARENT_POINT);
    minX = Math.min(minX, PARENT_POINT.x);
    minY = Math.min(minY, PARENT_POINT.y);
    maxX = Math.max(maxX, PARENT_POINT.x);
    maxY = Math.max(maxY, PARENT_POINT.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const readVerticalAnchor = (component) => {
  const bounds = getBoundsInParent(component);
  const parentHeight = Number(component.parent?.props?.size?.height ?? 0);
  const topGap = bounds.y;
  const bottomGap = parentHeight - (bounds.y + bounds.height);
  return topGap <= bottomGap ? 'top' : 'bottom';
};

const findGridComponent = (patchmap, componentId, angle) => {
  const parentId = `ops-orientation-grid-${angle}.0.0`;
  return patchmap
    .selector(`$..[?(@.id=="${componentId}")]`)
    .find((node) => node.parent?.id === parentId);
};

const findCardComponent = (patchmap, componentId) =>
  patchmap.selector(`$..[?(@.id=="${componentId}")]`)[0];

const readGridAnchors = (patchmap, componentId) =>
  ANGLES.map((angle) => {
    const component = findGridComponent(patchmap, componentId, angle);
    expect(
      component,
      `Missing grid component ${componentId} at angle ${angle}`,
    ).toBeTruthy();
    return readVerticalAnchor(component);
  });

const CARD_VISUAL_COMPONENTS = [
  { key: 'icon', id: (cardId) => `icon-${cardId}` },
  { key: 'title', id: (cardId) => `text-${cardId}-title` },
  { key: 'status', id: (cardId) => `text-${cardId}-status` },
  { key: 'metric', id: (cardId) => `text-${cardId}-metric` },
  { key: 'bar', id: (cardId) => `bar-${cardId}` },
];

const normalizeAxis = (x, y) => {
  const length = Math.hypot(x, y);
  if (length <= 1e-7) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};

const readCardVisualByAngle = (patchmap, angle) => {
  const cardId = CARD_ID_BY_ANGLE[angle];
  const card = findCardComponent(patchmap, cardId);
  expect(card, `Missing card ${cardId} at angle ${angle}`).toBeTruthy();
  const cardBounds = card.getBounds();
  const parentWidth = Number(cardBounds.width || 1);
  const parentHeight = Number(cardBounds.height || 1);
  const layout = {};

  for (const component of CARD_VISUAL_COMPONENTS) {
    const id = component.id(cardId);
    const node = findCardComponent(patchmap, id);
    expect(node, `Missing card component ${id} at angle ${angle}`).toBeTruthy();
    const bounds = node.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const globalTransform = node.getGlobalTransform();
    const xAxis = normalizeAxis(
      Number(globalTransform?.a ?? 0),
      Number(globalTransform?.b ?? 0),
    );
    const yAxis = normalizeAxis(
      Number(globalTransform?.c ?? 0),
      Number(globalTransform?.d ?? 0),
    );
    layout[component.key] = {
      nx: (centerX - cardBounds.x) / parentWidth,
      ny: (centerY - cardBounds.y) / parentHeight,
      xAxis,
      yAxis,
    };
  }

  return layout;
};

const expectSameScreenPose = (actual, expected, label) => {
  expect(actual.nx, `${label} nx`).toBeCloseTo(expected.nx, 2);
  expect(actual.ny, `${label} ny`).toBeCloseTo(expected.ny, 2);
  expect(actual.xAxis.x, `${label} xAxis.x`).toBeCloseTo(expected.xAxis.x, 3);
  expect(actual.xAxis.y, `${label} xAxis.y`).toBeCloseTo(expected.xAxis.y, 3);
  expect(actual.yAxis.x, `${label} yAxis.x`).toBeCloseTo(expected.yAxis.x, 3);
  expect(actual.yAxis.y, `${label} yAxis.y`).toBeCloseTo(expected.yAxis.y, 3);
};

const normalizeDegrees = (angle) => ((angle % 360) + 360) % 360;

const axisFromDegrees = (angle) => {
  const radian = (normalizeDegrees(angle) * Math.PI) / 180;
  return {
    x: Math.cos(radian),
    y: Math.sin(radian),
  };
};

const expectAxisOrientation = (actual, angle, label) => {
  const expectedXAxis = axisFromDegrees(angle);
  const expectedYAxis = axisFromDegrees(angle + 90);
  expect(actual.xAxis.x, `${label} xAxis.x`).toBeCloseTo(expectedXAxis.x, 3);
  expect(actual.xAxis.y, `${label} xAxis.y`).toBeCloseTo(expectedXAxis.y, 3);
  expect(actual.yAxis.x, `${label} yAxis.x`).toBeCloseTo(expectedYAxis.x, 3);
  expect(actual.yAxis.y, `${label} yAxis.y`).toBeCloseTo(expectedYAxis.y, 3);
};

const parsePair = (pairText) => {
  const [left, right] = String(pairText).split('=');
  return [Number(left), Number(right)];
};

const assertCardUprightPairs = (patchmap, caseLabel, pairTexts = []) => {
  for (const pairText of pairTexts) {
    const [leftAngle, rightAngle] = parsePair(pairText);
    const left = readCardVisualByAngle(patchmap, leftAngle);
    const right = readCardVisualByAngle(patchmap, rightAngle);
    for (const component of CARD_VISUAL_COMPONENTS) {
      expectSameScreenPose(
        right[component.key],
        left[component.key],
        `${caseLabel} ${leftAngle}=${rightAngle} ${component.key}`,
      );
    }
  }
};

const assertCardUprightReferencePose = (patchmap, caseLabel, rotation) => {
  const horizontalCard = readCardVisualByAngle(patchmap, 0);
  const verticalCard = readCardVisualByAngle(patchmap, 90);
  const axisContract = CARD_SCREEN_AXIS_BY_ROTATION[String(rotation)];
  expect(
    axisContract,
    `Missing upright axis contract for rotation ${rotation}`,
  ).toBeTruthy();

  for (const key of ['title', 'status', 'metric', 'bar']) {
    expectAxisOrientation(
      horizontalCard[key],
      axisContract[0],
      `${caseLabel} angle:0 ${key}`,
    );
    expectAxisOrientation(
      verticalCard[key],
      axisContract[90],
      `${caseLabel} angle:90 ${key}`,
    );
  }
};

const readCardVisualSnapshot = (patchmap) => {
  const snapshot = {};
  for (const angle of ANGLES) {
    snapshot[angle] = readCardVisualByAngle(patchmap, angle);
  }
  return snapshot;
};

const getOverflow = (outerBounds, innerBounds) => ({
  left: Math.max(0, outerBounds.x - innerBounds.x),
  top: Math.max(0, outerBounds.y - innerBounds.y),
  right: Math.max(
    0,
    innerBounds.x + innerBounds.width - (outerBounds.x + outerBounds.width),
  ),
  bottom: Math.max(
    0,
    innerBounds.y + innerBounds.height - (outerBounds.y + outerBounds.height),
  ),
});

const assertCardComponentsInBounds = (patchmap, caseLabel) => {
  for (const angle of ANGLES) {
    const cardId = CARD_ID_BY_ANGLE[angle];
    const card = findCardComponent(patchmap, cardId);
    expect(card, `Missing card ${cardId} at angle ${angle}`).toBeTruthy();
    const cardBounds = card.getBounds();

    for (const component of CARD_VISUAL_COMPONENTS) {
      const componentId = component.id(cardId);
      const node = findCardComponent(patchmap, componentId);
      expect(
        node,
        `Missing card component ${componentId} at angle ${angle}`,
      ).toBeTruthy();
      const componentBounds = node.getBounds();
      const overflow = getOverflow(cardBounds, componentBounds);
      const maxOverflow = Math.max(
        overflow.left,
        overflow.top,
        overflow.right,
        overflow.bottom,
      );

      expect(
        maxOverflow,
        `${caseLabel} angle:${angle} component:${component.key} overflow:${JSON.stringify(overflow)}`,
      ).toBeLessThanOrEqual(0.75);
    }
  }
};

const GRID_VISUAL_COMPONENTS = [
  { key: 'bar', id: 'ops-orientation-panel-bar' },
  { key: 'text', id: 'ops-orientation-panel-text' },
];

const readGridVisualByAngle = (patchmap, angle) => {
  const cellId = `ops-orientation-grid-${angle}.0.0`;
  const cell = findCardComponent(patchmap, cellId);
  expect(cell, `Missing grid cell ${cellId}`).toBeTruthy();
  const cellBounds = cell.getBounds();
  const parentWidth = Number(cellBounds.width || 1);
  const parentHeight = Number(cellBounds.height || 1);
  const layout = {};

  for (const component of GRID_VISUAL_COMPONENTS) {
    const node = findGridComponent(patchmap, component.id, angle);
    expect(
      node,
      `Missing grid component ${component.id} at angle ${angle}`,
    ).toBeTruthy();
    const bounds = node.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const globalTransform = node.getGlobalTransform();
    const xAxis = normalizeAxis(
      Number(globalTransform?.a ?? 0),
      Number(globalTransform?.b ?? 0),
    );
    const yAxis = normalizeAxis(
      Number(globalTransform?.c ?? 0),
      Number(globalTransform?.d ?? 0),
    );
    layout[component.key] = {
      nx: (centerX - cellBounds.x) / parentWidth,
      ny: (centerY - cellBounds.y) / parentHeight,
      xAxis,
      yAxis,
    };
  }

  return layout;
};

const createOrientationGrid = ({
  angle,
  x,
  y,
  contentOrientation = 'follow-item',
}) => ({
  type: 'grid',
  id: `ops-orientation-grid-${angle}`,
  label: `Orientation Grid ${angle}deg`,
  cells: [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  gap: 8,
  item: {
    size: { width: 28, height: 56 },
    padding: { x: 4, y: 4 },
    contentOrientation,
    components: [
      {
        type: 'background',
        id: 'ops-orientation-panel-bg',
        source: {
          type: 'rect',
          fill: 'white',
          borderWidth: 1,
          borderColor: 'primary.default',
          radius: 6,
        },
        tint: 'gray.light',
      },
      {
        type: 'bar',
        id: 'ops-orientation-panel-bar',
        source: { type: 'rect', fill: 'primary.default', radius: 4 },
        size: { width: '100%', height: '36%' },
        placement: 'bottom',
      },
      {
        type: 'text',
        id: 'ops-orientation-panel-text',
        text: `${angle}deg`,
        placement: 'left-top',
        margin: { left: 6, top: 3 },
        style: { fontSize: 12, fill: 'gray.dark' },
      },
    ],
  },
  attrs: { x, y, angle },
});

const createOrientationCard = ({
  cardId,
  angle,
  x,
  y,
  contentOrientation = 'upright',
}) => ({
  type: 'item',
  id: cardId,
  label: 'Orientation Probe',
  size: { width: 244, height: 118 },
  padding: { x: 12, y: 10 },
  contentOrientation,
  components: [
    {
      type: 'background',
      id: `bg-${cardId}`,
      source: {
        type: 'rect',
        fill: 'white',
        borderWidth: 2,
        borderColor: 'primary.default',
        radius: 12,
      },
      tint: 'gray.light',
    },
    {
      type: 'icon',
      id: `icon-${cardId}`,
      source: 'device',
      size: 28,
      placement: 'left-top',
      margin: { left: 4, top: 4 },
      tint: 'primary.default',
    },
    {
      type: 'text',
      id: `text-${cardId}-title`,
      text: 'Orientation Probe',
      placement: 'left-top',
      margin: { left: 44, top: 6 },
      style: { fontSize: 15, fill: 'black' },
    },
    {
      type: 'text',
      id: `text-${cardId}-angle`,
      text: `${angle}deg`,
      placement: 'right-top',
      margin: { right: 12, top: 20 },
      style: { fontSize: 11, fill: 'primary.dark' },
    },
    {
      type: 'text',
      id: `text-${cardId}-status`,
      text: 'Unified Content',
      placement: 'left-top',
      margin: { left: 44, top: 34 },
      style: { fontSize: 12, fill: 'gray.dark' },
    },
    {
      type: 'text',
      id: `text-${cardId}-metric`,
      text: 'Metric 64%',
      placement: 'right-top',
      margin: { right: 12, top: 46 },
      style: { fontSize: 11, fill: 'gray.dark' },
    },
    {
      type: 'bar',
      id: `bar-${cardId}`,
      source: { type: 'rect', fill: 'primary.default', radius: 6 },
      size: { width: '64%', height: 10 },
      placement: 'bottom',
      margin: { left: 14, right: 14, bottom: 16 },
    },
  ],
  attrs: { x, y, angle },
});

const drawOrientationProbe = (patchmap) => {
  patchmap.draw([
    createOrientationCard({
      cardId: 'ops-inverter-01',
      angle: 0,
      x: 80,
      y: 60,
    }),
    createOrientationCard({ cardId: 'ops-edge-01', angle: 90, x: 460, y: 60 }),
    createOrientationCard({
      cardId: 'ops-card-generation',
      angle: 180,
      x: 80,
      y: 380,
    }),
    createOrientationCard({
      cardId: 'ops-card-maintenance',
      angle: 270,
      x: 460,
      y: 380,
    }),
    createOrientationGrid({ angle: 0, x: 120, y: 760 }),
    createOrientationGrid({ angle: 90, x: 360, y: 760 }),
    createOrientationGrid({ angle: 180, x: 120, y: 980 }),
    createOrientationGrid({ angle: 270, x: 360, y: 980 }),
  ]);
};

describe('Orientation Matrix Contracts', () => {
  const { getPatchmap } = setupPatchmapTests();

  it.each(ORIENTATION_MATRIX)('$case', (contract) => {
    const patchmap = getPatchmap();
    drawOrientationProbe(patchmap);
    if (contract.applyRotation !== false) {
      applyRotationAndFlip(patchmap, contract);
    }

    const actualGridBar = readGridAnchors(
      patchmap,
      'ops-orientation-panel-bar',
    );
    const expectedGridBar = decodeAnchors(contract.gridBar);
    expect(
      actualGridBar,
      `grid bar expected [${formatAnchors(expectedGridBar)}], got [${formatAnchors(actualGridBar)}]`,
    ).toEqual(expectedGridBar);

    const actualGridText = readGridAnchors(
      patchmap,
      'ops-orientation-panel-text',
    );
    const expectedGridText = decodeAnchors(contract.gridText);
    expect(
      actualGridText,
      `grid text expected [${formatAnchors(expectedGridText)}], got [${formatAnchors(actualGridText)}]`,
    ).toEqual(expectedGridText);

    if (contract.cardUprightPairs) {
      assertCardUprightPairs(
        patchmap,
        contract.case,
        contract.cardUprightPairs,
      );
      assertCardUprightReferencePose(
        patchmap,
        contract.case,
        contract.rotation,
      );
    }

    assertCardComponentsInBounds(patchmap, contract.case);
  });
});

describe('Orientation Card Flip Contracts', () => {
  const { getPatchmap } = setupPatchmapTests();

  it.each(CARD_FLIP_INVARIANT_MATRIX)('$case', (contract) => {
    const patchmap = getPatchmap();
    drawOrientationProbe(patchmap);
    applyRotationAndFlip(patchmap, {
      rotation: contract.rotation,
      flip: 'none',
    });
    const baseline = readCardVisualSnapshot(patchmap);

    for (const flip of contract.flips) {
      applyRotationAndFlip(patchmap, {
        rotation: contract.rotation,
        flip,
      });
      for (const angle of ANGLES) {
        const current = readCardVisualByAngle(patchmap, angle);
        for (const component of CARD_VISUAL_COMPONENTS) {
          expectSameScreenPose(
            current[component.key],
            baseline[angle][component.key],
            `${contract.case} angle:${angle} flip:${flip} component:${component.key}`,
          );
        }
      }
      assertCardComponentsInBounds(patchmap, `${contract.case} flip:${flip}`);
    }
  });
});

describe('Orientation Card Upright Content Updates', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('re-applies child pose when contentOrientation changes on item', () => {
    const patchmap = getPatchmap();
    patchmap.draw([
      createOrientationCard({
        cardId: 'ops-inverter-01',
        angle: 0,
        x: 80,
        y: 60,
        contentOrientation: 'upright',
      }),
      createOrientationCard({
        cardId: 'ops-edge-01',
        angle: 90,
        x: 460,
        y: 60,
        contentOrientation: 'upright',
      }),
      createOrientationCard({
        cardId: 'ops-card-generation',
        angle: 180,
        x: 80,
        y: 380,
        contentOrientation: 'follow-item',
      }),
      createOrientationCard({
        cardId: 'ops-card-maintenance',
        angle: 270,
        x: 460,
        y: 380,
        contentOrientation: 'upright',
      }),
    ]);

    const baseline = readCardVisualByAngle(patchmap, 0);

    patchmap.update({
      path: '$..[?(@.id=="ops-card-generation")]',
      changes: { contentOrientation: 'upright' },
    });

    const after = readCardVisualByAngle(patchmap, 180);
    for (const component of CARD_VISUAL_COMPONENTS) {
      expectSameScreenPose(
        after[component.key],
        baseline[component.key],
        `contentOrientation update component:${component.key}`,
      );
    }
    assertCardComponentsInBounds(
      patchmap,
      'contentOrientation update contract',
    );
  });
});

describe('Orientation Grid Upright Content Updates', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('re-applies grid cell pose when contentOrientation changes on grid item template', () => {
    const patchmap = getPatchmap();

    patchmap.draw([
      createOrientationGrid({
        angle: 0,
        x: 120,
        y: 760,
        contentOrientation: 'upright',
      }),
      createOrientationGrid({
        angle: 90,
        x: 360,
        y: 760,
        contentOrientation: 'upright',
      }),
      createOrientationGrid({
        angle: 180,
        x: 120,
        y: 980,
        contentOrientation: 'upright',
      }),
      createOrientationGrid({
        angle: 270,
        x: 360,
        y: 980,
        contentOrientation: 'upright',
      }),
    ]);

    const baseline = {};
    for (const angle of ANGLES) {
      baseline[angle] = readGridVisualByAngle(patchmap, angle);
    }

    patchmap.draw([
      createOrientationGrid({ angle: 0, x: 120, y: 760 }),
      createOrientationGrid({ angle: 90, x: 360, y: 760 }),
      createOrientationGrid({ angle: 180, x: 120, y: 980 }),
      createOrientationGrid({ angle: 270, x: 360, y: 980 }),
    ]);

    for (const angle of ANGLES) {
      patchmap.update({
        path: `$..[?(@.id=="ops-orientation-grid-${angle}")]`,
        changes: { item: { contentOrientation: 'upright' } },
      });
    }

    for (const angle of ANGLES) {
      const current = readGridVisualByAngle(patchmap, angle);
      const expected = baseline[angle];

      for (const component of GRID_VISUAL_COMPONENTS) {
        expectSameScreenPose(
          current[component.key],
          expected[component.key],
          `grid contentOrientation update angle:${angle} ${component.key}`,
        );
      }
    }
  });
});
