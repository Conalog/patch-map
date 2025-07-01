export const changePosition = (object, { x, y }) => {
  const position = object.position;
  object.position.set(x ?? position.x, y ?? position.y);
};
