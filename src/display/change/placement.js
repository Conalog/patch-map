import { mergeProps } from './utils';

export const changePlacement = (
  object,
  { placement = object.placement, margin = object.margin },
) => {
  if (!placement || !margin) return;

  const directionMap = {
    left: { h: 'left', v: 'center' },
    right: { h: 'right', v: 'center' },
    top: { h: 'center', v: 'top' },
    bottom: { h: 'center', v: 'bottom' },
    center: { h: 'center', v: 'center' },
  };

  const [first, second] = placement.split('-');
  const directions = second ? { h: first, v: second } : directionMap[first];

  object.visible = false;
  const x = getHorizontalPosition(object, directions.h, margin);
  const y = getVerticalPosition(object, directions.v, margin);
  object.position.set(x, y);
  object.visible = true;
  mergeProps(object, { placement, margin });

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
