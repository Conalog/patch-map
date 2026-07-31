import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from '../contracts';
import {
  inheritPatchMapV010DirectParseIndexes,
  parsePatchMapV010,
  parsePatchMapV010DirectTextBatch,
} from '../parser';
import {
  inheritPatchMapV010IncrementalParserCaches,
  parsePatchMapV010DirectElementAngleBatch,
  parsePatchMapV010IncrementalFlat,
  parsePatchMapV010IncrementalStructure,
  patchMapV010StructuralChangedEntityIds,
} from '../incremental-parser';
import {
  inheritRendererDegradationDiagnostics,
  inheritRendererDegradationDiagnosticsIncremental,
  withRendererDegradationDiagnostics,
} from '../renderers/degradation';
import type { PatchMapRendererStrategy } from '../renderers/types';
import type { PatchMapScene } from '../scene';
import {
  planPatchMapParsedSceneReconcile,
  planPatchMapParsedSceneReconcileIncremental,
  planPatchMapParsedSceneReconcileStructuralWindow,
  type PatchMapDenseReconcilePlan,
} from '../semantic/reconcile';
import type { PatchMapStableRecordStrategy } from '../semantic/stable-record-overlay';
import type { PatchMapReconcileOptions } from './contracts';
import { reconcileDirectBarHeightParse } from './direct-bar-reconcile';
import { jsonEquivalent } from './projection-records';
import type { PatchMapPublishedSceneState } from './published-scene-state';
import {
  cachedTransientSelectedParse,
  changedProjectionEntityIds,
  directBarEntityIds,
  directElementAngleEntityIds,
  directTextEntityIds,
  directTextParseTargetHints,
  incrementalDenseEntityIds,
  matchesOwnedIncrementalInput,
  matchesOwnedStructuralInput,
  structuralTargetMappingsReusable,
} from './reconcile-planning';
import { denseReconcileOptions } from './semantic-dense-planning';

type PatchMapReconcileCandidatePath =
  | 'direct-bar'
  | 'direct-text'
  | 'direct-angle'
  | 'structural'
  | 'incremental'
  | 'full';

interface PatchMapPreparedReconcileCandidate {
  readonly parse: ParsePatchMapResult;
  readonly plan: PatchMapDenseReconcilePlan;
  readonly path: PatchMapReconcileCandidatePath;
  readonly incrementalEntityIds: readonly string[] | undefined;
  readonly hierarchyOnlyTargetMapping: boolean;
  readonly structuralPresentationEntityIds: readonly string[] | undefined;
  readonly semanticChanged: boolean;
  readonly parseOptions: ParsePatchMapOptions;
  readonly parseMs: number;
  readonly planMs: number;
}

