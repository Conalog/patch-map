import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { mapDataSchema } from '../data-schema/element-schema';
import { applyElementDefaults } from '../default-props';
import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';
import { validateAndPrepareChanges } from './utils';

const KEYS = ['children'];

export const Childrenable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyChildren(relevantChanges, options = {}) {
      const childOptions =
        options.validateSchema === false
          ? { ...options, validateSchema: false, normalize: false }
          : options;
      let childrenChanges = options.refresh
        ? relevantChanges?.children
        : (options.changes?.children ?? relevantChanges?.children);
      childrenChanges = childrenChanges ?? [];
      const elements = [...this.children];

      childrenChanges = validateAndPrepareChanges(
        elements,
        childrenChanges,
        mapDataSchema,
        { ...childOptions, defaultMaterializer: applyElementDefaults },
      );

      for (const childChange of childrenChanges) {
        const idx = findIndexByPriority(elements, childChange);
        let element = null;
        let isNewElement = false;

        if (idx !== -1) {
          element = elements[idx];
          elements.splice(idx, 1);
          if (options.mergeStrategy === 'replace') {
            this.addChild(element);
          }
        } else {
          element = newElement(childChange.type, this.store);
          this.addChild(element);
          isNewElement = true;
        }
        applyInitialChild(element, childChange, childOptions, isNewElement);
      }

      if (options.mergeStrategy === 'replace') {
        elements.forEach((element) => {
          if (!element.type) return; // Don't remove children that are not managed by patchmap (e.g. raw PIXI objects)
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

const canUseInitialFastPath = (options) =>
  options.mergeStrategy === 'replace' &&
  options.validateSchema === false &&
  options.normalize === false;

const applyInitialChild = (
  element,
  childChange,
  childOptions,
  isNewElement,
) => {
  const applyOptions = { ...childOptions, changes: childChange };
  if (isNewElement && canUseInitialFastPath(childOptions)) {
    element._applyInitialTrusted(childChange, applyOptions);
    return;
  }

  element.apply(childChange, applyOptions);
};
