import workerpool from 'workerpool';
import { selector } from '../selector/selector';

const workerSelector = (json, path) => {
  return selector(json, path, { resultType: 'path' });
};

workerpool.worker({ workerSelector });
