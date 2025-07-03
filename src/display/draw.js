import { Grid, Group, Item, Relations } from './elements';
import { update } from './update/update';

const Creator = {
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
      const element = new Creator[changes.type](context);
      update(context, { elements: element, changes });
      parent.addChild(element);

      if (changes.type === 'group') {
        render(element, changes.children);
      }
    }
  }
};

const destroyChildren = (parent) => {
  const children = [...parent.children];
  for (const child of children) {
    child.destroy({ children: true });
  }
};
