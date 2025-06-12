import { createGrid } from './elements/grid';
import { createGroup } from './elements/group';
import { createItem } from './elements/item';
import { createRelations } from './elements/relations';
import { update } from './update/update';

const elementcreators = {
  group: createGroup,
  grid: createGrid,
  item: createItem,
  relations: createRelations,
};

export const draw = (context, data) => {
  const { viewport } = context;
  destroyChildren(viewport);
  render(viewport, data);

  function render(parent, data) {
    for (const config of data) {
      const creator = elementcreators[config.type];
      if (creator) {
        const element = creator(config);
        element.viewport = viewport;
        update(context, { elements: element, changes: config });
        parent.addChild(element);

        if (config.type === 'group') {
          render(element, config.items);
        }
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
