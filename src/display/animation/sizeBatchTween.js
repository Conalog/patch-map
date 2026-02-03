import gsap from 'gsap';

const BATCHER_CACHE = new WeakMap();
const DEFAULT_EASE = 'power2.inOut';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const lerp = (from, to, progress) => from + (to - from) * progress;

const applyJobState = (job, state) => {
  const target = job?.target;
  if (!target || target.destroyed) return;

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

const markDone = (job) => {
  job.done = true;
  if (typeof job.onDone === 'function') job.onDone();
};

const createSizeBatcher = (animationContext) => {
  let currentBatch = null;

  const createBatch = () => ({
    jobs: [],
    maxDurationMs: 0,
    dummy: { t: 0 },
    tween: null,
    started: false,
  });

  const updateBatchDuration = (batch, durationMs) => {
    if (durationMs <= batch.maxDurationMs) return;
    batch.maxDurationMs = durationMs;
    if (batch.tween) {
      batch.tween.duration(batch.maxDurationMs / 1000);
    }
  };

  const startBatch = (batch) => {
    const update = () => {
      batch.started = true;
      const elapsed = batch.dummy.t * batch.maxDurationMs;
      let activeCount = 0;

      for (const job of batch.jobs) {
        if (job.done || job.cancelled) continue;
        const target = job.target;
        if (!target || target.destroyed) {
          markDone(job);
          continue;
        }
        activeCount += 1;

        const durationMs = Math.max(0, job.durationMs || 0);
        const localProgress =
          durationMs === 0 ? 1 : clamp01(elapsed / durationMs);
        const easedProgress = job.easeFn(localProgress);

        const w = lerp(job.from.w, job.to.w, easedProgress);
        const h = lerp(job.from.h, job.to.h, easedProgress);
        const x = lerp(job.from.x, job.to.x, easedProgress);
        const y = lerp(job.from.y, job.to.y, easedProgress);

        if (typeof target.setSize === 'function') {
          target.setSize(w, h);
        } else {
          target.width = w;
          target.height = h;
        }

        if (target.position && typeof target.position.set === 'function') {
          target.position.set(x, y);
        } else {
          target.x = x;
          target.y = y;
        }

        if (localProgress >= 1) {
          markDone(job);
        }
      }

      if (activeCount === 0 && batch.tween) {
        batch.tween.kill();
        if (currentBatch === batch) currentBatch = null;
      }
    };

    const finish = () => {
      for (const job of batch.jobs) {
        if (job.done || job.cancelled) continue;
        applyJobState(job, job.to);
        markDone(job);
      }
      if (currentBatch === batch) currentBatch = null;
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

  const ensureBatch = (durationMs) => {
    if (!currentBatch || currentBatch.started) {
      currentBatch = createBatch();
    }
    updateBatchDuration(currentBatch, durationMs);
    if (!currentBatch.tween) startBatch(currentBatch);
    return currentBatch;
  };

  const enqueue = (job) => {
    job.cancelled = false;
    job.done = false;
    job.easeFn = gsap.parseEase(job.ease || DEFAULT_EASE);

    const durationMs = Math.max(0, job.durationMs || 0);
    if (durationMs === 0) {
      applyJobState(job, job.to);
      markDone(job);
      return job;
    }

    const batch = ensureBatch(durationMs);
    batch.jobs.push(job);
    return job;
  };

  const cancel = (job, { applyToEnd = false } = {}) => {
    if (!job || job.done) return;
    job.cancelled = true;
    if (applyToEnd) {
      applyJobState(job, job.to);
    }
    markDone(job);
  };

  return { enqueue, cancel };
};

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
