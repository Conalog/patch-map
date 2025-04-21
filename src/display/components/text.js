import { BitmapText } from 'pixi.js';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

export const textComponent = () => {
  const component = new BitmapText({ text: '' });
  component.type = 'text';
  component.id = null;
  component.config = {};
  return component;
};

const pipelineKeys = ['show', 'text', 'textStyle', 'placement'];
export const updateTextComponent = (component, config, options) => {
  updateObject(component, config, componentPipeline, pipelineKeys, options);
};
