import { updateComponents } from '../components/update-components';
import * as change from './change';
import { pipeline } from './pipeline';

export const elementPipeline = {
  ...pipeline,
  position: {
    keys: ['position'],
    handler: change.changePosition,
  },
  gridComponents: {
    keys: ['components'],
    handler: (element, options) => {
      for (const cell of element.children) {
        updateComponents(cell, options);
      }
    },
  },
  components: {
    keys: ['components'],
    handler: updateComponents,
  },
  links: {
    keys: ['links'],
    handler: change.changeLinks,
  },
  strokeStyle: {
    keys: ['strokeStyle'],
    handler: change.changeStrokeStyle,
  },
};
