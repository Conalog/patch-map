import workerpool from 'workerpool';

const Worker = new URL('./worker.js', import.meta.url).pathname;

export const pool = workerpool.pool(Worker, {
  maxWorkers: 4,
  workerType: 'web',
  workerOpts: { type: 'module' },
});
