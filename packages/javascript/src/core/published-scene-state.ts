import type {
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import type { PatchMapScene } from './scene';

export interface PatchMapIndexedComponentTarget {
  readonly entityId: string;
  readonly entityIndex: number;
  readonly semanticOwnerId: string;
  /**
   * Direct component batches only accept top-level item owners. Retaining
   * their immutable source slots avoids rebuilding two 5,000-entry lookup
   * maps on every all-bar animation command.
   */
  readonly rootIndex: number | null;
  readonly componentIndex: number | null;
  readonly componentPath: string | null;
}

export interface PatchMapIndexedTextTarget {
  readonly entityId: string;
  readonly semanticOwnerId: string;
}

export interface PatchMapTransientIncrementalParse {
  readonly base: ParsePatchMapResult;
  readonly optionsKey: string;
  readonly dirtyRootIds: readonly string[];
  readonly dirtyIndices: readonly number[];
  readonly dirtyRoots: readonly object[];
  readonly selected: ParsePatchMapResult;
}

/**
 * One immutable reference for the semantic and dense authorities published by
 * a successful load. Viewport and presentation state remain independently
 * owned because they also change on their dedicated hot paths.
 */
export interface PatchMapPublishedSceneState {
  readonly scene: PatchMapScene;
  readonly parse: ParsePatchMapResult | null;
  readonly projection: PatchMapProjectionIndex | null;
  readonly ownedInputDataset: readonly unknown[] | null;
  readonly ownedParseOptionsKey: string | null;
  readonly transientIncrementalParse: PatchMapTransientIncrementalParse | null;
  readonly componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>;
  readonly textTargets: ReadonlyMap<string, PatchMapIndexedTextTarget | null>;
  readonly entityCount: number;
}

export type PatchMapPublishedSceneStateUpdate = Partial<PatchMapPublishedSceneState>;

export interface PatchMapPublishedSceneCandidate {
  readonly expected: PatchMapPublishedSceneState;
  readonly state: PatchMapPublishedSceneState;
}

export interface PatchMapPublishedScenePrevious {
  readonly previous: PatchMapPublishedSceneState;
  readonly published: PatchMapPublishedSceneState;
}

/**
 * The single write authority for the published scene reference.
 *
 * `prepare` cannot publish, `publish` swaps exactly one reference, and
 * `discard` can release only a scene that is no longer authoritative.
 */
export class PatchMapPublishedSceneAuthority {
  private stateValue: PatchMapPublishedSceneState;

  public constructor(initial: PatchMapPublishedSceneState) {
    this.stateValue = freezePatchMapPublishedSceneState(initial);
  }

  public current(): PatchMapPublishedSceneState {
    return this.stateValue;
  }

  public prepare(
    next: PatchMapPublishedSceneState,
  ): PatchMapPublishedSceneCandidate {
    return Object.freeze({
      expected: this.stateValue,
      state: freezePatchMapPublishedSceneState(next),
    });
  }

  public publish(
    candidate: PatchMapPublishedSceneCandidate,
  ): PatchMapPublishedScenePrevious {
    if (candidate.expected !== this.stateValue) {
      throw new Error('PatchMap published scene candidate was superseded');
    }
    const previous = this.stateValue;
    this.stateValue = candidate.state;
    return Object.freeze({ previous, published: candidate.state });
  }

  public restore(previous: PatchMapPublishedScenePrevious): void {
    // Intrinsic image reconciliation may refine the candidate projection with
    // another immutable state reference before a later load boundary throws.
    // The candidate scene remains the transaction identity throughout.
    if (
      this.stateValue !== previous.published &&
      this.stateValue.scene !== previous.published.scene
    ) {
      throw new Error('PatchMap published scene rollback was superseded');
    }
    this.stateValue = previous.previous;
  }

  public update(
    patch: PatchMapPublishedSceneStateUpdate,
  ): PatchMapPublishedSceneState {
    const next = freezePatchMapPublishedSceneState({
      ...this.stateValue,
      ...patch,
    });
    this.stateValue = next;
    return next;
  }

  public discard(state: PatchMapPublishedSceneState): boolean {
    if (state === this.stateValue || state.scene === this.stateValue.scene) {
      return false;
    }
    return state.scene.destroy();
  }
}

export function freezePatchMapPublishedSceneState(
  state: PatchMapPublishedSceneState,
): PatchMapPublishedSceneState {
  return Object.isFrozen(state) ? state : Object.freeze({ ...state });
}
