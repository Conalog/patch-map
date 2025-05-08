import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import {
  backgroundComponent,
  updateBackgroundComponent,
} from '../components/background';
import { barComponent, updateBarComponent } from '../components/bar';
import { iconComponent, updateIconComponent } from '../components/icon';
import { textComponent, updateTextComponent } from '../components/text';
import { componentSchema } from '../data-schema/component-schema';

const componentFn = {
  background: {
    create: backgroundComponent,
    update: updateBackgroundComponent,
  },
  icon: {
    create: iconComponent,
    update: updateIconComponent,
  },
  bar: {
    create: barComponent,
    update: updateBarComponent,
  },
  text: {
    create: textComponent,
    update: updateTextComponent,
  },
};

export const updateComponents = (
  item,
  { components: componentConfig },
  options,
) => {
  if (!componentConfig) return;

  const itemComponents = [...item.children];
  for (let config of componentConfig) {
    const idx = findIndexByPriority(itemComponents, config);
    let component = null;

    if (idx !== -1) {
      component = itemComponents[idx];
      itemComponents.splice(idx, 1);
    } else {
      config = validate(config, componentSchema);
      if (isValidationError(config)) throw config;

      component = createComponent(config);
      if (!component) continue;
      item.addChild(component);
    }

    componentFn[component.type].update(component, { ...config }, options);
  }
};

const createComponent = (config) => {
  const component = componentFn[config.type].create({ ...config });
  component.config = { ...component.config };
  return component;
};
