import { NineSliceSprite, Texture } from 'pixi.js';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

export const barComponent = () => {
  const component = new NineSliceSprite({ texture: Texture.WHITE });
  component.type = 'bar';
  component.id = null;
  component.config = {};
  return component;
};

const pipelineKeys = [
  'animation',
  'show',
  'texture',
  'tint',
  'percentSize',
  'placement',
];
export const updateBarComponent = (component, config, options) => {
  updateObject(component, config, componentPipeline, pipelineKeys, options);
};
