import { Container } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../utils/validator';
import { Margin } from './data-schema/component-schema';

export const parseMargin = (margin) => {
  if (isValidationError(validate(margin, Margin))) {
    throw new Error(
      'Invalid margin format. Expected format: "top [right] [bottom] [left]" with numeric values.',
    );
  }

  const values = margin.trim().split(/\s+/).map(Number);
  const [top, right = top, bottom = top, left = right] = values;
  return { top, right, bottom, left };
};

export const createContainer = ({
  type,
  id,
  label,
  metadata,
  isRenderGroup = false,
}) => {
  const container = new Container({ isRenderGroup });
  container.eventMode = 'static';
  Object.assign(container, { type, id, label, metadata });
  container.config = { type, id, label, metadata };
  return container;
};
