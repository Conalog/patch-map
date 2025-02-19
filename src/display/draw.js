import { createGrid } from './elements/grid';
import { createGroup } from './elements/group';
import { createItem } from './elements/item';
import { createRelations } from './elements/relations';
import { update } from './update';

export const draw = async (viewport, data) => {
  destroyChildren(viewport);
  await render(viewport, data);

  async function render(parent, data) {
    for (const config of data) {
      if (config.type === 'group') {
        const element = createGroup(config);
        element.viewport = viewport;
        await update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
        await render(element, config.items);
      } else if (config.type === 'grid') {
        const element = createGrid(config);
        element.viewport = viewport;
        await update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
      } else if (config.type === 'item') {
        const element = createItem(config);
        element.viewport = viewport;
        await update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
      } else if (config.type === 'relations') {
        const element = createRelations({ viewport, ...config });
        element.viewport = viewport;
        await update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
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
