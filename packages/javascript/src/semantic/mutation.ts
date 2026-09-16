import {
  assembleOwnedPatchMapDataset,
  PatchMapDatasetError,
  materializePatchMapDataset,
  materializeOwnedPatchMapStructuralDataset,
  type PatchMapComponent,
  type PatchMapElement,
  type MaterializedPatchMapDataset,
} from './dataset';
import type { PatchMapSemanticTarget } from './probe';
import type {
  PatchMapSemanticMutationDiagnostic,
  PatchMapSemanticMutationResult,
  PatchMapSemanticRemovalResult,
} from './mutation/contracts';
import {
  MutationValidationFailure,
  diagnostic,
  jsonEquivalent,
  mergeRecords,
  normalizePatch,
  normalizeTarget,
} from './mutation/record-values';

export type * from './mutation/contracts';

interface LocatedTarget {
  readonly path: string;
  readonly rootIndex: number;
  readonly elementType?: PatchMapElement['type'];
}

const STRUCTURAL_PATCH_FIELDS = new Set([
  'id',
  'type',
  'parent',
  'children',
  'components',
  'item',
  'cells',
  'links',
]);

/**
 * Build and validate an immutable semantic candidate for one stable logical target.
 * This function owns no engine state and never publishes or reloads a render surface.
 */
