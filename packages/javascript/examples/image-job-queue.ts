export class ImageQueueFullError extends Error {
  constructor() { super('Image queue is full'); this.name = 'ImageQueueFullError'; }
}

interface WaitingJob {
  readonly run: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

/** Host-only admission control. Create one queue per service process, not per request. */
export function createImageJobQueue(concurrency = 1, maxWaiting = 4) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 ||
      !Number.isSafeInteger(maxWaiting) || maxWaiting < 0) {
    throw new RangeError('Queue limits must be safe integers: concurrency >= 1, maxWaiting >= 0');
  }
  let active = 0;
  const waiting: WaitingJob[] = [];

  async function execute(job: WaitingJob): Promise<void> {
    active += 1;
    try { job.resolve(await job.run()); }
    catch (error) { job.reject(error); }
    finally {
      active -= 1;
      const next = waiting.shift();
      if (next !== undefined) void execute(next);
    }
  }

  return {
    get active() { return active; },
    get waiting() { return waiting.length; },
    submit<T>(run: () => Promise<T>): Promise<T> {
      if (active >= concurrency && waiting.length >= maxWaiting) {
        return Promise.reject(new ImageQueueFullError());
      }
      return new Promise<T>((resolve, reject) => {
        const job: WaitingJob = { run, resolve: (value) => resolve(value as T), reject };
        if (active < concurrency) void execute(job);
        else waiting.push(job);
      });
    },
  };
}

/** Adapter ports belong to the chosen browser driver and binary response transport. */
export interface ImageHostPorts<Input> {
  acquirePage(): Promise<{
    renderAndReadBytes(input: Input): Promise<Uint8Array>;
    release(): Promise<void>;
  }>;
  send(input: Input, bytes: Uint8Array): Promise<void>;
}

/** Instantiate once at service startup. The page must await map destruction internally. */
export function createImageService<Input>(ports: ImageHostPorts<Input>) {
  const queue = createImageJobQueue(1, 4);
  return (input: Input): Promise<void> => queue.submit(async () => {
    const page = await ports.acquirePage();
    try {
      const bytes = await page.renderAndReadBytes(input);
      await ports.send(input, bytes);
    } finally {
      await page.release();
    }
  });
}
