import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { elementTypes } from '../data-schema/element-schema';
import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';

const KEYS = ['children'];

export const Childrenable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyChildren(relevantChanges, options) {
      const { children } = relevantChanges;
      let elements = [...this.children];

      if (options.arrayMerge === 'replace') {
        elements.forEach((element) => {
          this.removeChild(element);
          element.destroy({ children: true });
        });
        elements = [];
      }

      for (let childChange of children) {
        const idx = findIndexByPriority(elements, childChange);
        let element = null;

        if (idx !== -1) {
          element = elements[idx];
          elements.splice(idx, 1);
        } else {
          childChange = validate(childChange, elementTypes);
          if (isValidationError(childChange)) throw childChange;

          element = newElement(childChange.type, this.context);
          this.addChild(element);
        }
        element.update(childChange, options);
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
