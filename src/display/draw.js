import { createGrid } from './elements/grid';
import { createGroup } from './elements/group';
import { createItem } from './elements/item';
import { update } from './update';

export const draw = (viewport, data) => {
  render(viewport, data);

  function render(parent, data) {
    for (const config of data) {
      if (config.type === 'group') {
        const element = createGroup(config);
        element.viewport = viewport;
        parent.addChild(element);

        render(element, config.items);
      } else if (config.type === 'grid') {
        const element = createGrid(config);
        element.viewport = viewport;
        update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
      } else if (config.type === 'item') {
        const element = createItem(config);
        element.viewport = viewport;
        update(null, {
          elements: element,
          changes: config,
        });
        parent.addChild(element);
      }
    }
  }
};
