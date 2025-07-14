import { fromError } from 'zod-validation-error';
import { mapDataSchema } from '../display/data-schema/element-schema';

export const validate = (data, schema) => {
  try {
    return schema.parse(data);
  } catch (err) {
    const validationError = fromError(err);
    return validationError;
  }
};

export const validateMapData = (data) => validate(data, mapDataSchema);
