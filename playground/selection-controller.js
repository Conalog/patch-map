export const createSelectionController = ({
  patchmap,
  dataEditor,
  elements,
}) => {
  let isSpaceDown = false;
  let ignoreClickAfterDrag = false;

  const getSelectionList = () => {
    if (!patchmap.transformer) return [];
    return Array.isArray(patchmap.transformer.elements)
      ? patchmap.transformer.elements
      : [patchmap.transformer.elements].filter(Boolean);
  };

  const setSelectionList = (list) => {
    if (!patchmap.transformer) return;
    patchmap.transformer.elements = list;
  };

  const clearSelection = () => {
    dataEditor.updateSelection(null);
    elements.selectedId.textContent = 'None';
  };

  const applySelection = (list) => {
    const next = list.filter(Boolean);
    if (next.length === 0) {
      clearSelection();
      return;
    }
    if (next.length === 1) {
      dataEditor.updateSelection(next[0]);
      return;
    }
    dataEditor.updateSelection(null);
    setSelectionList(next);
    elements.selectedId.textContent = `Multiple (${next.length})`;
  };

  const toggleSelection = (target) => {
    if (!target) return;
    const current = getSelectionList();
    const exists = current.some((item) => item.id === target.id);
    const next = exists
      ? current.filter((item) => item.id !== target.id)
      : [...current, target];
    applySelection(next);
  };

  const updateSelectionDraggable = (enabled) => {
    const state = patchmap.stateManager?.getCurrentState?.();
    if (state?.config) {
      state.config.draggable = enabled;
    }
  };

  const setDragButtons = (buttons) => {
    const dragPlugin = patchmap.viewport?.plugins?.get('drag');
    if (dragPlugin?.mouseButtons) {
      dragPlugin.mouseButtons(buttons);
    }
  };

  const bindSelectionState = () => {
    patchmap.stateManager.setState('selection', {
      onDown: () => {
        if (ignoreClickAfterDrag) {
          ignoreClickAfterDrag = false;
        }
      },
      onDragStart: () => {
        ignoreClickAfterDrag = true;
      },
      onClick: (target, event) => {
        if (ignoreClickAfterDrag) {
          ignoreClickAfterDrag = false;
          return;
        }
        if (isSpaceDown) return;
        const mod = event?.metaKey || event?.ctrlKey;
        if (mod) {
          toggleSelection(target);
          return;
        }
        dataEditor.updateSelection(target);
      },
      draggable: true,
      onDragEnd: (selected, event) => {
        ignoreClickAfterDrag = true;
        if (!selected || selected.length === 0 || isSpaceDown) {
          return;
        }
        const mod = event?.metaKey || event?.ctrlKey;
        if (mod) {
          const current = getSelectionList();
          const ids = new Set(current.map((item) => item.id));
          const merged = [
            ...current,
            ...selected.filter((item) => !ids.has(item.id)),
          ];
          applySelection(merged);
          return;
        }
        applySelection(selected);
      },
    });
  };

  const bindSelectionShortcuts = () => {
    if (elements.stage) {
      elements.stage.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        clearSelection();
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space') return;
      const target = event.target;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (isSpaceDown) return;
      event.preventDefault();
      isSpaceDown = true;
      updateSelectionDraggable(false);
      setDragButtons('left middle');
    });

    window.addEventListener('keyup', (event) => {
      if (event.code !== 'Space') return;
      if (!isSpaceDown) return;
      isSpaceDown = false;
      updateSelectionDraggable(true);
      setDragButtons('middle');
    });
  };

  return {
    bindSelectionState,
    bindSelectionShortcuts,
    clearSelection,
  };
};
