import { barComponent } from '../components/bar';
import { iconComponent } from '../components/icon';
import { textComponent } from '../components/text';

export const drawComponents = (frame, componentOptions = {}, theme = {}) => {
  for (const [compoType, compoOpt] of Object.entries(componentOptions)) {
    if (compoOpt.show) {
      if (compoType in frame.components) {
        frame.components[compoType].renderable = true;
      } else {
        if (compoType === 'icon') {
          const icon = iconComponent(compoOpt.name, theme, {
            label: frame.label,
            frame,
            parent: frame.parent,
            // tint: compoOpt.tint,
            color: compoOpt.color,
          });
          frame.components = { ...frame.components, icon };
        } else if (compoType === 'bar') {
          const bar = barComponent(compoOpt.name, frame, theme, {
            label: frame.label,
            parent: frame.parent,
            minPercentHeight: compoOpt.minPercentHeight,
            percentHeight: compoOpt.percentHeight,
            tint: compoOpt.tint,
            color: compoOpt.color,
          });
          frame.components = { ...frame.components, bar };
        } else if (compoType === 'text') {
          const text = textComponent('', { label });
          frame.components = { ...frame.components, text };
        }
      }
    } else if (!compoOpt.show && compoType in frame.components) {
      frame.components[compoType].renderable = false;
    }
  }
};
