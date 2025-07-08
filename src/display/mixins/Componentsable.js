import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { newComponent } from '../components/creator';
import { componentSchema } from '../data-schema/component-schema';
import { UPDATE_STAGES } from './constants';

const KEYS = ['components'];

export const Componentsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyComponents(relevantChanges, options) {
      const { components: componentsChanges } = relevantChanges;
      let components = [...this.children];

      if (options.arrayMerge === 'replace') {
        components.forEach((component) => {
          this.removeChild(component);
          component.destroy({ children: true });
        });
        components = [];
      }

      for (let componentChange of componentsChanges) {
        const idx = findIndexByPriority(components, componentChange);
        let component = null;

        if (idx !== -1) {
          component = components[idx];
          components.splice(idx, 1);
        } else {
          componentChange = validate(componentChange, componentSchema);
          if (isValidationError(componentChange)) throw componentChange;

          component = newComponent(componentChange.type, this.context);
          this.addChild(component);
        }
        component.update(componentChange, options);
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
