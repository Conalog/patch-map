import { Grid, Group, Item, Relations } from './elements';

export const elementCreator = {
  group: Group,
  grid: Grid,
  item: Item,
  relations: Relations,
};

export const draw = (context, data) => {
  const { viewport } = context;
  destroyChildren(viewport);
  render(viewport, data);

  function render(parent, data) {
    for (const changes of data) {
      const element = new elementCreator[changes.type](context);
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
