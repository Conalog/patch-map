import { newElement } from './elements/creator';

export const draw = (context, data) => {
  const { viewport } = context;
  destroyChildren(viewport);
  render(viewport, data);

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
    child.destroy({ children: true });
  }
};
