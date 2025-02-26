import { createGrid } from './elements/grid';
import { createGroup } from './elements/group';
import { createItem } from './elements/item';
import { createRelations } from './elements/relations';
import { update } from './update';

export const draw = (viewport, data) => {
  destroyChildren(viewport);
  render(viewport.parent, data);

  function render(parent, data) {
    for (const config of data) {
      switch (config.type) {
        case 'group': {
          const element = createGroup(config);
          element.viewport = viewport;
          update(null, {
            elements: element,
            changes: config,
          });
          parent.addChild(element);
          render(element, config.items);
          break;
        }
        case 'grid': {
          const element = createGrid(config);
          element.viewport = viewport;
          update(null, {
            elements: element,
            changes: config,
          });
          parent.addChild(element);
          break;
        }
        case 'item': {
          const element = createItem(config);
          element.viewport = viewport;
          update(null, {
            elements: element,
            changes: config,
          });
          parent.addChild(element);
          break;
        }
        case 'relations': {
          const element = createRelations({ viewport, ...config });
          element.viewport = viewport;
          update(null, {
            elements: element,
            changes: config,
          });
          parent.addChild(element);
          break;
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
