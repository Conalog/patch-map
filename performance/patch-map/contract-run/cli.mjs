import path from 'node:path';

import {
  parsePatchMapBrowserLaunch,
  parsePatchMapNativeWindowsCell,
} from '../../../scripts/verification/patch-map-browser-launch.mjs';
import {
  MEASURED,
  PROXY_CPU_THROTTLE_RATE,
  SIZES,
  WARMUPS,
  assert,
} from './protocol.mjs';

export function parseContractRunOptions(arguments_, { root, resultsRoot }) {
  const nativeWindows = arguments_.includes('--native-windows');
  const browserLaunch = parsePatchMapBrowserLaunch(arguments_.slice(2), {
    extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const nativeCell = parsePatchMapNativeWindowsCell(
    arguments_.slice(2),
    browserLaunch,
  );
  const headed = browserLaunch.headed;
  const smoke = arguments_.includes('--smoke');
  const smokeSize = smoke
    ? parseSize(argumentValue(arguments_, '--smoke-size') ?? '100')
    : null;
  const requestedHeaded = !arguments_.includes('--request-headless');
  const codeCommit = argumentValue(arguments_, '--code-commit') ?? 'uncommitted';
  const externalUrl = argumentValue(arguments_, '--url');
  const cellId = argumentValue(arguments_, '--cell-id');
  const outputDirectory = argumentValue(arguments_, '--output-dir');
  const resolvedResultsRoot = outputDirectory
    ? path.resolve(root, outputDirectory)
    : resultsRoot;
  const cpuThrottleRate = nativeWindows ? 1 : PROXY_CPU_THROTTLE_RATE;
  if (nativeWindows) {
    assert(nativeCell.requested, '--native-windows cell validation');
    assert(cellId === nativeCell.cellId, '--native-windows cell identity');
    assert(outputDirectory !== undefined, '--native-windows requires --output-dir');
  }
  return {
    browserLaunch,
    cellId,
    codeCommit,
    cpuThrottleRate,
    externalUrl,
    headed,
    nativeWindows,
    requestedHeaded,
    resultsRoot: resolvedResultsRoot,
    runMeasured: smoke ? 1 : MEASURED,
    runSizes: smoke ? [smokeSize] : SIZES,
    runWarmups: smoke ? 0 : WARMUPS,
    smoke,
  };
}

function argumentValue(arguments_, name) {
  const prefix = `${name}=`;
  const inline = arguments_.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function parseSize(value) {
  const size = value === 'production-shaped-workload-v1'
    ? value
    : Number(value);
  assert(SIZES.includes(size), `smoke size ${value}`);
  return size;
}
