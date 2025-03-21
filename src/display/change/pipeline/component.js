import * as change from '..';
import { Commands } from '../../../command';
import { pipeline } from './base';
import { createCommandHandler } from './utils';

export const componentPipeline = {
  ...pipeline,
  tint: {
    keys: ['color', 'tint'],
    handler: createCommandHandler(Commands.TintCommand, change.changeTint),
  },
  texture: {
    keys: ['asset', 'texture'],
    handler: (component, config) => {
      change.changeTexture(component, config);
    },
  },
  textureTransform: {
    keys: ['texture'],
    handler: (component, config) => {
      change.changeTexture(component, config);
      change.changeTextureTransform(component);
    },
  },
  percentSize: {
    keys: ['percentWidth', 'percentHeight', 'margin'],
    handler: (component, config) => {
      change.changePercentSize(component, config);
      change.changePlacement(component, {});
    },
  },
  size: {
    keys: ['size'],
    handler: (component, config) => {
      change.changeSize(component, config);
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
