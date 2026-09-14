import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import type { PatchMapMutationOperation } from '../semantic/transaction';
import type {
  PatchMapApi,
  PatchMapTransactionOperation,
  PatchMapTransactionOptions,
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateBatchOptions,
  PatchMapUpdateOptions,
  PatchMapUpdateResult,
  PatchMapUpdateTargetsInput,
} from './contracts';
import {
  batchRow,
  animatedBarTargetForUpdate,
  fastBarBatch,
  fastBarUpdate,
  fastInstancePresentationBatch,
  fastInstancePresentationUpdate,
  fastTextBatch,
  fastTextUpdate,
  normalizeBatchInput,
  normalizeBatchAnimation,
  validateBatchColumns,
} from './mutation-batch';
import {
  commitBarUpdates,
  commitInstancePresentation,
  commitOperations,
  commitTextUpdates,
  commitTransactionOperations,
  EMPTY_UPDATE_RESULT,
  type PatchMapMutationDeveloperHost,
} from './mutation-commit';
import {
  lowerTransactionOperation,
  lowerUpdate,
  mutationContext,
  normalizeTransactionOperations,
  normalizeUpdate,
  type MutationContext,
  type ResolvedComponent,
} from './mutation-lowering';

export type { PatchMapMutationDeveloperHost } from './mutation-commit';

export interface PatchMapMutationDeveloperDependencies {
  resolveTargets(targets: PatchMapUpdateTargetsInput): Readonly<{
    readonly selected: readonly PatchMapLogicalTargetSnapshot[];
    readonly sceneTargets: readonly PatchMapLogicalTargetSnapshot[];
  }>;
  sceneTargets(): readonly PatchMapLogicalTargetSnapshot[];
}

