export const applyWorldFlip = (displayObject, view) => {
  if (!displayObject || !view) return;

  const prevState = displayObject._flipState ?? { x: false, y: false };
  const nextState = { x: !!view.flipX, y: !!view.flipY };
  const width = displayObject.width ?? 0;
  const height = displayObject.height ?? 0;
  const absScaleX = Math.abs(displayObject.scale?.x ?? 1);
  const absScaleY = Math.abs(displayObject.scale?.y ?? 1);

  let baseX = displayObject.x;
  let baseY = displayObject.y;
  if (prevState.x) {
    baseX -= width;
  }
  if (prevState.y) {
    baseY -= height;
  }

  displayObject.scale.set(
    absScaleX * (nextState.x ? -1 : 1),
    absScaleY * (nextState.y ? -1 : 1),
  );
  displayObject.position.set(
    nextState.x ? baseX + width : baseX,
    nextState.y ? baseY + height : baseY,
  );
  displayObject._flipState = nextState;
};
