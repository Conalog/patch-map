import { NineSliceSprite, Texture } from 'pixi.js';
import { backgroundSchema } from '../data-schema/component-schema';
import { validateUpdate } from './validate-update';

export class Background extends NineSliceSprite {
  #type;

  #pipelines;

  constructor() {
    super({ texture: Texture.WHITE });
    this.#type = 'background';
    this.#pipelines = ['show', 'texture', 'textureTransform', 'tint'];
  }

  get type() {
    return this.#type;
  }

  get pipelines() {
    return this.#pipelines;
  }

  update(changes, options) {
    validateUpdate(this, changes, backgroundSchema, options);
  }
}
