import { assertFiniteNumber } from '../mixins/utils';

const getDisplayLabel = (displayObject) => {
  const type = displayObject?.type ?? 'unknown';
  const id = displayObject?.id ?? 'unknown';
  return `type=${type}, id=${id}`;
};

const ensureFinite = (value, label, displayObject) => {
  try {
    return assertFiniteNumber(value, label);
  } catch {
    throw new RangeError(
      `Non-finite world flip input (${label}=${value}, ${getDisplayLabel(displayObject)})`,
    );
  }
};

export const applyWorldFlip = (displayObject, view) => {
  if (!displayObject || !view) return;

  const prevState = displayObject._flipState ?? { x: false, y: false };
  const nextState = { x: !!view.flipX, y: !!view.flipY };
  if (prevState.x === nextState.x && prevState.y === nextState.y) {
    return;
  }

  const absScaleX = Math.abs(
    ensureFinite(displayObject.scale?.x ?? 1, 'scale.x', displayObject),
  );
  const absScaleY = Math.abs(
    ensureFinite(displayObject.scale?.y ?? 1, 'scale.y', displayObject),
  );

  const nextScaleX = ensureFinite(
    absScaleX * (nextState.x ? -1 : 1),
    'scale.nextX',
    displayObject,
  );
  const nextScaleY = ensureFinite(
    absScaleY * (nextState.y ? -1 : 1),
    'scale.nextY',
    displayObject,
  );

  displayObject.scale.set(nextScaleX, nextScaleY);

  displayObject._flipState = {
    x: nextState.x,
    y: nextState.y,
  };
};
