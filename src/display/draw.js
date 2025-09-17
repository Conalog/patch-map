import Element from './elements/Element';
import { newElement } from './elements/creator';

export const draw = (context, data) => {
  const { world } = context;
  destroyChildren(world);
  render(world, data);

  function render(parent, data) {
    for (const changes of data) {
      const element = newElement(changes.type, context);
      element.update(changes);
      parent.addChild(element);
    }
  }
};

const destroyChildren = (parent) => {
  const children = [...parent.children];
  for (const child of children) {
    if (child instanceof Element) {
      child.destroy({ children: true });
    }
  }
};
