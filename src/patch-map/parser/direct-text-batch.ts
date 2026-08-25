import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from '../contracts';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';
import {
  cachePatchMapDirectParseIndexes,
  directTextParseIndexes,
  directTextTargetKey,
  type PatchMapDirectTextParseTargetIndex,
} from './direct-text-index';
import { parseComponent } from './component-text-lowering';
import {
  ROOT_CONTEXT,
  createElementIdentity,
} from './lowering-state';
import {
  createPatchMapParseState as createParseState,
  deepFreezePatchMapParserValue as deepFreeze,
  type PatchMapMutableExpandedItemIdentity as MutableExpandedItemIdentity,
  type PatchMapParseState as ParseState,
} from './parse-state';
import {
  attributeAlpha,
  boxSpacing,
  elementTransform,
  fixedSize,
  inspectAttributes,
  isParserRecord as isRecord,
  parseContentOrientation,
  type PatchMapParserBox as Box,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';

export interface PatchMapDirectTextParseUpdate {
  readonly ownerId: string;
  readonly componentId: string;
  readonly text: string;
}

/**
 * Re-project validated top-level item text components without reparsing their
 * unchanged sibling geometry. This remains a guarded parser path: any
 * diagnostic-bearing or identity-ambiguous input returns `null` so the caller
 * can use the canonical selected-root parser.
 */
export function parsePatchMapDirectTextBatch(
  input: unknown,
  previous: ParsePatchMapResult,
  updates: readonly PatchMapDirectTextParseUpdate[],
  options: ParsePatchMapOptions = {},
  resolvedTargets?: readonly PatchMapDirectTextParseTargetIndex[],
  recordStrategy: PatchMapStableRecordStrategy = 'frozen-copy',
): ParsePatchMapResult | null {
  if (!Array.isArray(input) || input.length === 0 || updates.length === 0) {
    return null;
  }
  if (resolvedTargets !== undefined && resolvedTargets.length !== updates.length) {
    return null;
  }
  const indexes = resolvedTargets === undefined
    ? directTextParseIndexes(previous, input.length)
    : null;
  if (resolvedTargets === undefined) {
    if (indexes === null) return null;
    for (let index = 0; index < input.length; index += 1) {
      const root: unknown = input[index];
      if (!isRecord(root) || root.id !== indexes.rootIds[index]) {
        return null;
      }
    }
  }

  const state = createParseState(options);
  const pending: Array<Readonly<{
    readonly entityId: string;
    readonly entityIndex: number;
  }>> = [];
  const seen = new Set<string>();
  for (const update of updates) {
    if (
      typeof update.ownerId !== 'string' ||
      update.ownerId.length === 0 ||
      typeof update.componentId !== 'string' ||
      update.componentId.length === 0 ||
      typeof update.text !== 'string'
    ) {
      return null;
    }
    const key = directTextTargetKey(update.ownerId, update.componentId);
    if (seen.has(key)) return null;
    seen.add(key);
    const indexed = resolvedTargets?.[pending.length] ?? indexes?.targets.get(key);
    if (
      indexed === undefined ||
      indexed.componentPath !==
        `$[${indexed.rootIndex}].components[${indexed.componentIndex}]` ||
      previous.document.entities[indexed.entityIndex]?.id !== indexed.entityId
    ) {
      return null;
    }
    const rootValue: unknown = input[indexed.rootIndex];
    if (
      !isRecord(rootValue) ||
      rootValue.id !== update.ownerId ||
      rootValue.type !== 'item' ||
      !Array.isArray(rootValue.components)
    ) {
      return null;
    }
    const component: unknown = rootValue.components[indexed.componentIndex];
    if (!isRecord(component) || component.type !== 'text' || component.text !== update.text) {
      return null;
    }
    if (
      previous.diagnostics.some((diagnostic) =>
        diagnostic.path === indexed.componentPath ||
        diagnostic.path.startsWith(`${indexed.componentPath}.`))
    ) {
      return null;
    }
    if (
      !appendDirectTextComponent(
        state,
        rootValue,
        indexed.rootIndex,
        component,
        indexed.componentIndex,
      )
    ) {
      return null;
    }
    pending.push(Object.freeze({
      entityId: indexed.entityId,
      entityIndex: indexed.entityIndex,
    }));
  }

  if (
    state.diagnostics.length !== 0 ||
    state.entities.length !== pending.length
  ) {
    return null;
  }
  const selectedEntities = new Map(
    state.entities.map((entity) => [entity.id, deepFreeze(entity)] as const),
  );
  if (selectedEntities.size !== state.entities.length) return null;
  const entities = [...previous.document.entities];
  const entityIds = pending.map(({ entityId }) => entityId);
  const entityProjections = patchPatchMapStableRecord(
    previous.projection.byEntityId,
    state.projectionByEntityId,
    entityIds,
    recordStrategy,
    true,
  );
  const textProjections = patchPatchMapStableRecord(
    previous.projection.textsByEntityId,
    state.textProjectionByEntityId,
    entityIds,
    recordStrategy,
    true,
  );
  if (entityProjections === null || textProjections === null) return null;
  for (const entry of pending) {
    const entity = selectedEntities.get(entry.entityId);
    const projection = state.projectionByEntityId[entry.entityId];
    const text = state.textProjectionByEntityId[entry.entityId];
    if (entity?.kind !== 'text' || projection === undefined || text === undefined) {
      return null;
    }
    entities[entry.entityIndex] = entity;
  }

  const result = Object.freeze({
    ...previous,
    document: Object.freeze({
      ...previous.document,
      entities: Object.freeze(entities),
    }),
    projection: Object.freeze({
      ...previous.projection,
      byEntityId: entityProjections,
      textsByEntityId: textProjections,
    }),
  });
  if (indexes !== null) cachePatchMapDirectParseIndexes(result, indexes);
  return result;
}

/**
 * Append one exact text component to a shared selected-component parse. The
 * caller finishes and freezes the parse once for the whole batch.
 */
function appendDirectTextComponent(
  state: ParseState,
  root: JsonRecord,
  rootIndex: number,
  component: JsonRecord,
  componentIndex: number,
): boolean {
  const rootId = root.id;
  if (typeof rootId !== 'string') return false;
  const rootPath = `$[${rootIndex}]`;
  const componentPath = `${rootPath}.components[${componentIndex}]`;
  state.sourceElements += 1;
  const element = createElementIdentity(root, rootId, rootPath, 'item');
  state.elementIdentities.push(element);
  state.sourceElementPathById.set(rootId, rootPath);
  const attrs = isRecord(root.attrs) ? root.attrs : undefined;
  inspectAttributes(attrs, `${rootPath}.attrs`, 'item', state);
  const transform = elementTransform(attrs, rootPath, ROOT_CONTEXT.transform, 'item', state);
  const size = fixedSize(root.size, `${rootPath}.size`, state);
  const padding = boxSpacing(root.padding, `${rootPath}.padding`, state);
  const content: Box = {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, size.width - padding.left - padding.right),
    height: Math.max(0, size.height - padding.top - padding.bottom),
  };
  const contentOrientation = parseContentOrientation(
    root.contentOrientation,
    `${rootPath}.contentOrientation`,
    rootId,
    state,
  );
  const instance: MutableExpandedItemIdentity = {
    instanceId: rootId,
    sourceElementId: rootId,
    sourcePath: rootPath,
    entityIds: [],
  };
  state.expandedItems.push(instance);
  parseComponent(
    component,
    componentPath,
    rootId,
    rootId,
    transform,
    size,
    content,
    contentOrientation,
    root.show !== false,
    {
      element,
      ancestors: [],
      opacity: attributeAlpha(attrs, `${rootPath}.attrs.alpha`, state),
      instance,
    },
    state,
  );
  return true;
}
