import path from 'node:path';

import {
  resolvePatchMapCandidateInputPath,
  resolvePatchMapCandidateOutputPath,
} from '../../../scripts/verification/patch-map-candidate-path.mjs';

import {
  argumentValue,
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
  const argv = arguments_.slice(2);
  const nativeWindows = argv.includes('--native-windows');
  const browserLaunch = parsePatchMapBrowserLaunch(argv, {
    extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const nativeCell = parsePatchMapNativeWindowsCell(
    argv,
    browserLaunch,
  );
  const headed = browserLaunch.headed;
  const smoke = argv.includes('--smoke');
  const smokeSize = smoke
    ? parseSize(argumentValue(argv, '--smoke-size') ?? '100')
    : null;
  const requestedHeaded = !argv.includes('--request-headless');
  const codeCommit = argumentValue(argv, '--code-commit') ?? 'uncommitted';
  const externalUrl = argumentValue(argv, '--url');
  const cellId = argumentValue(argv, '--cell-id');
  const outputDirectory = argumentValue(argv, '--output-dir');
  const packageEvidence = argumentValue(argv, '--package-evidence');
  const resolvedResultsRoot = outputDirectory
    ? resolveFreshOutputDirectory(root, outputDirectory)
    : resolveFreshOutputDirectory(root, path.relative(root, resultsRoot));
  const cpuThrottleRate = nativeWindows ? 1 : PROXY_CPU_THROTTLE_RATE;
  if (!smoke) {
    assert(packageEvidence !== undefined, 'full contract run requires --package-evidence');
  }
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
    packageEvidencePath: packageEvidence === undefined
      ? null
      : resolveFreshPackageEvidence(root, packageEvidence),
    requestedHeaded,
    resultsRoot: resolvedResultsRoot,
    runMeasured: smoke ? 1 : MEASURED,
    runSizes: smoke ? [smokeSize] : SIZES,
    runWarmups: smoke ? 0 : WARMUPS,
    smoke,
  };
}

function resolveFreshPackageEvidence(root, value) {
  return resolvePatchMapCandidateInputPath({
    root,
    value,
    label: 'package evidence',
    prohibitedRoots: PROTECTED_EVIDENCE_ROOTS,
  });
}

function resolveFreshOutputDirectory(root, value) {
  return resolvePatchMapCandidateOutputPath({
    root,
    value,
    label: 'contract output directory',
    prohibitedRoots: PROTECTED_EVIDENCE_ROOTS,
  });
}

const PROTECTED_EVIDENCE_ROOTS = Object.freeze([
  'performance/patch-map/results',
  'docs/reference/core-v2-functional-contract',
]);

function parseSize(value) {
  const size = value === 'production-shaped-workload-v1'
    ? value
    : Number(value);
  assert(SIZES.includes(size), `smoke size ${value}`);
  return size;
}
