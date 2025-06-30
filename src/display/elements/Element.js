import { Viewport } from 'pixi-viewport';
import { Container } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { elementPipeline } from '../change/pipeline/element';
import { updateObject } from '../update/update-object';

const createSchema = z.object({
  type: z.string(),
  viewport: z.instanceof(Viewport),
  isRenderGroup: z.boolean().default(false),
  pipelines: z.array(z.string()).default([]),
});

export default class Element extends Container {
  /**
   * The type of the element. This property is read-only.
   * @private
   * @type {string}
   */
  #type;

  #pipelines;

  constructor(options) {
    const validated = validate(options, createSchema);
    if (isValidationError(validated)) throw validated;
    const { type, pipelines, ...rest } = validated;
    super(Object.assign(rest, { eventMode: 'static' }));
    this.#type = type;
    this.#pipelines = pipelines;
  }

  /**
   * Returns the type of the element.
   * @returns {string}
   */
  get type() {
    return this.#type;
  }

  get pipelines() {
    return this.#pipelines;
  }

  update(changes, schema, options) {
    const validated = validate(changes, deepPartial(schema));
    if (isValidationError(validated)) throw validated;
    updateObject(this, validated, elementPipeline, this.pipelines, options);
  }
}
