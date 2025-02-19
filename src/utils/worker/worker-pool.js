import workerpool from 'workerpool';
import Worker from './worker.js?worker&url';

export const pool = workerpool.pool(Worker, {
  maxWorkers: 4,
  workerType: 'web',
  workerOpts: { type: 'module' },
});
