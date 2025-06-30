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
    for (const config of data) {
      const element = new Creator[config.type](viewport);
      update(context, { elements: element, changes: config });
      parent.addChild(element);

      if (config.type === 'group') {
        render(element, config.children);
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
