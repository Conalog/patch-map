export const isInput = (element) => {
  if (!element) {
    return false;
  }

  if (
    element.type === 'text' ||
    element.tagName === 'INPUT' ||
    element.type === 'textarea' ||
    element.type === 'SELECT'
  ) {
    return true;
  }
};

export const parsePick = (object, keys) => {
  const result = {};
  for (const key of keys) {
    result[key] = object[key];
  }
  return result;
};
