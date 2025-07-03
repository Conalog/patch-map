import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { Background, Bar, Icon, Text } from '../components';
import { componentSchema } from '../data-schema/component-schema';

export const ComponentCreator = {
  background: Background,
  bar: Bar,
  icon: Icon,
  text: Text,
};

export const updateComponents = (
  item,
  { components: componentConfig },
  options,
) => {
  if (!componentConfig) return;

  const itemComponents = [...item.children];
  for (let changes of componentConfig) {
    const idx = findIndexByPriority(itemComponents, changes);
    let component = null;

    if (idx !== -1) {
      component = itemComponents[idx];
      itemComponents.splice(idx, 1);
    } else {
      changes = validate(changes, componentSchema);
      if (isValidationError(changes)) throw changes;

      component = createComponent(changes);
      if (!component) continue;
      item.addChild(component);
    }

    component.update(changes, options);
  }
};

const createComponent = (config) => {
  const component = new ComponentCreator[config.type]();
  return component;
};
