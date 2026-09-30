import foundation from './foundation.json';
import lifecycle from './lifecycle.json';
import rendering from './rendering.json';

const datasets = Object.freeze({
  ...foundation,
  ...lifecycle,
  ...rendering,
});

export default datasets;
