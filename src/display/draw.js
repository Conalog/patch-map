import { newElement } from './elements/creator';
import Element from './elements/Element';

export const draw = (context, data) => {
  const { viewport } = context;
  destroyChildren(viewport);
  render(viewport, data);

  function render(parent, data) {
    for (const changes of data) {
      const element = newElement(changes.type, context);
      element.apply(changes);
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
