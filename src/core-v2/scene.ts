import { CoreScene, type CoreSceneCreateOptions } from '../core-v1/scene';
import type {
  AdvanceResult,
  CommitResult,
  FrameReport,
  LoadResult,
  SceneDocument,
  SceneSnapshot,
  SelectionSnapshot,
  SlotRange,
  TransactionBatch,
} from '../core-v1/contracts';

const DEFAULT_CAPACITY = 16;
const COOPERATIVE_CHUNK_SIZE = 128;
const MAX_COOPERATIVE_CHUNK_SIZE = 512;

/**
 * Core v2's thin revision-preserving scene adapter.
 *
 * A private first-load candidate may be populated through bounded transactions
 * before publication. The underlying CoreScene therefore advances once per
 * chunk, while this adapter keeps the public load revision at one and translates
 * every later revision back to the same logical sequence as a normal load.
 */
export class CoreV2Scene extends CoreScene {
  private revisionOffset = 0;
  private readonly capacityFloor: number;

  public constructor(options: CoreSceneCreateOptions = {}) {
    super(options);
    this.capacityFloor = options.initialCapacity ?? DEFAULT_CAPACITY;
  }

  public override get revision(): number {
    return super.revision - this.revisionOffset;
  }

  public override load(document: SceneDocument): LoadResult {
    return this.logicalLoadResult(super.load(document));
  }

  public async loadCooperatively(
    document: SceneDocument,
    assertCurrent: () => void,
  ): Promise<LoadResult> {
    if (super.revision !== 0) {
      throw new Error('CoreV2Scene cooperative load requires a fresh candidate');
    }
    const chunks = planCooperativeChunks(document);
    if (chunks === null || chunks.length <= 1) return this.load(document);

    const emptyDocument: SceneDocument = Object.freeze({
      ...document,
      entities: Object.freeze([]),
    });
    super.load(emptyDocument);
    let changedRanges: readonly SlotRange[] = Object.freeze([]);
    for (const [index, entities] of chunks.entries()) {
      assertCurrent();
      const batch: TransactionBatch = Object.freeze({
        operations: Object.freeze(entities.map((entity) =>
          Object.freeze({ type: 'add' as const, entity }))),
        recordHistory: false,
      });
      changedRanges = super.commit(batch).changedRanges;
      if (index === chunks.length - 1) continue;
      await yieldSceneTask();
    }
    assertCurrent();
    this.revisionOffset = super.revision - 1;
    return Object.freeze({
      revision: 1,
      entityCount: document.entities.length,
      capacity: denseCapacity(
        Math.max(this.capacityFloor, document.entities.length),
      ),
      changedRanges,
    });
  }

  public override commit(batch: TransactionBatch): CommitResult {
    const result = super.commit(batch);
    return Object.freeze({
      ...result,
      revision: this.logicalRevision(result.revision),
    });
  }

  public override advance(timeMs: number): AdvanceResult {
    const result = super.advance(timeMs);
    return Object.freeze({
      ...result,
      revision: this.logicalRevision(result.revision),
    });
  }

  public override flush(): FrameReport {
    const report = super.flush();
    return Object.freeze({
      ...report,
      revision: this.logicalRevision(report.revision),
    });
  }

  public override selection(): SelectionSnapshot {
    const selection = super.selection();
    return Object.freeze({
      ...selection,
      revision: this.logicalRevision(selection.revision),
    });
  }

  public override snapshot(): SceneSnapshot {
    const snapshot = super.snapshot();
    return Object.freeze({
      ...snapshot,
      revision: this.logicalRevision(snapshot.revision),
    });
  }

  private logicalLoadResult(result: LoadResult): LoadResult {
    return Object.freeze({
      ...result,
      revision: this.logicalRevision(result.revision),
    });
  }

  private logicalRevision(revision: number): number {
    return revision - this.revisionOffset;
  }
}

function planCooperativeChunks(
  document: SceneDocument,
): readonly (readonly SceneDocument['entities'][number][])[] | null {
  const entities = document.entities;
  if (entities.length <= COOPERATIVE_CHUNK_SIZE) return Object.freeze([entities]);
  const indexById = new Map(entities.map((entity, index) => [entity.id, index]));
  const chunks: Array<readonly SceneDocument['entities'][number][]> = [];
  let start = 0;
  while (start < entities.length) {
    let end = Math.min(start + COOPERATIVE_CHUNK_SIZE, entities.length);
    let cursor = start;
    while (cursor < end) {
      const entity = entities[cursor];
      if (entity?.kind === 'relation') {
        const from = indexById.get(entity.from);
        const to = indexById.get(entity.to);
        if (from === undefined || to === undefined) return null;
        end = Math.max(end, from + 1, to + 1);
        if (end - start > MAX_COOPERATIVE_CHUNK_SIZE) return null;
      }
      cursor += 1;
    }
    chunks.push(Object.freeze(entities.slice(start, end)));
    start = end;
  }
  return Object.freeze(chunks);
}

function denseCapacity(required: number): number {
  let capacity = DEFAULT_CAPACITY;
  while (capacity < Math.max(1, required)) capacity *= 2;
  return capacity;
}

function yieldSceneTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
