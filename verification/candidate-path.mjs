import path from 'node:path';

const PROHIBITED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'bundle',
]);

const DEFAULT_OUTPUT_ROOT = '.artifacts/performance';

/** Resolve generated output inside the dedicated transient candidate root. */
export function resolvePatchMapCandidateOutputPath({
  root,
  value,
  label,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  prohibitedRoots = [],
}) {
  const workspaceRoot = path.resolve(root);
  const resolved = resolveWorkspacePath({
    root: workspaceRoot,
    value,
    label,
    prohibitedRoots,
  });
  const candidateRoot = path.resolve(workspaceRoot, outputRoot);
  assertCandidate(
    isInside(workspaceRoot, candidateRoot),
    `${label} candidate root must stay inside the PatchMap workspace`,
  );
  assertCandidate(
    resolved === candidateRoot || isInside(candidateRoot, resolved),
    `${label} must stay inside ${outputRoot}`,
  );
  return resolved;
}

/** Resolve an existing candidate input without granting any write authority. */
export function resolvePatchMapCandidateInputPath({
  root,
  value,
  label,
  prohibitedRoots = [],
}) {
  return resolveWorkspacePath({
    root: path.resolve(root),
    value,
    label,
    prohibitedRoots,
  });
}

function resolveWorkspacePath({ root, value, label, prohibitedRoots }) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  assertCandidate(
    relative.length > 0 && isInside(root, resolved),
    `${label} must stay inside the PatchMap workspace`,
  );
  const segments = relative.split(path.sep);
  assertCandidate(
    !segments.some((segment) =>
      PROHIBITED_SEGMENTS.has(segment) ||
      segment.endsWith('.map') ||
      segment.includes('.umd.') ||
      segment.includes('.bundle.')),
    `${label} must use a transient candidate path`,
  );
  for (const prohibitedRoot of prohibitedRoots) {
    const boundary = path.resolve(root, prohibitedRoot);
    assertCandidate(
      resolved !== boundary && !resolved.startsWith(`${boundary}${path.sep}`),
      `${label} cannot overwrite protected evidence`,
    );
  }
  return resolved;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function assertCandidate(condition, message) {
  if (!condition) throw new Error(message);
}