export function applyPatchMapSemanticPatch(
  current: MaterializedPatchMapDataset,
  targetInput: PatchMapSemanticTarget,
  patchInput: unknown,
): PatchMapSemanticMutationResult {
  let target: PatchMapSemanticTarget;
  try {
    target = normalizeTarget(targetInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return rejected(null, error.diagnostic);
  }

  let patch: Readonly<Record<string, unknown>>;
  try {
    patch = normalizePatch(patchInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return rejected(target, error.diagnostic);
  }

  const located = locateTargets(current.dataset, target);
  if (located.length === 0) {
    return rejected(
      target,
      diagnostic('missing-target', '$.target', `No current record matches ${targetLabel(target)}`),
    );
  }
  if (located.length > 1) {
    return rejected(
      target,
      diagnostic(
        'ambiguous-target',
        '$.target',
        `${targetLabel(target)} resolves to ${located.length} current records`,
      ),
    );
  }

  const location = requireAt(located, 0);
  const forbiddenField = Object.keys(patch).find((key) => {
    if (!STRUCTURAL_PATCH_FIELDS.has(key)) return false;
    return !(
      key === 'links' &&
      target.kind === 'element' &&
      location.elementType === 'relations'
    );
  });
  if (forbiddenField !== undefined) {
    return rejected(
      target,
      diagnostic(
        'unsupported-structure',
        `$.patch.${forbiddenField}`,
        `${forbiddenField} requires an explicit structural or replacement operation`,
      ),
    );
  }

  const currentRoot = current.dataset[location.rootIndex];
  const canRewriteOwnedRoot =
    currentRoot !== undefined &&
    isIncrementalFlatRoot(currentRoot) &&
    (
      location.path === `$[${location.rootIndex}]` ||
      location.path.startsWith(`$[${location.rootIndex}].components[`)
    );
  let candidate: MaterializedPatchMapDataset;
  try {
    if (canRewriteOwnedRoot) {
      const stagedRoot = rewriteElement(
        currentRoot,
        `$[${location.rootIndex}]`,
        location.path,
        patch,
      );
      const normalizedRoot = materializePatchMapDataset([stagedRoot]).dataset[0];
      if (normalizedRoot === undefined) {
        throw new Error('single-root semantic patch lost its normalized root');
      }
      if (jsonEquivalent(currentRoot, normalizedRoot)) {
        candidate = current;
      } else {
        const roots = [...current.dataset];
        roots[location.rootIndex] = normalizedRoot;
        candidate = assembleOwnedPatchMapDataset(current, roots);
      }
    } else {
      const staged = rewriteDataset(current.dataset, location.path, patch);
      candidate = materializePatchMapDataset(staged);
    }
  } catch (error) {
    if (!(error instanceof PatchMapDatasetError)) throw error;
    return rejected(
      target,
      diagnostic('invalid-candidate', error.datasetPath, error.message, error.code),
    );
  }

  const changed = !jsonEquivalent(current.dataset, candidate.dataset);
  return Object.freeze({
    status: changed ? 'changed' : 'unchanged',
    changed,
    target,
    candidate,
  }) as PatchMapSemanticMutationResult;
}

/** Build an immutable candidate with one stable logical element removed. */
export function removePatchMapSemanticTarget(
  current: MaterializedPatchMapDataset,
  targetInput: PatchMapSemanticTarget,
): PatchMapSemanticRemovalResult {
  let target: PatchMapSemanticTarget;
  try {
    target = normalizeTarget(targetInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return removalRejected(null, error.diagnostic);
  }

  if (target.kind !== 'element') {
    return removalRejected(
      target,
      diagnostic(
        'unsupported-structure',
        '$.target.kind',
        'remove currently accepts stable element targets only',
      ),
    );
  }

  const located = locateTargets(current.dataset, target);
  if (located.length === 0) {
    return removalRejected(
      target,
      diagnostic('missing-target', '$.target', `No current record matches ${targetLabel(target)}`),
    );
  }
  if (located.length > 1) {
    return removalRejected(
      target,
      diagnostic(
        'ambiguous-target',
        '$.target',
        `${targetLabel(target)} resolves to ${located.length} current records`,
      ),
    );
  }

  const location = requireAt(located, 0);
  const staged = removeDatasetElement(current.dataset, location.path);
  let candidate: MaterializedPatchMapDataset;
  try {
    candidate = location.path === `$[${location.rootIndex}]`
      ? materializeOwnedPatchMapStructuralDataset(staged)
      : materializePatchMapDataset(staged);
  } catch (error) {
    if (!(error instanceof PatchMapDatasetError)) throw error;
    return removalRejected(
      target,
      diagnostic('invalid-candidate', error.datasetPath, error.message, error.code),
    );
  }

  return Object.freeze({
    status: 'changed',
    changed: true,
    target,
    candidate,
  });
}

function locateTargets(
  elements: readonly PatchMapElement[],
  target: PatchMapSemanticTarget,
): readonly LocatedTarget[] {
  const located: LocatedTarget[] = [];
  elements.forEach((element, index) => {
    locateInElement(element, `$[${index}]`, index, target, located);
  });
  return located;
}

function locateInElement(
  element: PatchMapElement,
  path: string,
  rootIndex: number,
  target: PatchMapSemanticTarget,
  located: LocatedTarget[],
): void {
  if (target.kind === 'element' && element.id === target.id) {
    located.push({ path, rootIndex, elementType: element.type });
  }

  if (target.kind === 'component' && element.id === target.ownerId) {
    const components = elementComponents(element);
    components.values.forEach((component, index) => {
      if (component.id === target.id) {
        located.push({
          path: `${path}${components.path}[${index}]`,
          rootIndex,
        });
      }
    });
  }

  if (element.type === 'group') {
    element.children.forEach((child, index) => {
      locateInElement(child, `${path}.children[${index}]`, rootIndex, target, located);
    });
  }
}

function isIncrementalFlatRoot(
  element: PatchMapElement,
): element is Exclude<PatchMapElement, { readonly type: 'group' | 'grid' | 'relations' }> {
  return (
    element.type === 'item' ||
    element.type === 'rect' ||
    element.type === 'image' ||
    element.type === 'text'
  );
}

function elementComponents(element: PatchMapElement): Readonly<{
  values: readonly PatchMapComponent[];
  path: '.components' | '.item.components';
}> {
  if (element.type === 'item') return { values: element.components, path: '.components' };
  if (element.type === 'grid') return { values: element.item.components, path: '.item.components' };
  return { values: [], path: '.components' };
}

function rewriteDataset(
  elements: readonly PatchMapElement[],
  targetPath: string,
  patch: Readonly<Record<string, unknown>>,
): readonly unknown[] {
  return elements.map((element, index) => rewriteElement(element, `$[${index}]`, targetPath, patch));
}

function removeDatasetElement(
  elements: readonly PatchMapElement[],
  targetPath: string,
): readonly unknown[] {
  return elements.flatMap((element, index) => {
    const next = removeElement(element, `$[${index}]`, targetPath);
    return next === null ? [] : [next];
  });
}

function removeElement(
  element: PatchMapElement,
  path: string,
  targetPath: string,
): PatchMapElement | null {
  if (path === targetPath) return null;
  if (element.type !== 'group') return element;
  return {
    ...element,
    children: element.children.flatMap((child, index) => {
      const next = removeElement(child, `${path}.children[${index}]`, targetPath);
      return next === null ? [] : [next];
    }),
  };
}

function rewriteElement(
  element: PatchMapElement,
  path: string,
  targetPath: string,
  patch: Readonly<Record<string, unknown>>,
): unknown {
  if (path === targetPath) return mergeRecords(element, patch);

  if (element.type === 'group') {
    return {
      ...element,
      children: element.children.map((child, index) =>
        rewriteElement(child, `${path}.children[${index}]`, targetPath, patch),
      ),
    };
  }
  if (element.type === 'item') {
    return {
      ...element,
      components: element.components.map((component, index) => {
        const componentPath = `${path}.components[${index}]`;
        return componentPath === targetPath ? mergeRecords(component, patch) : component;
      }),
    };
  }
  if (element.type === 'grid') {
    return {
      ...element,
      item: {
        ...element.item,
        components: element.item.components.map((component, index) => {
          const componentPath = `${path}.item.components[${index}]`;
          return componentPath === targetPath ? mergeRecords(component, patch) : component;
        }),
      },
    };
  }
  return element;
}

function rejected(
  target: PatchMapSemanticTarget | null,
  mutationDiagnostic: PatchMapSemanticMutationDiagnostic,
): PatchMapSemanticMutationResult {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    target,
    candidate: null,
    diagnostic: mutationDiagnostic,
  });
}

function removalRejected(
  target: PatchMapSemanticTarget | null,
  mutationDiagnostic: PatchMapSemanticMutationDiagnostic,
): Extract<PatchMapSemanticRemovalResult, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    target,
    candidate: null,
    diagnostic: mutationDiagnostic,
  });
}

function targetLabel(target: PatchMapSemanticTarget): string {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

function requireAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing value at index ${index}`);
  return value;
}
