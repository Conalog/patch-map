import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { mapDataSchema } from '../data-schema/element-schema';
import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';
import { validateAndPrepareChanges } from './utils';

const KEYS = ['children'];

export const Childrenable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyChildren(relevantChanges, options) {
      let { children: childrenChanges } = relevantChanges;
      let elements = [...this.children];

      childrenChanges = validateAndPrepareChanges(
        elements,
        childrenChanges,
        mapDataSchema,
      );

      if (options.mergeStrategy === 'replace') {
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
        element.apply(childChange, options);
      }
    }

    _onChildUpdate(childId, changes, mergeStrategy) {
      if (!this.props.children) return;

      const childIndex = this.props.children.findIndex((c) => c.id === childId);
      if (childIndex !== -1) {
        const updatedChildProps = deepMerge(
          this.props.children[childIndex],
          changes,
          { mergeStrategy },
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