export function createPatchMapMutationApi(
  host: PatchMapMutationDeveloperHost,
  dependencies: PatchMapMutationDeveloperDependencies,
): Pick<PatchMapApi, 'update' | 'updateBatch' | 'transaction'> {
  const update = (
    input: PatchMapUpdate,
    options: PatchMapUpdateOptions = {},
  ): PatchMapUpdateResult => {
    if (Array.isArray(input)) {
      throw new TypeError(
        'update() accepts one owner. Use transaction([...]) for heterogeneous changes or updateBatch({ targets, ... }) for columnar changes.',
      );
    }
    const normalized = normalizeUpdate(input);
    const resolved = dependencies.resolveTargets(normalized.id);
    const context = mutationContext(resolved.sceneTargets);
    const preferred = resolved.selected[0];
    const fastBar = fastBarUpdate(normalized, preferred, context);
    if (fastBar !== null) {
      if (fastBar.instance || rootOwner(fastBar, context)) {
        return commitBarUpdates(host, [fastBar], options);
      }
      return commitTransactionOperations(host, lowerUpdate(normalized, preferred, context), options,
        options.animate === false ? Object.freeze([]) : undefined);
    }
    const fastPresentation = fastInstancePresentationUpdate(normalized, preferred, context);
    if (fastPresentation !== null) {
      return commitInstancePresentation(host, fastPresentation, options);
    }
    const fastText = fastTextUpdate(normalized, preferred, context);
    if (fastText !== null && rootOwner(fastText, context, 'item')) {
      return commitTextUpdates(host, [fastText], options);
    }
    return commitOperations(host, lowerUpdate(normalized, preferred, context), options);
  };

  const updateBatch = (
    input: PatchMapUpdateBatch,
    options: PatchMapUpdateBatchOptions = {},
  ): PatchMapUpdateResult => {
    if (Array.isArray(input)) {
      throw new TypeError(
        'updateBatch() accepts columnar { targets, ... } input. Use transaction([...]) for heterogeneous row updates.',
      );
    }
    const normalized = normalizeBatchInput(input);
    const resolved = dependencies.resolveTargets(normalized.targets);
    const selected = resolved.selected;
    validateBatchColumns(normalized, selected.length);
    const normalizedAnimation = normalizeBatchAnimation(options.animate, selected.length);
    const batchOptions: PatchMapUpdateBatchOptions = Object.freeze({
      ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
      ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
      ...(normalizedAnimation === undefined ? {} : { animate: normalizedAnimation }),
    });
    if (selected.length === 0) return EMPTY_UPDATE_RESULT;

    const context = mutationContext(resolved.sceneTargets);
    const fastBars = fastBarBatch(normalized, selected, context);
    if (fastBars !== null) {
      if (fastBars.every((bar) => bar.instance || rootOwner(bar, context))) {
        return commitBarUpdates(host, fastBars, batchOptions, normalized.bar!.height);
      }
      if (fastBars.some((bar) => bar.instance)) {
        throw new TypeError('updateBatch() cannot mix authored and concrete grid-instance bar targets');
      }
      const operations = selected.flatMap((target, index) =>
        lowerUpdate(batchRow(normalized, target, index), target, context));
      const animation = batchOptions.animate;
      const animatedTargets = animation === false
        ? Object.freeze([])
        : Array.isArray(animation)
          ? Object.freeze(fastBars.filter((_bar, index) => animation[index] === true)
            .map(({ ownerId, componentId }) => Object.freeze({ ownerId, componentId })))
          : undefined;
      return commitTransactionOperations(host, operations, batchOptions, animatedTargets);
    }
    if (Array.isArray(batchOptions.animate) && normalized.bar?.height === undefined) {
      throw new TypeError(
        'options.animate columns require a direct bar-height batch; companion concrete presentation fields may share that batch',
      );
    }
    const fastPresentation = fastInstancePresentationBatch(normalized, selected, context);
    if (fastPresentation !== null) {
      return commitInstancePresentation(host, fastPresentation, batchOptions);
    }
    if (Array.isArray(batchOptions.animate)) {
      throw new TypeError(
        'options.animate columns require a direct bar-height batch; companion concrete presentation fields may share that batch',
      );
    }
    const uniformOptions = batchOptions as PatchMapUpdateOptions;
    const fastTexts = fastTextBatch(normalized, selected, context);
    if (fastTexts !== null && fastTexts.every((text) => rootOwner(text, context, 'item'))) {
      return commitTextUpdates(host, fastTexts, uniformOptions);
    }

    const operations: PatchMapMutationOperation[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const preferred = selected[index]!;
      operations.push(...lowerUpdate(batchRow(normalized, preferred, index), preferred, context));
    }
    return commitOperations(host, operations, uniformOptions);
  };

  const transaction = (
    inputs: readonly PatchMapTransactionOperation[],
    options: PatchMapTransactionOptions = {},
  ): PatchMapUpdateResult => {
    if (!Array.isArray(inputs as unknown)) {
      throw new TypeError('transaction() requires an ordered operation array');
    }
    const normalized = normalizeTransactionOperations(inputs);
    if (normalized.length === 0) return EMPTY_UPDATE_RESULT;
    const context = mutationContext(dependencies.sceneTargets());
    const animation = normalizeBatchAnimation(options.animate, normalized.length);
    const animatedBarTargets = animation === undefined || animation === true
      ? undefined
      : animation === false
        ? Object.freeze([])
        : Object.freeze([...new Map(normalized.flatMap((input, index) => {
            if (animation[index] !== true || input.type !== 'update') return [];
            const target = animatedBarTargetForUpdate(input, undefined, context);
            if (target === null) return [];
            if (target.instance) {
              throw new TypeError(
                'transaction operation animation targets must be authored owners; use updateBatch for concrete grid instances',
              );
            }
            const visualTarget = Object.freeze({
              ownerId: target.ownerId,
              componentId: target.componentId,
            });
            return [[`${visualTarget.ownerId}\u0000${visualTarget.componentId}`, visualTarget] as const];
          })).values()]);
    const operations: PatchMapMutationOperation[] = [];
    for (const input of normalized) {
      operations.push(...lowerTransactionOperation(input, context));
    }
    return commitTransactionOperations(host, operations, options, animatedBarTargets);
  };

  return Object.freeze({ update, updateBatch, transaction });
}

/** Direct column planners accept owned roots; nested edits use the general planner. */
function rootOwner(component: ResolvedComponent, context: MutationContext, type?: string): boolean {
  const owner = context.byKey.get(`element:${component.ownerId}`);
  return owner?.topLevel === true && (type === undefined || owner.type === type);
}
