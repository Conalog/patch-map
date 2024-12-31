import { barComponent } from '../components/bar';
import { iconComponent } from '../components/icon';

export const drawComponents = (frame, componentOptions, theme) => {
  for (const [type, option] of Object.entries(componentOptions)) {
    if (!option.name || type in frame.components) continue;

    if (type === 'icon') {
      iconComponent(option.name, theme, {
        label: frame.id,
        frame,
        parent: frame.parent,
        color: option.color,
        size: option.size,
        zIndex: option.zIndex,
      });
    } else if (type === 'bar') {
      barComponent(option.name, theme, {
        label: frame.id,
        frame,
        parent: frame.parent,
        color: option.color,
        zIndex: option.zIndex,
        percentHeight: option.percentHeight,
        minPercentHeight: option.minPercentHeight,
      });
    }
  }
};
