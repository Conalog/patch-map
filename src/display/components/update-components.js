import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/vaildator';
import { componentSchema } from '../data-schema/component-schema';
import { backgroundComponent, updateBackgroundComponent } from './background';
import { barComponent, updateBarComponent } from './bar';
import { iconComponent, updateIconComponent } from './icon';
import { textComponent, updateTextComponent } from './text';

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

export const updateComponents = (item, { components }) => {
  if (!components) return;

  const children = [...item.children];
  for (let config of components) {
    const index = children.findIndex((child) =>
      matchValue('type', child, config),
    );

    let component = null;
    if (index === -1) {
      config = validate(config, componentSchema);
      if (isValidationError(config)) throw config;
      component = componentFn[config.type].create({
        ...config,
        ...item.size,
      });
      component.config = { ...component.config };
      if (component) {
        item.addChild(component);
      }
    } else {
      component = children[index];
      if (component) children.splice(index, 1);
    }

    if (component) {
      componentFn[component.type].update(component, {
        ...config,
      });
    }
  }

  function matchValue(key, child, config) {
    return config[key] ? child[key] === config[key] : true;
  }
};
