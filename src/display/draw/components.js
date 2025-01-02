import { barComponent } from '../components/bar';
import { iconComponent } from '../components/icon';
import { textComponent } from '../components/text';

export const drawComponents = (frame, componentOptions, theme) => {
  for (const [type, option] of Object.entries(componentOptions)) {
    if (type in frame.components) continue;

    if (type === 'bar' && option.name) {
      barComponent(option.name, theme, {
        label: frame.id,
        frame,
        parent: frame.parent,
        zIndex: option.zIndex,
        color: option.color,
        percentHeight: option.percentHeight,
        minPercentHeight: option.minPercentHeight,
      });
    } else if (type === 'icon' && option.name) {
      iconComponent(option.name, theme, {
        label: frame.id,
        frame,
        parent: frame.parent,
        zIndex: option.zIndex,
        color: option.color,
        size: option.size,
      });
    } else if (type === 'text') {
      textComponent(option.content ?? '', theme, {
        label: frame.id,
        frame,
        parent: frame.parent,
        zIndex: option.zIndex,
        style: option.style,
        split: option.split,
        margin: option.margin,
      });
    }
  }
};
