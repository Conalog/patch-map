import gsap from 'gsap';
import { parseMargin } from '../utils';
import { changePlacement } from './placement';
import { isConfigMatch } from './utils';

export const changePercentSize = (
  component,
  {
    percentWidth = component.config.percentWidth,
    percentHeight = component.config.percentHeight,
    margin = component.config.margin,
    animation = component.config.animation,
    animationDuration = component.config.animationDuration,
  },
) => {
  if (
    isConfigMatch(component, 'percentWidth', percentWidth) &&
    isConfigMatch(component, 'percentHeight', percentHeight) &&
    isConfigMatch(component, 'margin', margin)
  ) {
    return;
  }

  const marginObj = parseMargin(margin);
  if (percentWidth) changeWidth(component, percentWidth, marginObj);
  if (percentHeight) changeHeight(component, percentHeight, marginObj);

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * percentWidth;
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.size.height - (marginObj.top + marginObj.bottom);

    if (animation) {
      gsap.to(component, {
        pixi: { height: maxHeight * percentHeight },
        duration: animationDuration / 1000,
        ease: 'power2.inOut',
        onUpdate: () => changePlacement(component, {}),
      });
    } else {
      component.height = maxHeight * percentHeight;
    }
  }
};
