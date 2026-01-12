export const createGridEditor = ({
  patchmap,
  state,
  setEditorValue,
  clearEditorError,
  setLastAction,
}) => {
  const renderGridEditor = (container, node, id) => {
    if (!Array.isArray(node.cells)) return;
    const editor = document.createElement('div');
    editor.className = 'grid-editor';

    const title = document.createElement('div');
    title.className = 'grid-title';
    title.textContent = 'Cells';

    const controls = document.createElement('div');
    controls.className = 'grid-controls';

    const addRow = buildGridControl('+ Row', 'add-row');
    const removeRow = buildGridControl('- Row', 'remove-row');
    const addCol = buildGridControl('+ Col', 'add-col');
    const removeCol = buildGridControl('- Col', 'remove-col');

    controls.append(addRow, removeRow, addCol, removeCol);

    const grid = document.createElement('div');
    grid.className = 'grid-cells';

    const renderCells = () => {
      grid.replaceChildren();
      const rows = node.cells.length;
      const cols = Math.max(1, ...node.cells.map((row) => row.length || 0));
      grid.style.setProperty('--grid-cols', String(cols));
      grid.style.setProperty('--grid-rows', String(rows));

      node.cells.forEach((row, rowIndex) => {
        for (let colIndex = 0; colIndex < cols; colIndex += 1) {
          const value = row[colIndex];
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'grid-cell';
          cell.dataset.row = String(rowIndex);
          cell.dataset.col = String(colIndex);

          if (typeof value === 'string') {
            cell.dataset.original = value;
            cell.dataset.value = value;
          }

          if (value !== 0 && value !== undefined) {
            cell.classList.add('is-active');
          }

          cell.textContent = '';
          grid.append(cell);
        }
      });
    };

    const updateCells = (nextCells) => {
      node.cells = nextCells;
      patchmap.update({
        path: `$..[?(@.id=="${id}")]`,
        changes: { cells: nextCells },
        mergeStrategy: 'replace',
      });
      setEditorValue(state.currentData);
      clearEditorError();
    };

    editor.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-grid-action]');
      if (actionButton) {
        const action = actionButton.dataset.gridAction;
        const cols = Math.max(1, ...node.cells.map((row) => row.length || 0));
        if (action === 'add-row') {
          node.cells.push(Array.from({ length: cols }, () => 1));
        }
        if (action === 'remove-row' && node.cells.length > 1) {
          node.cells.pop();
        }
        if (action === 'add-col') {
          node.cells.forEach((row) => row.push(1));
        }
        if (action === 'remove-col' && cols > 1) {
          node.cells.forEach((row) => row.pop());
        }
        updateCells(node.cells);
        renderCells();
        setLastAction(`Updated ${id} cells`);
        return;
      }

      const cell = event.target.closest('.grid-cell');
      if (!cell) return;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const currentValue = node.cells[row]?.[col] ?? 0;
      let nextValue = 0;

      if (currentValue === 0 || currentValue == null) {
        nextValue = cell.dataset.original ?? 1;
      }

      node.cells[row][col] = nextValue;
      updateCells(node.cells);
      renderCells();
      setLastAction(`Updated ${id} cells`);
    });

    renderCells();
    editor.append(title, controls, grid);
    container.append(editor);
  };

  const buildGridControl = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grid-control';
    button.dataset.gridAction = action;
    button.textContent = label;
    return button;
  };

  return { renderGridEditor };
};
