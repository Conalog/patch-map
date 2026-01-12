export const createViewControls = ({ patchmap, elements, setLastAction }) => {
  const clampRotation = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return Math.min(180, Math.max(-180, parsed));
  };

  const syncRotationUI = (angle = patchmap.getRotation()) => {
    const nextAngle = clampRotation(angle);
    if (elements.rotateRange) {
      elements.rotateRange.value = String(nextAngle);
    }
    if (elements.rotateInput) {
      elements.rotateInput.value = String(nextAngle);
    }
  };

  const applyRotation = (value, { updateAction = true } = {}) => {
    const nextAngle = clampRotation(value);
    patchmap.setRotation(nextAngle);
    syncRotationUI(nextAngle);
    if (updateAction) {
      setLastAction(`Rotate ${nextAngle}°`);
    }
  };

  const syncFlipUI = () => {
    const { x, y } = patchmap.getFlip();
    elements.flipX?.classList.toggle('is-active', x);
    elements.flipY?.classList.toggle('is-active', y);
  };

  const bindViewControls = () => {
    if (elements.reset) {
      elements.reset.addEventListener('click', () => {
        patchmap.resetRotation();
        patchmap.resetFlip();
        patchmap.viewport.setZoom(1, true);
        patchmap.viewport.moveCenter(0, 0);
        syncRotationUI(0);
        syncFlipUI();
        setLastAction('Reset zoom');
      });
    }

    if (elements.rotateRange) {
      elements.rotateRange.addEventListener('input', (event) => {
        applyRotation(event.target.value, { updateAction: false });
      });
      elements.rotateRange.addEventListener('change', (event) => {
        applyRotation(event.target.value);
      });
    }

    if (elements.rotateInput) {
      elements.rotateInput.addEventListener('change', (event) => {
        applyRotation(event.target.value);
      });
      elements.rotateInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          applyRotation(event.target.value);
        }
      });
    }

    if (elements.rotateLeft) {
      elements.rotateLeft.addEventListener('click', () => {
        patchmap.rotateBy(-15);
        syncRotationUI();
        setLastAction(`Rotate ${patchmap.getRotation()}°`);
      });
    }

    if (elements.rotateRight) {
      elements.rotateRight.addEventListener('click', () => {
        patchmap.rotateBy(15);
        syncRotationUI();
        setLastAction(`Rotate ${patchmap.getRotation()}°`);
      });
    }

    if (elements.rotateReset) {
      elements.rotateReset.addEventListener('click', () => {
        patchmap.resetRotation();
        syncRotationUI(0);
        setLastAction('Rotate 0°');
      });
    }

    if (elements.flipX) {
      elements.flipX.addEventListener('click', () => {
        patchmap.toggleFlipX();
        syncFlipUI();
        setLastAction(patchmap.getFlip().x ? 'Flip X on' : 'Flip X off');
      });
    }

    if (elements.flipY) {
      elements.flipY.addEventListener('click', () => {
        patchmap.toggleFlipY();
        syncFlipUI();
        setLastAction(patchmap.getFlip().y ? 'Flip Y on' : 'Flip Y off');
      });
    }
  };

  return {
    bindViewControls,
    syncRotationUI,
    syncFlipUI,
  };
};
