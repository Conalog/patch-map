import * as change from '..';
import { Commands } from '../../../command';
import { basePipeline } from './base';
import { createCommandHandler } from './utils';

export const componentPipeline = {
  ...basePipeline,
  tint: {
    keys: ['color', 'tint'],
    handler: createCommandHandler(Commands.TintCommand, change.changeTint),
  },
  texture: {
    keys: ['texture'],
    handler: (component, config, options) => {
      change.changeTexture(component, config, options);
    },
  },
  asset: {
    keys: ['asset'],
    handler: (component, config, options) => {
      change.changeAsset(component, config, options);
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
    handler: (component, config, options) => {
      change.changePercentSize(component, config, options);
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
    handler: (component, config, options) => {
      change.changeTextStyle(component, config, options);
      change.changePlacement(component, config); // Ensure placement is updated after style change
    },
  },
};
