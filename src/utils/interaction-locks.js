export const isLocked = (displayObject) =>
  Boolean(displayObject?.props?.locked);

export const hasLockedAncestor = (displayObject, stopAt = null) => {
  let current = displayObject?.parent ?? null;

  while (current && current !== stopAt) {
    if (isLocked(current)) {
      return true;
    }
    current = current.parent ?? null;
  }

  return false;
};

export const isInteractionLocked = (displayObject, stopAt = null) =>
  isLocked(displayObject) || hasLockedAncestor(displayObject, stopAt);

export const isSelectableCandidate = (displayObject, stopAt = null) =>
  Boolean(displayObject?.constructor?.isSelectable) &&
  !isInteractionLocked(displayObject, stopAt);

export const isResizableCandidate = (displayObject, stopAt = null) =>
  Boolean(displayObject?.constructor?.isResizable) &&
  !isInteractionLocked(displayObject, stopAt);
