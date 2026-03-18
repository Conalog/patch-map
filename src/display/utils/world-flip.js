import { assertFiniteNumber } from '../mixins/utils';
import { hasUprightContentOrientation } from './content-orientation';
import { getAngleWithinWorld } from './world-angle';

const AXIS_RESOLUTION_EPSILON = 1e-7;

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

const normalizeAngle = (value) => ((value % 360) + 360) % 360;

const getLocalToWorldAngle = (displayObject) => {
  return normalizeAngle(
    getAngleWithinWorld(displayObject, { includeSelf: true }),
  );
};

const resolveHorizontalLocalAxis = (_displayObject, angle) => {
  const radian = (angle * Math.PI) / 180;
  const localXProjection = Math.abs(Math.cos(radian));
  const localYProjection = Math.abs(Math.sin(radian));

  const delta = Math.abs(localXProjection - localYProjection);
  if (delta <= AXIS_RESOLUTION_EPSILON) {
    const quadrant = Math.floor(normalizeAngle(angle) / 90) % 4;
    return quadrant % 2 === 0 ? 'x' : 'y';
  }

  return localXProjection >= localYProjection ? 'x' : 'y';
};

const resolveLocalFlipState = (displayObject, view) => {
  const angle = getLocalToWorldAngle(displayObject);
  const horizontalAxis = resolveHorizontalLocalAxis(displayObject, angle);
  const verticalAxis = horizontalAxis === 'x' ? 'y' : 'x';

  const state = { x: false, y: false };
  state[horizontalAxis] = !!view.flipX;
  state[verticalAxis] = !!view.flipY;

  return {
    x: state.x,
    y: state.y,
    horizontalAxis,
  };
};

export const resetWorldFlipState = (displayObject) => {
  if (!displayObject) return;
  delete displayObject._flipState;
};

export const applyWorldFlip = (displayObject, view) => {
  if (!displayObject || !view) return;

  const currentScaleX = ensureFinite(
    displayObject.scale?.x ?? 1,
    'scale.x',
    displayObject,
  );
  const currentScaleY = ensureFinite(
    displayObject.scale?.y ?? 1,
    'scale.y',
    displayObject,
  );
  const inheritsUprightOrientation =
    hasUprightContentOrientation(displayObject);

  const prevState = displayObject._flipState ?? {
    x: false,
    y: false,
    horizontalAxis: 'x',
    compensated: false,
    baseScaleX: currentScaleX,
    baseScaleY: currentScaleY,
  };
  const hadCompensation = prevState.compensated === true;
  const baseScaleX = ensureFinite(
    hadCompensation ? prevState.baseScaleX : currentScaleX,
    'scale.baseX',
    displayObject,
  );
  const baseScaleY = ensureFinite(
    hadCompensation ? prevState.baseScaleY : currentScaleY,
    'scale.baseY',
    displayObject,
  );

  if (!inheritsUprightOrientation) {
    if (currentScaleX !== baseScaleX || currentScaleY !== baseScaleY) {
      displayObject.scale.set(baseScaleX, baseScaleY);
    }
    displayObject._flipState = {
      x: false,
      y: false,
      horizontalAxis: 'x',
      compensated: false,
      baseScaleX,
      baseScaleY,
    };
    return;
  }

  const nextState = resolveLocalFlipState(displayObject, view);
  if (prevState.x === nextState.x && prevState.y === nextState.y) {
    return;
  }

  const nextScaleX = ensureFinite(
    baseScaleX * (nextState.x ? -1 : 1),
    'scale.nextX',
    displayObject,
  );
  const nextScaleY = ensureFinite(
    baseScaleY * (nextState.y ? -1 : 1),
    'scale.nextY',
    displayObject,
  );

  displayObject.scale.set(nextScaleX, nextScaleY);

  displayObject._flipState = {
    x: nextState.x,
    y: nextState.y,
    horizontalAxis: nextState.horizontalAxis,
    compensated: true,
    baseScaleX,
    baseScaleY,
  };
};
