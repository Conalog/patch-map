import * as change from './change';

export const pipeline = {
  show: {
    keys: ['show'],
    handler: change.changeShow,
  },
};
