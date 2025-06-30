import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

export const validateUpdate = (context, changes, schema, options) => {
  const validated = validate(changes, deepPartial(schema));
  if (isValidationError(validated)) throw validated;
  updateObject(
    context,
    validated,
    componentPipeline,
    context.pipelines,
    options,
  );
};
