import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { elementTypes } from '../data-schema/element-schema';
import { elementCreator } from '../draw';
import { UPDATE_STAGES } from './constants';

const KEYS = ['children'];

export const Childrenable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyChildren(relevantChanges) {
      const { children } = relevantChanges;

      const elements = [...this.children];
      for (let childChange of children) {
        const idx = findIndexByPriority(elements, childChange);
        let element = null;

        if (idx !== -1) {
          element = elements[idx];
          elements.splice(idx, 1);
        } else {
          childChange = validate(childChange, elementTypes);
          if (isValidationError(childChange)) throw childChange;

          element = new elementCreator[childChange.type](this.context);
          this.addChild(element);
        }
        element.update(childChange);
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyChildren,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};
