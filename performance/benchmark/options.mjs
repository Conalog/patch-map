import path from 'node:path';

import {
  argumentValue,
  parsePatchMapBrowserLaunch,
} from '../browser-options.mjs';
import {
  MEASURED,
  PROXY_CPU_THROTTLE_RATE,
  SIZES,
  WARMUPS,
  assert,
} from './protocol.mjs';

export function parseBenchmarkOptions(arguments_, { root, resultsRoot }) {
  const argv = arguments_.slice(2);
  const browserLaunch = parsePatchMapBrowserLaunch(argv, {
    extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const smoke = argv.includes('--smoke');
  const outputDirectory = argumentValue(argv, '--output-dir');
  return {
    browserLaunch,
    codeCommit: argumentValue(argv, '--code-commit') ?? 'uncommitted',
    cpuThrottleRate: PROXY_CPU_THROTTLE_RATE,
    externalUrl: argumentValue(argv, '--url'),
    headed: browserLaunch.headed,
    requestedHeaded: !argv.includes('--request-headless'),
    resultsRoot: outputDirectory
      ? resolveBenchmarkOutput(root, outputDirectory)
      : resultsRoot,
    runMeasured: smoke ? 1 : MEASURED,
    runSizes: smoke
      ? [parseSize(argumentValue(argv, '--smoke-size') ?? '100')]
      : SIZES,
    runWarmups: smoke ? 0 : WARMUPS,
    smoke,
  };
}

export function resolveBenchmarkOutput(root, value) {
  const artifactRoot = path.resolve(root, '.artifacts/performance');
  const resolved = path.resolve(root, value);
  if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error('benchmark output must stay under .artifacts/performance');
  }
  return resolved;
}

function parseSize(value) {
  const size = value === 'production-shaped-workload-v1' ? value : Number(value);
  assert(SIZES.includes(size), `smoke size ${value}`);
  return size;
}
