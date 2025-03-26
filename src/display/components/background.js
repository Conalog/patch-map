import { NineSliceSprite, Texture } from 'pixi.js';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

export const backgroundComponent = () => {
  const component = new NineSliceSprite({ texture: Texture.WHITE });
  component.type = 'background';
  component.id = null;
  component.config = {};
  return component;
};

const pipelineKeys = ['show', 'texture', 'textureTransform', 'tint'];
export const updateBackgroundComponent = (component, config, options) => {
  updateObject(component, config, componentPipeline, pipelineKeys, options);
};
