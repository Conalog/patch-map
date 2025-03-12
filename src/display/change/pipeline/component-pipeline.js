import * as change from '..';
import { pipeline } from './pipeline';

export const componentPipeline = {
  ...pipeline,
  tint: {
    keys: ['tint'],
    handler: change.changeTint,
  },
  texture: {
    keys: ['asset', 'texture'],
    handler: (component, options) => {
      change.changeTexture(component, options);
    },
  },
  textureTransform: {
    keys: ['texture'],
    handler: (component, options) => {
      change.changeTexture(component, options);
      change.changeTransform(component);
    },
  },
  percentSize: {
    keys: ['percentWidth', 'percentHeight', 'margin'],
    handler: (component, options) => {
      change.changePercentSize(component, options);
      change.changePlacement(component, {});
    },
  },
  size: {
    keys: ['size'],
    handler: (component, options) => {
      change.changeSize(component, options);
      change.changePlacement(component, {});
    },
  },
  placement: {
    keys: ['placement', 'margin'],
    handler: change.changePlacement,
  },
  text: {
    keys: ['text', 'split'],
    handler: change.changeText,
  },
  textStyle: {
    keys: ['style', 'margin'],
    handler: change.changeTextStyle,
  },
};
