const hasVisualTransformState = (component) => {
  const angle = Number(component?.angle ?? 0);
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const hasRotation =
    normalizedAngle > 1e-7 && Math.abs(normalizedAngle - 360) > 1e-7;
  const hasFlip =
    Number(component?.scale?.x ?? 1) < 0 ||
    Number(component?.scale?.y ?? 1) < 0;
  const hasPivotOffset =
    Math.abs(Number(component?.pivot?.x ?? 0)) > 1e-7 ||
    Math.abs(Number(component?.pivot?.y ?? 0)) > 1e-7;
  return hasRotation || hasFlip || hasPivotOffset;
};

const shouldApplyPlacementOffset = (
  component,
  effectiveWidth,
  layoutContext,
) => {
  const avoidsVisualOffsetWhenOverflowing =
    component.constructor?.avoidsVisualOffsetWhenOverflowing === true;
  if (!avoidsVisualOffsetWhenOverflowing) {
    return true;
  }

  return !(
    Number.isFinite(effectiveWidth) &&
    effectiveWidth > layoutContext.contentWidth &&
    !hasVisualTransformState(component)
  );
};

const calcVisualOffset = (component) => {
  const bounds = component.getLocalBounds();
  const pivot = component.pivot || { x: 0, y: 0 };
  const scale = component.scale || { x: 1, y: 1 };
  const angle = (component.angle || 0) * (Math.PI / 180);
  const scaleX = scale.x ?? 1;
  const scaleY = scale.y ?? 1;

  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let visualLeftMin = Number.POSITIVE_INFINITY;
  let visualTopMin = Number.POSITIVE_INFINITY;

  for (const corner of corners) {
    const lx = (corner.x - pivot.x) * scaleX;
    const ly = (corner.y - pivot.y) * scaleY;

    const rotatedX = lx * cos - ly * sin;
    const rotatedY = lx * sin + ly * cos;

    if (rotatedX < visualLeftMin) visualLeftMin = rotatedX;
    if (rotatedY < visualTopMin) visualTopMin = rotatedY;
  }

  return {
    offsetX: Number.isFinite(visualLeftMin) ? visualLeftMin : 0,
    offsetY: Number.isFinite(visualTopMin) ? visualTopMin : 0,
  };
};

export const resolvePlacementOffset = (
  component,
  effectiveWidth,
  layoutContext,
) => {
  if (!shouldApplyPlacementOffset(component, effectiveWidth, layoutContext)) {
    return { offsetX: 0, offsetY: 0 };
  }

  return calcVisualOffset(component);
};
