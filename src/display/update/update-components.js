import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { Background, Bar, Icon, Text } from '../components';

const Creator = {
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
  for (const changes of componentConfig) {
    const idx = findIndexByPriority(itemComponents, changes);
    let component = null;

    if (idx !== -1) {
      component = itemComponents[idx];
      itemComponents.splice(idx, 1);
    } else {
      component = createComponent(changes);
      if (!component) continue;
      item.addChild(component);
    }

    component.update(changes, options);
  }
};

const createComponent = (config) => {
  const component = new Creator[config.type]();
  component.config = { ...component.config };
  return component;
};
