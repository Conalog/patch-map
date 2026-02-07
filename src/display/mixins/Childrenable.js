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

      const overlay = this.type === 'canvas' ? this.store?.overlay : null;
      const overlayElements = overlay
        ? [...overlay.children].filter((child) => child.type === 'relations')
        : [];

      const attachChild = (child, useOverlay) =>
        useOverlay ? overlay.addChild(child) : this.addChild(child);
      const detachChild = (child, useOverlay) =>
        useOverlay ? overlay.removeChild(child) : this.removeChild(child);

      childrenChanges = validateAndPrepareChanges(
        [...elements, ...overlayElements],
        childrenChanges,
        mapDataSchema,
      );

      for (const childChange of childrenChanges) {
        const isOverlay = overlay && childChange.type === 'relations';
        const searchElements = isOverlay ? overlayElements : elements;
        const idx = findIndexByPriority(searchElements, childChange);
        let element = null;

        if (idx !== -1) {
          element = searchElements[idx];
          searchElements.splice(idx, 1);
          if (options.mergeStrategy === 'replace') {
            attachChild(element, isOverlay);
          }
        } else {
          element = newElement(childChange.type, this.store);
          attachChild(element, isOverlay);
        }
        element.apply(childChange, options);
      }

      if (options.mergeStrategy === 'replace') {
        elements.forEach((element) => {
          if (!element.type) return; // Don't remove children that are not managed by patchmap (e.g. raw PIXI objects)
          detachChild(element, false);
          element.destroy({ children: true });
        });
        overlayElements.forEach((element) => {
          if (!element.type || !overlay) return;
          detachChild(element, true);
          element.destroy({ children: true });
        });
      }

      if (this.sortableChildren) {
        this.sortDirty = true;
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
