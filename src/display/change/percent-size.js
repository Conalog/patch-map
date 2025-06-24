import gsap from 'gsap';
import { changePlacement } from './placement';
import { isConfigMatch, killTweensOf, updateConfig } from './utils';

export const changePercentSize = (
  object,
  {
    percentWidth = object.config.percentWidth,
    percentHeight = object.config.percentHeight,
    margin = object.config.margin,
    animationDuration = object.config.animationDuration,
  },
  { animationContext },
) => {
  if (
    isConfigMatch(object, 'percentWidth', percentWidth) &&
    isConfigMatch(object, 'percentHeight', percentHeight) &&
    isConfigMatch(object, 'margin', margin)
  ) {
    return;
  }

  if (Number.isFinite(percentWidth)) {
    changeWidth(object, percentWidth, margin);
  }
  if (Number.isFinite(percentHeight)) {
    changeHeight(object, percentHeight, margin);
  }
  updateConfig(object, {
    percentWidth,
    percentHeight,
    margin,
    animationDuration,
  });

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * percentWidth;
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.size.height - (margin.top + margin.bottom);

    if (object.config.animation) {
      animationContext.add(() => {
        killTweensOf(component);
        gsap.to(component, {
          pixi: { height: maxHeight * percentHeight },
          duration: animationDuration / 1000,
          ease: 'power2.inOut',
          onUpdate: () => changePlacement(component, {}),
        });
      });
    } else {
      component.height = maxHeight * percentHeight;
    }
  }
};
