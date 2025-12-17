import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { newComponent } from '../components/creator';
import { componentArraySchema } from '../data-schema/component-schema';
import { UPDATE_STAGES } from './constants';
import { validateAndPrepareChanges } from './utils';

const KEYS = ['components'];

export const Componentsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyComponents(relevantChanges, options) {
      let { components: componentsChanges } = relevantChanges;
      const components = [...this.children];

      componentsChanges = validateAndPrepareChanges(
        components,
        componentsChanges,
        componentArraySchema,
      );

      for (const componentChange of componentsChanges) {
        const idx = findIndexByPriority(components, componentChange);
        let component = null;

        if (idx !== -1) {
          component = components[idx];
          components.splice(idx, 1);
        } else {
          component = newComponent(componentChange.type, this.context);
          this.addChild(component);
        }
        component.apply(
          { type: componentChange.type, ...componentChange },
          options,
        );
      }

      if (options.mergeStrategy === 'replace') {
        components.forEach((component) => {
          if (!component.type) return; // Don't remove components that are not managed by patchmap (e.g. raw PIXI objects)
          this.removeChild(component);
          component.destroy({ children: true });
        });
      }
    }

    _onChildUpdate(childId, changes, mergeStrategy) {
      if (!this.props.components) return;

      const childIndex = this.props.components.findIndex(
        (c) => c.id === childId,
      );
      if (childIndex !== -1) {
        const updatedChildProps = deepMerge(
          this.props.components[childIndex],
          changes,
          { mergeStrategy },
        );
        this.props.components[childIndex] = updatedChildProps;
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyComponents,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};
