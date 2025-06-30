import { Container } from 'pixi.js';

export const createElement = ({ type, viewport, isRenderGroup = false }) => {
  return new Element({ type, viewport, isRenderGroup, eventMode: 'static' });
};

export class Element extends Container {
  /**
   * The type of the element. This property is read-only.
   * @private
   * @type {string}
   */
  #type;

  constructor(options) {
    const { type, ...rest } = options;
    super(rest);
    this.#type = type;
  }

  /**
   * Returns the type of the element.
   * @returns {string}
   */
  get type() {
    return this.#type;
  }
}
