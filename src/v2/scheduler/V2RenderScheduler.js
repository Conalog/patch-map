export class V2RenderScheduler {
  constructor({
    schedule = defaultSchedule,
    frameBudgetMs = 4,
    now = defaultNow,
  } = {}) {
    this.schedule = schedule;
    this.frameBudgetMs = frameBudgetMs;
    this.now = now;
    this.pending = null;
    this.scheduled = false;
    this.appliedRevision = 0;
  }

  enqueue(work) {
    this.pending = mergeWork(this.pending, work);
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.flush());
  }

  flush(apply = null) {
    this.scheduled = false;
    const work = this.pending;
    this.pending = null;
    if (!work) return null;

    const startedAt = this.now();
    const result = {
      ...work,
      overBudget: false,
      elapsedMs: 0,
    };
    if (apply) {
      apply(work, {
        startedAt,
        frameBudgetMs: this.frameBudgetMs,
        shouldYield: () => this.now() - startedAt >= this.frameBudgetMs,
      });
    }
    result.elapsedMs = this.now() - startedAt;
    result.overBudget = result.elapsedMs >= this.frameBudgetMs;
    this.appliedRevision = work.revision;
    return result;
  }
}

const mergeWork = (previous, next) => {
  if (!previous) return next;
  if (!next) return previous;
  return {
    ...previous,
    ...next,
    renderDiff: mergeDiff(previous.renderDiff, next.renderDiff),
  };
};

const mergeDiff = (previous, next) => {
  if (!previous) return next;
  if (!next) return previous;
  return {
    added: mergeNodes(previous.added, next.added),
    updated: mergeNodes(previous.updated, next.updated),
    removed: mergeNodes(previous.removed, next.removed),
    changed: (previous.changed ?? 0) + (next.changed ?? 0),
  };
};

const mergeNodes = (left = [], right = []) => {
  const byId = new Map();
  for (const node of left) byId.set(node.id, node);
  for (const node of right) byId.set(node.id, node);
  return [...byId.values()];
};

const defaultSchedule = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

const defaultNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
