import { NineSliceSprite, Texture } from 'pixi.js';
import { barSchema } from '../data-schema/component-schema';
import { validateUpdate } from './validate-update';

export class Bar extends NineSliceSprite {
  #type;

  #pipelines;

  constructor() {
    super({ texture: Texture.WHITE });
    this.#type = 'bar';
    this.#pipelines = [
      'animation',
      'show',
      'texture',
      'tint',
      'barSize',
      'placement',
    ];
  }

  get type() {
    return this.#type;
  }

  get pipelines() {
    return this.#pipelines;
  }

  update(changes, options) {
    validateUpdate(this, changes, barSchema, options);
  }
}
