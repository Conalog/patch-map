export const changeProperty = (object, key, value) => {
  if (key === 'metadata' || key in object) {
    object[key] = value;
  }
};
