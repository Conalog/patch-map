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
      const elements = [...this.children];

      childrenChanges = validateAndPrepareChanges(
        elements,
        childrenChanges,
        mapDataSchema,
      );

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

      if (options.mergeStrategy === 'replace') {
        elements.forEach((element) => {
          if (!element.type) return;
          this.removeChild(element);
          element.destroy({ children: true });
        });
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
