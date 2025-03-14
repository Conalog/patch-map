import { updateConfig } from './utils';

export const changeShow = (object, { show }) => {
  object.renderable = show;
  updateConfig(object, { show });
};
