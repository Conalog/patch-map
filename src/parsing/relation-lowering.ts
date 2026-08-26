import {
  PatchMapParseError,
  type PatchMapRelationProjection,
} from './contracts';
import { addEntity } from './lowering-state';
import {
  deepFreezePatchMapParserValue as deepFreeze,
  fatalPatchMapParse as fatal,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parse-state';
import type { PatchMapParserTransform as Transform } from './transform-projection';
import {
  finiteNumber,
  isParserRecord as isRecord,
  relationEndpoint,
  resolveColor,
  zIndex,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';
import { appendPatchMapStackingFrame } from '../semantic/stacking';

const RELATION_STYLE_FIELDS = new Set(['color', 'alpha', 'width']);

export function parseRelations(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!Array.isArray(value.links)) {
    fatal(state, `${path}.links`, 'invalid-relations', 'Relations links must be an array', sourceId);
  }
  const style = relationStyle(value.style, `${path}.style`, sourceId, state);
  const unknownStyleField = Object.keys(style)
    .sort()
    .find((key) => !RELATION_STYLE_FIELDS.has(key));
  if (unknownStyleField !== undefined) {
    fatal(
      state,
      `${path}.style.${unknownStyleField}`,
      'unknown-relation-style-field',
      `Relation style contains unknown field ${JSON.stringify(unknownStyleField)}`,
      sourceId,
    );
  }
  const lineWidth = relationStyleNumber(
    style.width,
    `${path}.style.width`,
    'invalid-relation-width',
    sourceId,
    state,
    (value) => value >= 0,
    'Relation width must be a nonnegative finite number',
  );
  const styleAlpha = relationStyleNumber(
    style.alpha,
    `${path}.style.alpha`,
    'invalid-relation-alpha',
    sourceId,
    state,
    (value) => value >= 0 && value <= 1,
    'Relation alpha must be a finite number in the range 0..1',
  );
  const color = resolveColor(style.color, 0x000000ff, `${path}.style.color`, state);
  const determinant = transform.affine[0] * transform.affine[3] -
    transform.affine[1] * transform.affine[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    fatal(
      state,
      `${path}.attrs`,
      'non-invertible-relation-transform',
      'Relations transform must remain invertible for relation-local projection',
      sourceId,
    );
  }
  value.links.forEach((linkValue, index) => {
    const linkPath = `${path}.links[${index}]`;
    if (!isRecord(linkValue)) {
      fatal(state, linkPath, 'invalid-relation-link', 'Relation link must be an object', sourceId);
    }
    const from = relationEndpoint(linkValue.source, `${linkPath}.source`, state, sourceId);
    const to = relationEndpoint(linkValue.target, `${linkPath}.target`, state, sourceId);
    const pairKey = relationPairKey(from, to);
    const relationPairs = state.relationPairsBySourceId.get(sourceId) ?? new Set<string>();
    if (relationPairs.has(pairKey)) return;
    relationPairs.add(pairKey);
    state.relationPairsBySourceId.set(sourceId, relationPairs);
    const entityId = relationEntityId(sourceId, pairKey);
    state.relationLinks += 1;
    const entity = {
        kind: 'relation',
        id: entityId,
        from,
        to,
        color,
        lineWidth,
        opacity: owner.opacity * styleAlpha,
        visible,
        interactive: false,
        zIndex: zIndex(value.attrs),
        tags: ['relation', `source:${sourceId}`],
      } as const;
    state.pendingRelations.push({
      path: linkPath,
      entityId,
      relationId: sourceId,
      authoredIndex: index,
      from,
      to,
      transform,
      owner: {
        ...owner,
        stackingPath: appendPatchMapStackingFrame(owner.stackingPath, 0, index),
      },
      entity,
    });
  });
}

function relationStyleNumber(
  value: unknown,
  path: string,
  code: string,
  sourceId: string,
  state: ParseState,
  accepts: (value: number) => boolean,
  message: string,
): number {
  if (value === undefined) return 1;
  const parsed = finiteNumber(value);
  if (parsed !== undefined && accepts(parsed)) return parsed;
  fatal(state, path, code, message, sourceId);
}

function relationStyle(
  value: unknown,
  path: string,
  sourceId: string,
  state: ParseState,
): JsonRecord {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    fatal(state, path, 'invalid-relation-style', 'Relation style must be an object', sourceId);
  }
  return value;
}

export function validateRelationEndpoints(state: ParseState): void {
  for (const relation of state.pendingRelations) {
    const sourceExists = state.targetIds.has(relation.from);
    const targetExists = state.targetIds.has(relation.to);
    const projection = Object.freeze({
      entityId: relation.entityId,
      relationId: relation.relationId,
      sourceId: relation.from,
      targetId: relation.to,
      key: `${relation.from}>${relation.to}`,
      identityKey: relationPairKey(relation.from, relation.to),
      authoredIndex: relation.authoredIndex,
      affine: relation.transform.affine,
      stackingPath: relation.owner.stackingPath,
    } satisfies PatchMapRelationProjection);
    if (sourceExists && targetExists) {
      state.relationProjectionByEntityId[relation.entityId] = projection;
      addEntity(relation.entity, relation.owner, state);
      continue;
    }
    const reason = !sourceExists && !targetExists
      ? 'missing-source-and-target'
      : !sourceExists
        ? 'missing-source'
        : 'missing-target';
    state.omittedRelations.push(Object.freeze({ ...projection, reason }));
    state.diagnostics.push({
      level: 'warning',
      code: 'omitted-relation-endpoint',
      path: relation.path,
      message: `Relation segment was omitted because ${reason.replaceAll('-', ' ')}`,
      entityId: relation.entityId,
    });
  }
  const failures = state.diagnostics.filter((entry) => entry.level === 'error');
  if (failures.length > 0) {
    throw new PatchMapParseError(
      `PatchMap parse failed with ${failures.length} error${failures.length === 1 ? '' : 's'}`,
      deepFreeze([...state.diagnostics]),
    );
  }
}

function relationPairKey(source: string, target: string): string {
  return `${source.length}:${source}${target.length}:${target}`;
}

function relationEntityId(relationId: string, identityKey: string): string {
  return `@relation:${relationId.length}:${relationId}${identityKey}`;
}
