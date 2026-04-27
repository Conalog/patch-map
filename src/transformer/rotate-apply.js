import { Point } from 'pixi.js';
import { getCentroid, getObjectLocalCorners } from '../utils/transform';
import { isRotatableElement } from './rotate-context';
import {
  DEGREES_PER_RADIAN,
  RADIANS_PER_DEGREE,
  rotatePoint,
} from './rotate-utils';

/**
 * @typedef {object} RotateElementState
 * @property {PIXI.DisplayObject} element
 * @property {{ x: number, y: number }} origin
 * @property {{ x: number, y: number }} center
 * @property {{ x: number, y: number }} centerOffset
 * @property {'angle' | 'rotation'} rotationKey
 * @property {number} rotation
 */

export const createRotateElementStates = ({ elements, viewport }) =>
  elements.map((element) => {
    const worldPosition = element.getGlobalPosition();
    const origin = viewport.toLocal(worldPosition);
    const corners = getObjectLocalCorners(element, viewport);
    const center = getCentroid(corners);
    const rotationKey = getRotationKey(element);

    return {
      element,
      origin,
      center,
      centerOffset: {
        x: center.x - origin.x,
        y: center.y - origin.y,
      },
      rotationKey,
      rotation: getRotationInRadians(element, rotationKey),
    };
  });

export const computeRotateUpdates = ({ activeRotate, deltaAngle }) =>
  activeRotate.elementStates.map((state) => ({
    element: state.element,
    updatedState: rotateElementState(state, {
      center: activeRotate.frame.center,
      deltaAngle,
    }),
  }));

export const rotateElementState = (state, { center, deltaAngle }) => {
  const rotatedCenter = rotatePoint(state.center, center, deltaAngle);
  const rotatedOffset = rotatePoint(
    state.centerOffset,
    { x: 0, y: 0 },
    deltaAngle,
  );
  const rotation = state.rotation + deltaAngle;

  return {
    x: rotatedCenter.x - rotatedOffset.x,
    y: rotatedCenter.y - rotatedOffset.y,
    rotationKey: state.rotationKey,
    rotation:
      state.rotationKey === 'angle' ? rotation * DEGREES_PER_RADIAN : rotation,
  };
};

export const applyRotateUpdates = ({ updates, viewport, historyId }) => {
  updates.forEach(({ element, updatedState }) => {
    applyElementRotate({
      element,
      updatedState,
      viewport,
      historyId,
    });
  });
};

const applyElementRotate = ({ element, updatedState, viewport, historyId }) => {
  if (!element || !isRotatableElement(element)) return;

  const parent = element.parent;
  const localPosition = parent
    ? parent.toLocal(
        new Point(updatedState.x, updatedState.y),
        viewport ?? undefined,
      )
    : new Point(updatedState.x, updatedState.y);

  const changes = {
    attrs: {
      x: localPosition.x,
      y: localPosition.y,
      [updatedState.rotationKey]: updatedState.rotation,
    },
  };

  element.apply(changes, historyId ? { historyId } : undefined);
};

export const getRotationKey = (element) => {
  const attrs = element?.props?.attrs;
  if (attrs && Object.hasOwn(attrs, 'rotation')) return 'rotation';
  if (attrs && Object.hasOwn(attrs, 'angle')) return 'angle';
  return 'angle';
};

const getRotationInRadians = (element, rotationKey) => {
  if (rotationKey === 'angle') {
    return (
      Number(element?.angle ?? element?.props?.attrs?.angle ?? 0) *
      RADIANS_PER_DEGREE
    );
  }
  return Number(element?.rotation ?? element?.props?.attrs?.rotation ?? 0);
};
