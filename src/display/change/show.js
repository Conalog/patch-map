import { mergeProps } from './utils';

export const changeShow = (object, { show }) => {
  object.renderable = show;
  mergeProps(object, { show });
};
