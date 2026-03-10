import { assertFiniteNumber } from '../mixins/utils';
import { hasUprightContentOrientation } from './content-orientation';
import { getAngleWithinWorld } from './world-angle';

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
  const radian = (normalized * Math.PI) / 180;
  const horizontal = Math.cos(radian);
  if (horizontal < -1e-7) return 180;
  if (horizontal > 1e-7) return 0;

  const vertical = Math.sin(radian);
  return vertical >= 0 ? 180 : 0;
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

const setPivotIfChanged = (displayObject, x, y) => {
  const currentX = Number(displayObject?.pivot?.x ?? 0);
  const currentY = Number(displayObject?.pivot?.y ?? 0);
  if (Math.abs(currentX - x) <= 1e-7 && Math.abs(currentY - y) <= 1e-7) {
    return;
  }
  displayObject.pivot.set(x, y);
};

export const resetWorldRotationState = (displayObject) => {
  if (!displayObject) return;
  delete displayObject[ROTATION_STATE];
};

export const applyWorldRotation = (displayObject, view) => {
  if (!displayObject || !view) return;

  const viewAngle = ensureFinite(
    Number(view.angle ?? 0),
    'view.angle',
    displayObject,
  );

  const inheritsUprightOrientation =
    hasUprightContentOrientation(displayObject);

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
  const hadComp = previousCompensation !== 0;
  const baseAngle = ensureFinite(
    currentAngle - previousCompensation,
    'base.angle',
    displayObject,
  );

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

  let referenceAngle = viewAngle;
  let compensation = 0;
  let nextAngle = 0;
  let useCenterPivot = false;
  let ancestorAngle = 0;

  if (inheritsUprightOrientation) {
    ancestorAngle = ensureFinite(
      getAngleWithinWorld(displayObject),
      'ancestor.angle',
      displayObject,
    );
    referenceAngle = ensureFinite(
      baseAngle + ancestorAngle + viewAngle,
      'angle.reference',
      displayObject,
    );
  }
  compensation = ensureFinite(
    getRotationCompensation(referenceAngle),
    'rotation.compensation',
    displayObject,
  );
  nextAngle = ensureFinite(
    baseAngle + compensation,
    'angle.next',
    displayObject,
  );
  const keepsBasePivotDuringCompensation =
    displayObject?.constructor?.keepsBasePivotDuringCompensation === true;
  useCenterPivot = compensation !== 0 && !keepsBasePivotDuringCompensation;

  if (useCenterPivot) {
    const { pivotX, pivotY } = getBoundsCenter(displayObject);
    setPivotIfChanged(displayObject, pivotX, pivotY);
  } else {
    setPivotIfChanged(displayObject, basePivotX, basePivotY);
  }

  displayObject.angle = nextAngle;

  displayObject[ROTATION_STATE] = {
    baseAngle,
    compensation,
    viewAngle,
    ancestorAngle,
    basePivotX,
    basePivotY,
  };
};
