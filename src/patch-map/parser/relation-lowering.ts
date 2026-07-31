import {
  PatchMapParseError,
  type PatchMapRelationProjection,
} from '../contracts';
import { addEntity } from './lowering-state';
import {
  deepFreezePatchMapParserValue as deepFreeze,
  fatalPatchMapParse as fatal,
  warnPatchMapParseOnce as warnOnce,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parse-state';
import type { PatchMapParserTransform as Transform } from './transform-projection';
import {
  clamp01,
  finiteNumber,
  isParserRecord as isRecord,
  relationEndpoint,
  resolveColor,
  zIndex,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';

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
  const style = isRecord(value.style) ? value.style : {};
  if (style.alpha !== undefined && style.opacity !== undefined) {
    fatal(
      state,
      `${path}.style`,
      'relation-opacity-conflict',
      'Relation style alpha and opacity cannot both be authored',
      sourceId,
    );
  }
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
  // Aggregate relation geometry is a sequence of independent butt-capped
  // segments, so the materializer defaults are exact and need no warning.
  if (
    (style.cap !== undefined && style.cap !== 'butt') ||
    (style.join !== undefined && style.join !== 'miter')
  ) {
    warnOnce(state, 'relation-cap-join', `${path}.style`, 'relation-style-degraded', 'Relation cap/join are not retained or projected; basic line geometry is used', sourceId);
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
        color: resolveColor(style.color, 0x000000ff, `${path}.style.color`, state),
        lineWidth: Math.max(0, finiteNumber(style.width) ?? 1),
        opacity: owner.opacity *
          clamp01(finiteNumber(style.alpha) ?? finiteNumber(style.opacity) ?? 1),
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
      owner,
      entity,
    });
  });
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
      `PATCH MAP v0.10 parse failed with ${failures.length} error${failures.length === 1 ? '' : 's'}`,
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
