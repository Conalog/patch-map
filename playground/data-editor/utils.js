import { componentSchema } from '../../src/display/data-schema/component-schema.js';
import { elementTypes } from '../../src/display/data-schema/element-schema.js';
import { componentTypes } from './constants.js';

export const formatError = (error) => {
  if (error?.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const coerceValue = (rawValue, inputType, originalValue) => {
  if (inputType === 'number') {
    if (rawValue === '') return null;
    const numberValue = Number(rawValue);
    return Number.isNaN(numberValue) ? null : numberValue;
  }
  if (inputType === 'boolean') {
    return Boolean(rawValue);
  }
  if (typeof originalValue === 'number') {
    const numberValue = Number(rawValue);
    if (!Number.isNaN(numberValue)) {
      return numberValue;
    }
  }
  return rawValue;
};

export const setNodeValue = (node, path, value) => {
  const keys = path.split('.');
  let current = node;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  });
};

export const buildChangesFromPath = (path, value) => {
  const keys = path.split('.');
  const changes = {};
  let current = changes;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    current[key] = {};
    current = current[key];
  });
  return changes;
};

export const formatPxPercent = (value) => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object' && 'value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  return null;
};

export const resolveNodeSchema = (node) => {
  if (!node?.type) {
    return { parsed: node, schema: null, kind: 'unknown', error: null };
  }

  const schema = componentTypes.has(node.type) ? componentSchema : elementTypes;
  const result = schema.safeParse(node);
  if (!result.success) {
    return {
      parsed: node,
      schema,
      kind: componentTypes.has(node.type) ? 'component' : 'element',
      error: result.error,
    };
  }

  return {
    parsed: result.data,
    schema,
    kind: componentTypes.has(node.type) ? 'component' : 'element',
    error: null,
  };
};

export const validateNode = (node, type) => {
  const schema = componentTypes.has(type) ? componentSchema : elementTypes;
  const result = schema.safeParse(node);
  if (result.success) {
    return { success: true, message: '' };
  }
  return {
    success: false,
    message: result.error.issues?.[0]?.message ?? 'Invalid data',
  };
};
