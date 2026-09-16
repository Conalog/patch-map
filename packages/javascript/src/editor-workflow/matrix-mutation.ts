import type {
  MaterializedPatchMapDataset,
  PatchMapGridElement,
  PatchMapRelationsElement,
  PatchMapTextElement,
} from '../semantic/dataset';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import { isPlainRecord } from '../shared/plain-record';

import type { PatchMapEditorMutationKind } from './contracts';
import {
  addRoot,
  change,
  finiteAttribute,
  finiteJson,
  finiteSize,
  matrixGrid,
  mergeElement,
  removeElement,
  requireElement,
  requireElementLocation,
} from './dataset-atoms';

export function planPatchMapEditorMatrixMutation(
  materialized: MaterializedPatchMapDataset,
  kind: PatchMapEditorMutationKind,
  companion: PatchMapMutationJsonValue,
): PatchMapMutationTransactionRequest {
  const rect = requireElement(materialized, 'rect-b', 'rect');
  const relation = requireElement(materialized, 'links', 'relations');
  const text = requireElement(materialized, 'text-c', 'text');
  const rootCount = materialized.dataset.length;
  let operation: PatchMapMutationOperation;

  switch (kind) {
    case 'create':
      operation = addRoot(rootCount, matrixGrid());
      break;
    case 'move':
      operation = mergeElement('rect-b', [
        change(['attrs', 'x'], finiteAttribute(rect, 'x', 0) + 1),
      ]);
      break;
    case 'resize':
      operation = mergeElement('rect-b', [
        change(['size', 'width'], finiteSize(rect, 'width') + 1),
      ]);
      break;
    case 'rotate':
      operation = mergeElement('rect-b', [
        change(['attrs', 'angle'], finiteAttribute(rect, 'angle', 0) + 1),
      ]);
      break;
    case 'grid': {
      const grid = requireElement(materialized, 'matrix-grid', 'grid') as PatchMapGridElement;
      operation = mergeElement('matrix-grid', [
        change(['cells'], Object.freeze([
          ...grid.cells.map((row) => Object.freeze([...row])),
          Object.freeze([1]),
        ])),
      ]);
      break;
    }
    case 'relation': {
      const links = (relation as PatchMapRelationsElement).links;
      operation = mergeElement('links', [
        change(['links'], Object.freeze([
          ...links.map((link) => Object.freeze({ ...link })),
          Object.freeze({ source: 'item-a', target: 'text-c' }),
        ])),
      ]);
      break;
    }
    case 'text':
      operation = mergeElement('text-c', [
        change(['text'], `${(text as PatchMapTextElement).text} matrix`),
      ]);
      break;
    case 'style':
      operation = mergeElement('rect-b', [change(['fill'], '#0088ff')]);
      break;
    case 'hierarchy':
      operation = Object.freeze({
        op: 'move',
        target: Object.freeze({ kind: 'element', id: 'rect-b' }),
        parent: null,
        index: 0,
      });
      break;
    case 'group':
      operation = Object.freeze({
        op: 'group',
        targets: Object.freeze([
          Object.freeze({ kind: 'element' as const, id: 'rect-b' }),
          Object.freeze({ kind: 'element' as const, id: 'text-c' }),
        ]),
        value: Object.freeze({
          type: 'group',
          id: 'matrix-group',
        }),
      });
      break;
    case 'duplicate': {
      const location = requireElementLocation(materialized.dataset, 'rect-b');
      if (location.parentId !== 'matrix-group') {
        throw new Error('matrix duplicate requires grouped rect-b');
      }
      const duplicate = detachPatchMapMutationJsonValue(location.element);
      if (!isPlainRecord(duplicate)) throw new Error('matrix duplicate lost record shape');
      const attrs = isPlainRecord(duplicate.attrs) ? duplicate.attrs : {};
      operation = Object.freeze({
        op: 'add',
        parent: Object.freeze({ kind: 'element', id: 'matrix-group' }),
        collection: 'children',
        index: location.siblingCount,
        value: Object.freeze({
          ...duplicate,
          id: 'matrix-duplicate',
          attrs: Object.freeze({
            ...attrs,
            x: finiteJson(attrs.x, 0) + 12,
            y: finiteJson(attrs.y, 0) + 12,
          }),
        }),
      });
      break;
    }
    case 'delete':
      operation = removeElement('matrix-duplicate');
      break;
  }

  return Object.freeze({
    operations: Object.freeze([operation]),
    strict: true,
    conflictPolicy: 'reject',
    recordHistory: true,
    actionId: `editor-matrix:${kind}`,
    history: detachPatchMapMutationJsonValue(companion, '$.editorMatrixCompanion'),
  });
}
