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
    keys: ['source'],
    handler: (component, config, options) => {
      change.changeTexture(component, config, options);
    },
  },
  asset: {
    keys: ['source'],
    handler: (component, config, options) => {
      change.changeAsset(component, config, options);
    },
  },
  textureTransform: {
    keys: ['source'],
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
  barSize: {
    keys: ['size', 'margin'],
    handler: (component, config, options) => {
      change.changeBarSize(component, config, options);
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
    handler: (component, config, options) => {
      change.changeText(component, config, options);
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
