import { hasUprightContentOrientation } from './content-orientation';
import { mapScreenDirection } from './screen-direction';
import { getAngleWithinWorld } from './world-angle';

const DIRECTION_MAP = {
  left: { h: 'left', v: 'center' },
  right: { h: 'right', v: 'center' },
  top: { h: 'center', v: 'top' },
  bottom: { h: 'center', v: 'bottom' },
  center: { h: 'center', v: 'center' },
};

const resolvePlacementAngleOffset = (component) => {
  const parentAngle = Number(getAngleWithinWorld(component) ?? 0);
  const localAngle = Number(component?.props?.attrs?.angle);
  const localRotation = Number(component?.props?.attrs?.rotation);
  const localBaseAngle = Number.isFinite(localAngle)
    ? localAngle
    : Number.isFinite(localRotation)
      ? (localRotation * 180) / Math.PI
      : 0;
  if (!Number.isFinite(parentAngle) || !Number.isFinite(localBaseAngle)) {
    return 0;
  }
  return parentAngle + localBaseAngle;
};

const parsePercentDimension = (dimension) => {
  if (typeof dimension === 'string') {
    const trimmed = dimension.trim();
    if (!trimmed.endsWith('%')) return null;
    const parsed = Number(trimmed.slice(0, -1));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (dimension && typeof dimension === 'object' && dimension.unit === '%') {
    const parsed = Number(dimension.value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const targetsFullWidth = (component) => {
  const size = component?.props?.size;
  const widthPercent = parsePercentDimension(size?.width);
  const heightPercent = parsePercentDimension(size?.height);
  if (widthPercent == null || heightPercent == null) return false;
  return Math.abs(widthPercent - 100) < 1e-7;
};

const resolveScreenStateForPlacement = (component) => {
  const view = component?.store?.view;
  if (!view) return null;

  const angleOffset = resolvePlacementAngleOffset(component);
  const viewAngle = Number(view.angle ?? 0);
  if (!Number.isFinite(viewAngle) || Math.abs(angleOffset) < 1e-7) {
    return view;
  }

  return {
    ...view,
    angle: viewAngle + angleOffset,
  };
};

const usesVerticalBasis = (angle) => {
  const radian = (Number(angle ?? 0) * Math.PI) / 180;
  return Math.abs(Math.sin(radian)) > Math.abs(Math.cos(radian));
};

const invertVerticalDirection = (direction) => {
  if (direction === 'top') return 'bottom';
  if (direction === 'bottom') return 'top';
  return direction;
};

const invertHorizontalDirection = (direction) => {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';
  return direction;
};

const remapHorizontalDirection = (
  component,
  viewStateForPlacement,
  direction,
  options = {},
) => {
  const mapped = mapScreenDirection(viewStateForPlacement, direction);
  if (options.ignoreLocalScale === true) {
    return mapped;
  }

  const localScaleX = Number(component?.scale?.x ?? 1);
  if (localScaleX < 0) {
    return invertHorizontalDirection(mapped);
  }

  return mapped;
};

const remapVerticalDirection = (
  component,
  viewStateForPlacement,
  direction,
  options = {},
) => {
  const mapped = mapScreenDirection(viewStateForPlacement, direction);
  if (options.ignoreLocalScale === true) {
    return mapped;
  }

  const localScaleY = Number(component?.scale?.y ?? 1);
  if (localScaleY < 0) {
    return invertVerticalDirection(mapped);
  }

  return mapped;
};

const getPlacementDirections = (placement) => {
  const [first, second] = placement.split('-');
  return second ? { h: first, v: second } : DIRECTION_MAP[first];
};

const clonePlacementMargin = (margin) => ({
  top: margin?.top ?? 0,
  right: margin?.right ?? 0,
  bottom: margin?.bottom ?? 0,
  left: margin?.left ?? 0,
});

const swapVerticalMargin = (margin) => ({
  ...margin,
  top: margin.bottom,
  bottom: margin.top,
});

const swapHorizontalMargin = (margin) => ({
  ...margin,
  left: margin.right,
  right: margin.left,
});

const resolveFollowItemVerticalFrame = (
  component,
  directions,
  margin,
  viewStateForPlacement,
) => {
  if (!targetsFullWidth(component)) {
    return { directions, margin };
  }

  const nextVertical = remapVerticalDirection(
    component,
    viewStateForPlacement,
    directions.v,
  );

  return {
    directions: { ...directions, v: nextVertical },
    margin: nextVertical === directions.v ? margin : swapVerticalMargin(margin),
  };
};

const resolveUprightCornerDirections = (
  component,
  directions,
  viewStateForPlacement,
) => {
  const placementAngleOffset = resolvePlacementAngleOffset(component);
  const oddQuarterTurnBasis = usesVerticalBasis(placementAngleOffset);
  const singleFlip =
    Boolean(viewStateForPlacement.flipX) !==
    Boolean(viewStateForPlacement.flipY);
  const mappedHorizontal = remapHorizontalDirection(
    component,
    viewStateForPlacement,
    directions.h,
    { ignoreLocalScale: true },
  );
  const mappedVertical = remapVerticalDirection(
    component,
    viewStateForPlacement,
    directions.v,
    { ignoreLocalScale: true },
  );
  const flipAdjustedHorizontal = viewStateForPlacement.flipX
    ? invertHorizontalDirection(mappedHorizontal)
    : mappedHorizontal;
  const flipAdjustedVertical = viewStateForPlacement.flipY
    ? invertVerticalDirection(mappedVertical)
    : mappedVertical;

  return {
    h:
      oddQuarterTurnBasis && singleFlip
        ? invertHorizontalDirection(flipAdjustedHorizontal)
        : flipAdjustedHorizontal,
    v:
      oddQuarterTurnBasis && singleFlip
        ? invertVerticalDirection(flipAdjustedVertical)
        : flipAdjustedVertical,
  };
};

const resolveDirectionsForViewState = (
  component,
  directions,
  viewStateForPlacement,
  uprightContent,
) => {
  const uprightCornerAnchor =
    uprightContent &&
    directions.h &&
    directions.h !== 'center' &&
    directions.v &&
    directions.v !== 'center';

  if (uprightCornerAnchor) {
    return resolveUprightCornerDirections(
      component,
      directions,
      viewStateForPlacement,
    );
  }

  return {
    h:
      directions.h && directions.h !== 'center'
        ? remapHorizontalDirection(
            component,
            viewStateForPlacement,
            directions.h,
          )
        : 'center',
    v:
      directions.v && directions.v !== 'center'
        ? remapVerticalDirection(component, viewStateForPlacement, directions.v)
        : 'center',
  };
};

export const resolvePlacementFrame = (component, placement, margin) => {
  const directions = getPlacementDirections(placement);
  const nextMargin = clonePlacementMargin(margin);
  const uprightContent = hasUprightContentOrientation(component);
  const viewStateForPlacement = resolveScreenStateForPlacement(component);

  if (!viewStateForPlacement) {
    return { directions, margin: nextMargin };
  }

  if (!uprightContent && directions.v && directions.v !== 'center') {
    return resolveFollowItemVerticalFrame(
      component,
      directions,
      nextMargin,
      viewStateForPlacement,
    );
  }

  const remappedDirections = resolveDirectionsForViewState(
    component,
    directions,
    viewStateForPlacement,
    uprightContent,
  );

  let remappedMargin = nextMargin;
  if (remappedDirections.h !== directions.h) {
    remappedMargin = swapHorizontalMargin(remappedMargin);
  }
  if (remappedDirections.v !== directions.v) {
    remappedMargin = swapVerticalMargin(remappedMargin);
  }

  return {
    directions: remappedDirections,
    margin: remappedMargin,
  };
};

const calcHorizontalPosition = (layoutContext, align, margin, width) => {
  const { parentWidth, contentWidth, parentPadding } = layoutContext;
  const marginLeft = margin?.left ?? 0;
  const marginRight = margin?.right ?? 0;
  const componentWidth = Number.isFinite(width) ? width : 0;

  if (align === 'left') {
    return parentPadding.left + marginLeft;
  }
  if (align === 'right') {
    return parentWidth - componentWidth - marginRight - parentPadding.right;
  }
  if (align === 'center') {
    const marginWidth = componentWidth + marginLeft + marginRight;
    const blockStartPosition = (contentWidth - marginWidth) / 2;
    return parentPadding.left + blockStartPosition + marginLeft;
  }

  return null;
};

const calcVerticalPosition = (layoutContext, align, margin, height) => {
  const { parentHeight, contentHeight, parentPadding } = layoutContext;
  const marginTop = margin?.top ?? 0;
  const marginBottom = margin?.bottom ?? 0;
  const componentHeight = Number.isFinite(height) ? height : 0;

  if (align === 'top') {
    return parentPadding.top + marginTop;
  }
  if (align === 'bottom') {
    return parentHeight - componentHeight - marginBottom - parentPadding.bottom;
  }
  if (align === 'center') {
    const marginHeight = componentHeight + marginTop + marginBottom;
    const blockStartPosition = (contentHeight - marginHeight) / 2;
    return parentPadding.top + blockStartPosition + marginTop;
  }

  return null;
};

export const calcPlacementPoint = (layoutContext, frame, size) => ({
  x: calcHorizontalPosition(
    layoutContext,
    frame.directions.h,
    frame.margin,
    size.width,
  ),
  y: calcVerticalPosition(
    layoutContext,
    frame.directions.v,
    frame.margin,
    size.height,
  ),
});
