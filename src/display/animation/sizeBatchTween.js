import gsap from 'gsap';

const BATCHER_CACHE = new WeakMap();
const DEFAULT_EASE = 'power2.inOut';

export const getSizeBatcher = (store) => {
  const animationContext = store?.animationContext;
  if (!animationContext) return null;

  let batcher = BATCHER_CACHE.get(animationContext);
  if (!batcher) {
    batcher = createSizeBatcher(animationContext);
    BATCHER_CACHE.set(animationContext, batcher);
  }
  return batcher;
};

const createSizeBatcher = (animationContext) => {
  let currentBatch = null;

  const releaseBatch = (batch) => {
    if (currentBatch === batch) currentBatch = null;
  };

  const ensureOpenBatch = (durationMs) => {
    if (!currentBatch || currentBatch.started) {
      currentBatch = createBatch();
    }
    extendBatchDuration(currentBatch, durationMs);
    return currentBatch;
  };

  const enqueue = (job) => {
    initializeJob(job);

    if (job.durationMs === 0) {
      applyJobState(job, job.to);
      completeJob(job);
      return job;
    }

    const batch = ensureOpenBatch(job.durationMs);
    batch.jobs.push(job);
    ensureBatchDriver(batch, animationContext, releaseBatch);
    return job;
  };

  const cancel = (job, { applyToEnd = false } = {}) => {
    if (!job || job.done) return;
    job.cancelled = true;
    if (applyToEnd) {
      applyJobState(job, job.to);
    }
    completeJob(job);
  };

  return { enqueue, cancel };
};

const createBatch = () => ({
  jobs: [],
  maxDurationMs: 0,
  dummy: { t: 0 },
  tween: null,
  started: false,
});

const initializeJob = (job) => {
  job.cancelled = false;
  job.done = false;
  job.durationMs = normalizeDuration(job.durationMs);
  job.easeFn = gsap.parseEase(job.ease || DEFAULT_EASE);
};

const ensureBatchDriver = (batch, animationContext, releaseBatch) => {
  if (batch.tween) return;

  const update = () => {
    batch.started = true;
    const activeJobs = advanceBatch(batch);
    if (activeJobs === 0 && batch.tween) {
      batch.tween.kill();
      releaseBatch(batch);
    }
  };

  const finish = () => {
    finishBatch(batch);
    releaseBatch(batch);
  };

  const createDriver = () => {
    batch.tween = gsap.to(batch.dummy, {
      t: 1,
      duration: batch.maxDurationMs / 1000,
      ease: 'none',
      onUpdate: update,
      onComplete: finish,
      onInterrupt: finish,
    });
  };

  if (animationContext && typeof animationContext.add === 'function') {
    animationContext.add(createDriver);
  } else {
    createDriver();
  }
};

const extendBatchDuration = (batch, durationMs) => {
  if (durationMs <= batch.maxDurationMs) return;
  batch.maxDurationMs = durationMs;
  if (batch.tween) {
    batch.tween.duration(batch.maxDurationMs / 1000);
  }
};

const advanceBatch = (batch) => {
  const elapsed = batch.dummy.t * batch.maxDurationMs;
  let activeJobs = 0;

  for (const job of batch.jobs) {
    if (!isPendingJob(job)) continue;

    const target = job.target;
    if (!isRenderableTarget(target)) {
      completeJob(job);
      continue;
    }

    activeJobs += 1;

    const localProgress =
      job.durationMs === 0 ? 1 : clamp01(elapsed / job.durationMs);
    const easedProgress = job.easeFn(localProgress);
    const nextState = interpolateState(job.from, job.to, easedProgress);

    applyTargetState(target, nextState);

    if (localProgress >= 1) {
      completeJob(job);
    }
  }

  return activeJobs;
};

const finishBatch = (batch) => {
  for (const job of batch.jobs) {
    if (!isPendingJob(job)) continue;
    applyJobState(job, job.to);
    completeJob(job);
  }
};

const applyJobState = (job, state) => {
  const target = job?.target;
  if (!isRenderableTarget(target)) return;
  applyTargetState(target, state);
};

const applyTargetState = (target, state) => {
  if (typeof target.setSize === 'function') {
    target.setSize(state.w, state.h);
  } else {
    target.width = state.w;
    target.height = state.h;
  }

  if (target.position && typeof target.position.set === 'function') {
    target.position.set(state.x, state.y);
  } else {
    target.x = state.x;
    target.y = state.y;
  }
};

const interpolateState = (from, to, progress) => ({
  w: lerp(from.w, to.w, progress),
  h: lerp(from.h, to.h, progress),
  x: lerp(from.x, to.x, progress),
  y: lerp(from.y, to.y, progress),
});

const completeJob = (job) => {
  if (!job || job.done) return;
  job.done = true;
  if (typeof job.onDone === 'function') job.onDone();
};

const isPendingJob = (job) => job && !job.done && !job.cancelled;

const isRenderableTarget = (target) => Boolean(target && !target.destroyed);

const normalizeDuration = (durationMs) => Math.max(0, Number(durationMs) || 0);

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const lerp = (from, to, progress) => from + (to - from) * progress;
