import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { validateUpdate } from './validate-update';

export class Text extends BitmapText {
  #type;

  #pipelines;

  constructor() {
    super({ text: '' });
    this.#type = 'text';
    this.#pipelines = ['show', 'text', 'textStyle', 'placement'];
  }

  get type() {
    return this.#type;
  }

  get pipelines() {
    return this.#pipelines;
  }

  update(changes, options) {
    validateUpdate(this, changes, textSchema, options);
  }
}
