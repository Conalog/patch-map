import { describe, expect, it } from 'vitest';
import { calcPlacementPoint, resolvePlacementFrame } from './placement-frame';

const LAYOUT_CONTEXT = {
  parentWidth: 500,
  parentHeight: 500,
  contentWidth: 500,
  contentHeight: 500,
  parentPadding: { left: 0, top: 0, right: 0, bottom: 0 },
};

const createComponent = () => ({
  width: 100,
  height: 50,
  angle: 0,
  scale: { x: 1, y: 1 },
  parent: null,
  store: { view: null, world: null },
  props: {
    placement: 'left-top',
    margin: { left: 0, top: 0, right: 0, bottom: 0 },
    size: {
      width: { value: 100, unit: '%' },
      height: { value: 20, unit: '%' },
    },
  },
});

const setUprightContainer = (component, angle = 0) => {
  component.parent = {
    angle,
    props: { contentOrientation: 'upright' },
    parent: null,
  };
};

const place = (component) => {
  const frame = resolvePlacementFrame(
    component,
    component.props.placement,
    component.props.margin,
  );
  return calcPlacementPoint(LAYOUT_CONTEXT, frame, {
    width: component.width,
    height: component.height,
  });
};

describe('placement-frame', () => {
  it('keeps default placement without screen remap', () => {
    const component = createComponent();
    component.props.placement = 'bottom';
    component.props.margin = { left: 0, right: 0, top: 0, bottom: 20 };

    expect(place(component)).toEqual({ x: 200, y: 430 });
  });

  it('adds parent angle when resolving follow-item placement', () => {
    const component = createComponent();
    component.props.placement = 'bottom';
    component.props.margin = { left: 0, right: 0, top: 3, bottom: 7 };
    component.width = 20;
    component.height = 9;
    component.parent = { angle: 90, parent: null };
    component.store.view = { angle: 0, flipX: false, flipY: false };

    expect(place(component)).toEqual({ x: 240, y: 7 });
  });

  it.each([
    {
      case: 'upside-down screen orientation swaps bottom to top',
      placement: 'bottom',
      margin: { left: 0, right: 0, top: 3, bottom: 7 },
      size: { width: 100, height: 50 },
      scale: { x: 1, y: 1 },
      view: { angle: 180, flipX: false, flipY: false },
      expected: { x: 200, y: 7 },
    },
    {
      case: 'corner placement keeps horizontal edge and only remaps vertical edge',
      placement: 'left-bottom',
      margin: { left: 10, right: 70, top: 3, bottom: 7 },
      size: { width: 20, height: 9 },
      scale: { x: 1, y: 1 },
      view: { angle: 180, flipX: false, flipY: false },
      expected: { x: 10, y: 7 },
    },
    {
      case: 'local scale.y flip is reflected in vertical anchor choice',
      placement: 'bottom',
      margin: { left: 0, right: 0, top: 3, bottom: 7 },
      size: { width: 20, height: 9 },
      scale: { x: 1, y: -1 },
      view: { angle: 180, flipX: false, flipY: false },
      expected: { x: 240, y: 484 },
    },
  ])('follow-item contract: $case', ({
    placement,
    margin,
    size,
    scale,
    view,
    expected,
  }) => {
    const component = createComponent();
    component.props.placement = placement;
    component.props.margin = margin;
    component.width = size.width;
    component.height = size.height;
    component.scale = scale;
    component.store.view = view;

    expect(place(component)).toEqual(expected);
  });

  it.each([
    {
      case: 'upside-down screen orientation remaps both corner axes',
      scale: { x: 1, y: 1 },
      parentAngle: 0,
      view: { angle: 180, flipX: false, flipY: false },
      expected: { x: 474, y: 487 },
    },
    {
      case: 'local scale.x and scale.y flips do not move the upright corner anchor',
      scale: { x: -1, y: -1 },
      parentAngle: 0,
      view: { angle: 0, flipX: false, flipY: false },
      expected: { x: 6, y: 4 },
    },
    {
      case: 'ancestor angle keeps vertical edge anchored after rotation',
      placement: 'bottom',
      margin: { left: 0, right: 0, top: 3, bottom: 7 },
      size: { width: 20, height: 9 },
      scale: { x: 1, y: 1 },
      parentAngle: 180,
      view: { angle: -45, flipX: false, flipY: false },
      expected: { x: 240, y: 7 },
    },
    {
      case: 'screen flipX remaps horizontal corner anchor',
      scale: { x: -1, y: 1 },
      parentAngle: 0,
      view: { angle: 0, flipX: true, flipY: false },
      expected: { x: 474, y: 4 },
    },
    {
      case: 'screen flipY remaps vertical corner anchor',
      scale: { x: 1, y: -1 },
      parentAngle: 0,
      view: { angle: 0, flipX: false, flipY: true },
      expected: { x: 6, y: 487 },
    },
  ])('upright contract: $case', ({
    placement = 'left-top',
    margin = { left: 6, right: 8, top: 4, bottom: 10 },
    size = { width: 20, height: 9 },
    scale,
    parentAngle,
    view,
    expected,
  }) => {
    const component = createComponent();
    component.props.placement = placement;
    component.props.margin = margin;
    component.width = size.width;
    component.height = size.height;
    component.scale = scale;
    setUprightContainer(component, parentAngle);
    component.store.view = view;

    expect(place(component)).toEqual(expected);
  });

  it('treats attrs.rotation like attrs.angle when resolving placement remap', () => {
    const withAngle = createComponent();
    withAngle.props.placement = 'left-top';
    withAngle.props.attrs = { angle: 90 };
    setUprightContainer(withAngle, 0);
    withAngle.store.view = { angle: 0, flipX: false, flipY: false };

    const withRotation = createComponent();
    withRotation.props.placement = 'left-top';
    withRotation.props.attrs = { rotation: Math.PI / 2 };
    setUprightContainer(withRotation, 0);
    withRotation.store.view = { angle: 0, flipX: false, flipY: false };

    expect(place(withRotation)).toEqual(place(withAngle));
  });
});
