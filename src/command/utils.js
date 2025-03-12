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
