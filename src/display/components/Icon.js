import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import { validateUpdate } from './validate-update';

export class Icon extends Sprite {
  #type;

  #pipelines;

  constructor() {
    super({ texture: Texture.WHITE });
    this.#type = 'icon';
    this.#pipelines = ['show', 'asset', 'size', 'tint', 'placement'];
  }

  get type() {
    return this.#type;
  }

  get pipelines() {
    return this.#pipelines;
  }

  update(changes, options) {
    validateUpdate(this, changes, iconSchema, options);
  }
}
