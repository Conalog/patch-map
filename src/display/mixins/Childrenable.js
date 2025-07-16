import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { mapDataSchema } from '../data-schema/element-schema';
import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';

const KEYS = ['children'];

export const Childrenable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyChildren(relevantChanges, options) {
      const { children: childrenChanges } = relevantChanges;
      let elements = [...this.children];

      // --- Start of Performance Optimization ---
      // This logic mirrors the optimization in `Componentsable.js`.
      // Instead of validating each new element inside the loop, we identify
      // new elements beforehand and validate them all at once.

      // 1. Filter out only the definitions for new elements.
      const newElementDefs = [];
      const newElementIndices = []; // Store original indices to update the array later.
      childrenChanges.forEach((change, index) => {
        if (findIndexByPriority(elements, change) === -1) {
          newElementDefs.push(change);
          newElementIndices.push(index);
        }
      });

      // 2. If new elements exist, perform a single batch validation.
      // This is far more efficient than validating one-by-one inside the loop.
      if (newElementDefs.length > 0) {
        const validatedNewDefs = validate(newElementDefs, mapDataSchema);
        if (isValidationError(validatedNewDefs)) {
          throw validatedNewDefs;
        }

        // 3. Update the original changes array with the validated, default-filled definitions.
        validatedNewDefs.forEach((validatedDef, i) => {
          const originalIndex = newElementIndices[i];
          childrenChanges[originalIndex] = validatedDef;
        });
      }
      // --- End of Performance Optimization ---

      if (options.arrayMerge === 'replace') {
        elements.forEach((element) => {
          this.removeChild(element);
          element.destroy({ children: true });
        });
        elements = [];
      }

      for (const childChange of childrenChanges) {
        const idx = findIndexByPriority(elements, childChange);
        let element = null;

        if (idx !== -1) {
          element = elements[idx];
          elements.splice(idx, 1);
        } else {
          element = newElement(childChange.type, this.context);
          this.addChild(element);
        }
        element.update(childChange, options);
      }
    }

    _onChildUpdate(childId, changes, arrayMerge) {
      if (!this.props.children) return;

      const childIndex = this.props.children.findIndex((c) => c.id === childId);
      if (childIndex !== -1) {
        const updatedChildProps = deepMerge(
          this.props.children[childIndex],
          changes,
          { arrayMerge },
        );
        this.props.children[childIndex] = updatedChildProps;
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