/** Prepare one private semantic/dense candidate without publishing runtime state. */
export function preparePatchMapReconcileCandidate(
  input: unknown,
  options: PatchMapReconcileOptions,
  defaultParseOptions: ParsePatchMapOptions,
  currentParse: ParsePatchMapResult,
  published: PatchMapPublishedSceneState,
  scene: PatchMapScene,
  stableRecordStrategy: PatchMapStableRecordStrategy,
  rendererStrategy: PatchMapRendererStrategy,
): PatchMapPreparedReconcileCandidate {
  const parseStarted = now();
  const parseOptions = options.parse ?? defaultParseOptions;
  const directBarParse = options.directBarHeightUpdates === undefined ||
    !matchesOwnedIncrementalInput(
      input,
      options.directBarHeightUpdates.map(({ ownerId }) => ownerId),
      parseOptions,
      published,
    )
    ? null
    : reconcileDirectBarHeightParse(
        input,
        currentParse,
        options.directBarHeightUpdates,
        published.componentTargets,
        stableRecordStrategy,
      );
  const directTextParse =
    directBarParse !== null ||
    options.directTextUpdates === undefined ||
    !matchesOwnedIncrementalInput(
      input,
      options.directTextUpdates.map(({ ownerId }) => ownerId),
      parseOptions,
      published,
    )
      ? null
      : parsePatchMapV010DirectTextBatch(
          input,
          currentParse,
          options.directTextUpdates,
          parseOptions,
          directTextParseTargetHints(
            options.directTextUpdates,
            published.componentTargets,
          ),
          stableRecordStrategy,
        );
  const directElementAngleParse =
    directBarParse !== null ||
    directTextParse !== null ||
    options.directElementAngleUpdates === undefined ||
    published.ownedInputDataset === null ||
    !matchesOwnedIncrementalInput(
      input,
      options.directElementAngleUpdates.map(({ id }) => id),
      parseOptions,
      published,
    )
      ? null
      : parsePatchMapV010DirectElementAngleBatch(
          input,
          published.ownedInputDataset,
          currentParse,
          options.directElementAngleUpdates,
          stableRecordStrategy,
        );
  const structuralParse =
    directBarParse !== null ||
    directTextParse !== null ||
    directElementAngleParse !== null ||
    options.structuralSharing !== true ||
    !matchesOwnedStructuralInput(input, parseOptions, published)
      ? null
      : parsePatchMapV010IncrementalStructure(
          input,
          published.ownedInputDataset,
          currentParse,
          parseOptions,
        );
  const incrementalInputMatches =
    directBarParse === null &&
    directTextParse === null &&
    directElementAngleParse === null &&
    structuralParse === null &&
    options.incrementalRootIds !== undefined &&
    matchesOwnedIncrementalInput(
      input,
      options.incrementalRootIds,
      parseOptions,
      published,
    );
  const cachedSelectedParse = !incrementalInputMatches
    ? null
    : cachedTransientSelectedParse(
        input,
        currentParse,
        options.incrementalRootIds ?? [],
        parseOptions,
        published,
      );
  const incrementalParse = !incrementalInputMatches
    ? null
    : parsePatchMapV010IncrementalFlat(
        input,
        currentParse,
        options.incrementalRootIds ?? [],
        parseOptions,
        cachedSelectedParse ?? undefined,
        stableRecordStrategy,
      );
  const parserResult =
    directBarParse ??
      directTextParse ??
      directElementAngleParse ??
      structuralParse ??
      incrementalParse ??
      parsePatchMapV010(input, parseOptions);
  const incrementalEntityIds = directBarParse !== null
    ? directBarEntityIds(
        options.directBarHeightUpdates ?? [],
        published.componentTargets,
      )
    : directTextParse !== null
      ? directTextEntityIds(options.directTextUpdates ?? [], published.textTargets)
      : directElementAngleParse !== null
        ? directElementAngleEntityIds(
            currentParse,
            options.directElementAngleUpdates ?? [],
          )
        : incrementalParse === null
          ? undefined
          : incrementalDenseEntityIds(
              parserResult,
              options.incrementalRootIds ?? [],
            );
  const hierarchyOnlyTargetMapping =
    structuralParse !== null &&
    structuralTargetMappingsReusable(currentParse, parserResult, options);
  const structuralPresentationEntityIds = structuralParse === null
    ? undefined
    : patchMapV010StructuralChangedEntityIds(parserResult) ??
      changedProjectionEntityIds(
        currentParse.projection,
        parserResult.projection,
      );
  if (
    directBarParse !== null ||
    directTextParse !== null ||
    directElementAngleParse !== null ||
    hierarchyOnlyTargetMapping
  ) {
    inheritRendererDegradationDiagnostics(currentParse, parserResult);
  } else if (
    incrementalParse !== null &&
    incrementalEntityIds !== undefined
  ) {
    inheritRendererDegradationDiagnosticsIncremental(
      currentParse,
      parserResult,
      incrementalEntityIds,
    );
  }
  const parse = withRendererDegradationDiagnostics(parserResult, rendererStrategy);
  inheritPatchMapV010DirectParseIndexes(parserResult, parse);
  inheritPatchMapV010IncrementalParserCaches(parserResult, parse);
  const parseMs = now() - parseStarted;

  const planStarted = now();
  const reconcileOptions = denseReconcileOptions(
    options,
    currentParse,
    parse,
    scene.selection().refs.flatMap((ref) => {
      const entity = scene.get(ref);
      return entity === null ? [] : [entity.id];
    }),
  );
  const plan = (
    incrementalEntityIds === undefined
      ? null
      : planPatchMapParsedSceneReconcileIncremental(
          currentParse.document,
          parse.document,
          incrementalEntityIds,
          reconcileOptions,
          true,
        )
  ) ?? (
    structuralParse === null
      ? null
      : planPatchMapParsedSceneReconcileStructuralWindow(
          currentParse.document,
          parse.document,
          reconcileOptions,
        )
  ) ?? planPatchMapParsedSceneReconcile(
    currentParse.document,
    parse.document,
    reconcileOptions,
  );
  const semanticChanged = directBarParse !== null ||
    directTextParse !== null ||
    directElementAngleParse !== null ||
    structuralParse !== null ||
    incrementalParse !== null ||
    !jsonEquivalent(currentParse, parse);
  const planMs = now() - planStarted;

  return Object.freeze({
    parse,
    plan,
    path: directBarParse !== null
      ? 'direct-bar'
      : directTextParse !== null
        ? 'direct-text'
        : directElementAngleParse !== null
          ? 'direct-angle'
          : structuralParse !== null
            ? 'structural'
            : incrementalParse !== null
              ? 'incremental'
              : 'full',
    incrementalEntityIds,
    hierarchyOnlyTargetMapping,
    structuralPresentationEntityIds,
    semanticChanged,
    parseOptions,
    parseMs,
    planMs,
  });
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
