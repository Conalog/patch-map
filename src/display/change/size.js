import { changePlacement } from './placement';

export const changeSize = (component, { size }) => {
  component.setSize(size);
  changePlacement(component, {});
};
