import { parseMargin } from '../utils';

export const changePlacement = (
  component,
  { placement = component.config.placement, margin = component.config.margin },
) => {
  if (!placement || !margin) return;

  const directionMap = {
    left: { h: 'left', v: 'center' },
    right: { h: 'right', v: 'center' },
    top: { h: 'center', v: 'top' },
    bottom: { h: 'center', v: 'bottom' },
    center: { h: 'center', v: 'center' },
  };
  const marginObj = parseMargin(margin);

  const [first, second] = placement.split('-');
  const directions = second ? { h: first, v: second } : directionMap[first];

  component.visible = false;
  const x = getHorizontalPosition(component, directions.h, marginObj);
  const y = getVerticalPosition(component, directions.v, marginObj);
  component.position.set(x, y);
  component.visible = true;

  function getHorizontalPosition(component, alignment, margin) {
    const parentWidth = component.parent.size.width;
    const positions = {
      left: margin.left,
      right: parentWidth - component.width - margin.right,
      center: (parentWidth - component.width) / 2,
    };
    return positions[alignment] ?? positions.center;
  }

  function getVerticalPosition(component, alignment, margin) {
    const parentHeight = component.parent.size.height;
    const positions = {
      top: margin.top,
      bottom: parentHeight - component.height - margin.bottom,
      center: (parentHeight - component.height) / 2,
    };
    return positions[alignment] ?? positions.center;
  }
};
