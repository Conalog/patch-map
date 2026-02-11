import { ROTATION_THRESHOLD } from '../mixins/constants';
import { assertFiniteNumber } from '../mixins/utils';

const ROTATION_STATE = Symbol('rotationState');

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
      `Non-finite world rotation input (${label}=${value}, ${getDisplayLabel(displayObject)})`,
    );
  }
};

const getRotationCompensation = (viewAngle) => {
  const normalized = ((viewAngle % 360) + 360) % 360;
  if (
    normalized >= ROTATION_THRESHOLD.MIN &&
    normalized < ROTATION_THRESHOLD.MAX
  ) {
    return 180;
  }
  return 0;
};

const getBoundsCenter = (displayObject) => {
  const bounds = displayObject.getLocalBounds?.() ?? {
    x: 0,
    y: 0,
    width: displayObject.width ?? 0,
    height: displayObject.height ?? 0,
  };

  const x = ensureFinite(bounds.x, 'bounds.x', displayObject);
  const y = ensureFinite(bounds.y, 'bounds.y', displayObject);
  const width = ensureFinite(bounds.width, 'bounds.width', displayObject);
  const height = ensureFinite(bounds.height, 'bounds.height', displayObject);

  return {
    pivotX: x + width / 2,
    pivotY: y + height / 2,
  };
};

export const applyWorldRotation = (displayObject, view) => {
  if (!displayObject || !view) return;

  const viewAngle = ensureFinite(
    Number(view.angle ?? 0),
    'view.angle',
    displayObject,
  );

  const prevState = displayObject[ROTATION_STATE] ?? {
    compensation: 0,
    basePivotX: displayObject.pivot?.x ?? 0,
    basePivotY: displayObject.pivot?.y ?? 0,
  };

  const previousCompensation = ensureFinite(
    prevState.compensation ?? 0,
    'prev.compensation',
    displayObject,
  );

  const currentAngle = ensureFinite(
    displayObject.angle ?? 0,
    'display.angle',
    displayObject,
  );
  const baseAngle = ensureFinite(
    currentAngle - previousCompensation,
    'base.angle',
    displayObject,
  );

  const compensation = ensureFinite(
    getRotationCompensation(viewAngle),
    'rotation.compensation',
    displayObject,
  );

  const hadComp = previousCompensation !== 0;
  const needsComp = compensation !== 0;

  if (!hadComp && !needsComp) {
    displayObject[ROTATION_STATE] = {
      compensation: 0,
      viewAngle,
      basePivotX: ensureFinite(
        prevState.basePivotX ?? displayObject.pivot?.x ?? 0,
        'basePivotX',
        displayObject,
      ),
      basePivotY: ensureFinite(
        prevState.basePivotY ?? displayObject.pivot?.y ?? 0,
        'basePivotY',
        displayObject,
      ),
    };
    return;
  }

  const basePivotX = ensureFinite(
    hadComp ? (prevState.basePivotX ?? 0) : (displayObject.pivot?.x ?? 0),
    'pivot.baseX',
    displayObject,
  );
  const basePivotY = ensureFinite(
    hadComp ? (prevState.basePivotY ?? 0) : (displayObject.pivot?.y ?? 0),
    'pivot.baseY',
    displayObject,
  );

  const { pivotX, pivotY } = getBoundsCenter(displayObject);

  if (needsComp) {
    displayObject.pivot.set(pivotX, pivotY);
  } else {
    displayObject.pivot.set(basePivotX, basePivotY);
  }

  const nextAngle = ensureFinite(
    baseAngle + compensation,
    'angle.next',
    displayObject,
  );
  displayObject.angle = nextAngle;

  displayObject[ROTATION_STATE] = {
    baseAngle,
    compensation,
    viewAngle,
    pivotX,
    pivotY,
    basePivotX,
    basePivotY,
  };
};
