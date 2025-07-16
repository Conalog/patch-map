import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { newComponent } from '../components/creator';
import { componentArraySchema } from '../data-schema/component-schema';
import { UPDATE_STAGES } from './constants';

const KEYS = ['components'];

export const Componentsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyComponents(relevantChanges, options) {
      const { components: componentsChanges } = relevantChanges;
      let components = [...this.children];

      const newComponentDefs = componentsChanges.filter(
        (change) => findIndexByPriority(components, change) === -1,
      );

      if (newComponentDefs.length > 0) {
        const validationResult = validate(
          newComponentDefs,
          componentArraySchema,
        );
        if (isValidationError(validationResult)) {
          throw validationResult;
        }
      }

      if (options.arrayMerge === 'replace') {
        components.forEach((component) => {
          this.removeChild(component);
          component.destroy({ children: true });
        });
        components = [];
      }

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
        component.update(componentChange, options);
      }
    }

    _onChildUpdate(childId, changes, arrayMerge) {
      if (!this.props.components) return;

      const childIndex = this.props.components.findIndex(
        (c) => c.id === childId,
      );
      if (childIndex !== -1) {
        const updatedChildProps = deepMerge(
          this.props.components[childIndex],
          changes,
          { arrayMerge },
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
