import gsap from 'gsap';
import { changePlacement } from './placement';
import { isConfigMatch, killTweensOf, updateConfig } from './utils';

export const changePercentSize = (
  object,
  {
    size = object.config.size,
    margin = object.config.margin,
    animationDuration = object.config.animationDuration,
  },
  { animationContext },
) => {
  if (
    isConfigMatch(object, 'size', size) &&
    isConfigMatch(object, 'margin', margin)
  ) {
    return;
  }

  const {
    width = object.config.size.width,
    height = object.config.size.height,
  } = size;

  if (width.unit === '%') {
    changeWidth(object, width, margin);
  }
  if (height.unit === '%') {
    changeHeight(object, height, margin);
  }
  updateConfig(object, {
    size,
    margin,
    animationDuration,
  });

  function changeWidth(component, width, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * (width.value / 100);
  }

  function changeHeight(component, height) {
    const maxHeight =
      component.parent.size.height - (margin.top + margin.bottom);

    if (object.config.animation) {
      animationContext.add(() => {
        killTweensOf(component);
        gsap.to(component, {
          pixi: { height: maxHeight * (height.value / 100) },
          duration: animationDuration / 1000,
          ease: 'power2.inOut',
          onUpdate: () => changePlacement(component, {}),
        });
      });
    } else {
      component.height = maxHeight * height;
    }
  }
};
