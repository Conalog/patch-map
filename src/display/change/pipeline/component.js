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
    keys: ['texture'],
    handler: (component, config) => {
      change.changeTexture(component, config);
    },
  },
  asset: {
    keys: ['asset'],
    handler: (component, config) => {
      change.changeAsset(component, config);
    },
  },
  textureTransform: {
    keys: ['texture'],
    handler: (component) => {
      change.changeTextureTransform(component);
    },
  },
  animation: {
    keys: ['animation'],
    handler: (component, config) => {
      change.changeAnimation(component, config);
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
    handler: (component, config) => {
      change.changeText(component, config);
      change.changePlacement(component, config); // Ensure placement is updated after text change
    },
  },
  textStyle: {
    keys: ['style', 'margin'],
    handler: (component, config) => {
      change.changeTextStyle(component, config);
      change.changePlacement(component, config); // Ensure placement is updated after style change
    },
  },
};
