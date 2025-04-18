import { Sprite, Texture } from 'pixi.js';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

export const iconComponent = () => {
  const component = new Sprite(Texture.WHITE);
  component.type = 'icon';
  component.id = null;
  component.config = {};
  return component;
};

const pipelineKeys = ['show', 'asset', 'size', 'tint', 'placement'];
export const updateIconComponent = (component, config, options) => {
  updateObject(component, config, componentPipeline, pipelineKeys, options);
};
