import { renderInspectorFields } from './inspector-fields.js';
import { createGridEditor } from './inspector-grid.js';
import { createRelationsEditor } from './inspector-relations.js';

export const createInspector = ({
  patchmap,
  elements,
  state,
  componentTypes,
  colorPresets,
  colorPresetValues,
  resolveNodeSchema,
  validateNode,
  formatPxPercent,
  coerceValue,
  setNodeValue,
  buildChangesFromPath,
  setEditorValue,
  setEditorError,
  clearEditorError,
  setLastAction,
}) => {
  const { renderRelationsEditor } = createRelationsEditor({
    patchmap,
    state,
    componentTypes,
    validateNode,
    setEditorValue,
    setEditorError,
    clearEditorError,
    setLastAction,
  });

  const { renderGridEditor } = createGridEditor({
    patchmap,
    state,
    setEditorValue,
    clearEditorError,
    setLastAction,
  });

  const renderInspector = (id) => {
    const container = elements.inspectorContent ?? elements.dataInspector;
    if (!container) return;
    container.replaceChildren();

    if (!id) {
      container.append(buildInspectorEmpty('Select a node'));
      return;
    }

    const entry = state.nodeIndex.get(id);
    if (!entry) {
      container.append(buildInspectorEmpty('No editable data'));
      return;
    }

    const { node } = entry;
    const resolved = resolveNodeSchema(node);
    const data = resolved.parsed ?? node;

    const buildInput = (value, options = {}) => {
      let input;
      if (options.options) {
        input = document.createElement('select');
        options.options.forEach((option) => {
          const item = document.createElement('option');
          item.value = option.value;
          item.textContent = option.label;
          input.append(item);
        });
        if (value != null) {
          input.value = String(value);
        }
      } else if (options.type === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(value);
      } else {
        input = document.createElement('input');
        input.type = options.type ?? 'text';
        input.value = value ?? '';
      }

      input.className = 'inspector-input';
      if (options.compact) {
        input.classList.add('inspector-input--compact');
      }

      if (options.readOnly) {
        input.readOnly = true;
      } else if (options.path) {
        input.addEventListener('change', (event) => {
          const nextValue =
            options.type === 'boolean'
              ? event.target.checked
              : event.target.value;
          handleInspectorChange(
            id,
            node,
            options.path,
            nextValue,
            options.type,
            options.originalValue,
          );
        });
      }
      return input;
    };

    const addField = (label, value, options = {}) => {
      const field = document.createElement('div');
      field.className = 'inspector-field';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const input = buildInput(value, options);
      field.append(labelEl, input);
      container.append(field);
    };

    const addInlineFields = (label, fields) => {
      const field = document.createElement('div');
      field.className = 'inspector-field inspector-field--inline';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const group = document.createElement('div');
      group.className = 'inspector-inline';

      fields.forEach((item) => {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-inline-item';

        const tag = document.createElement('div');
        tag.className = 'inspector-inline-label';
        tag.textContent = item.short;

        const input = buildInput(item.value, {
          ...item.options,
          path: item.path,
          type: item.type,
          originalValue: item.originalValue,
          compact: true,
        });

        wrap.append(tag, input);
        group.append(wrap);
      });

      field.append(labelEl, group);
      container.append(field);
    };

    const addColorField = (label, value, path) => {
      const field = document.createElement('div');
      field.className = 'inspector-field inspector-field--inline';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const group = document.createElement('div');
      group.className = 'inspector-inline';

      const select = document.createElement('select');
      select.className =
        'inspector-input inspector-input--compact color-select';

      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = 'Custom';
      select.append(customOption);

      colorPresets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        select.append(option);
      });

      const stringValue = value == null ? '' : String(value);
      select.value = colorPresetValues.has(stringValue)
        ? stringValue
        : '__custom__';

      const input = document.createElement('input');
      input.className = 'inspector-input color-input';
      input.type = 'text';
      input.value = stringValue;
      input.placeholder = '#ffffff';

      select.addEventListener('change', () => {
        if (select.value === '__custom__') {
          input.focus();
          return;
        }
        input.value = select.value;
        handleInspectorChange(id, node, path, select.value, 'text', value);
      });

      input.addEventListener('change', (event) => {
        const nextValue = event.target.value;
        select.value = colorPresetValues.has(nextValue)
          ? nextValue
          : '__custom__';
        handleInspectorChange(id, node, path, nextValue, 'text', value);
      });

      group.append(select, input);
      field.append(labelEl, group);
      container.append(field);
    };

    renderInspectorFields({
      container,
      node,
      id,
      data,
      resolved,
      addField,
      addInlineFields,
      addColorField,
      formatPxPercent,
      renderRelationsEditor,
      renderGridEditor,
    });
  };

  const buildInspectorEmpty = (text) => {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = text;
    return empty;
  };

  const handleInspectorChange = (
    id,
    node,
    path,
    rawValue,
    inputType,
    originalValue,
  ) => {
    const value = coerceValue(rawValue, inputType, originalValue);
    if (value === null) return;

    const draft = JSON.parse(JSON.stringify(node));
    setNodeValue(draft, path, value);
    const validation = validateNode(draft, node.type);
    if (!validation.success) {
      setEditorError(validation.message);
      renderInspector(id);
      return;
    }

    setNodeValue(node, path, value);
    patchmap.update({
      path: `$..[?(@.id=="${id}")]`,
      changes: buildChangesFromPath(path, value),
    });

    setEditorValue(state.currentData);
    clearEditorError();
    setLastAction(`Updated ${id}`);
  };

  return { renderInspector };
};
