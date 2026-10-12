import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

// One resolver for artifact licensing, immutable lock ownership and CI routing.
// Include build/dev dependencies as well as shipped and optional/peer edges.
export function dependencyClosure(lock, packagePath) {
  const records = lock?.packages;
  const root = records?.[packagePath];
  if (lock?.lockfileVersion !== 3 || !root || root.link) throw new Error(`Invalid workspace lock record: ${packagePath}`);
  const packages = new Map();
  const directPaths = new Set();
  function locate(name, issuer, optional) {
    let directory = issuer;
    while (true) {
      const candidate = posix.join(directory, 'node_modules', name);
      if (records[candidate]) return candidate;
      if (!directory) break;
      const parent = posix.dirname(directory);
      directory = parent === '.' ? '' : parent;
    }
    if (!optional) throw new Error(`unresolved dependency ${name} from ${issuer}`);
  }
  function edges(entry, issuer, direct = false) {
    const dependencies = { ...entry.dependencies, ...(direct ? entry.devDependencies : {}), ...entry.peerDependencies, ...entry.optionalDependencies };
    for (const name of Object.keys(dependencies)) {
      const optional = Object.hasOwn(entry.optionalDependencies ?? {}, name) || entry.peerDependenciesMeta?.[name]?.optional === true;
      const path = locate(name, issuer, optional);
      if (!path) continue;
      if (direct) directPaths.add(path);
      if (packages.has(path)) continue;
      const record = records[path];
      if (record.link) throw new Error(`published package must not depend on a workspace link: ${path}`);
      packages.set(path, record);
      edges(record, path);
    }
  }
  edges(root, packagePath, true);
  return { root, packages, directPaths };
}

export function dependencyGraphChanged(before, after, packagePath) {
  return !isDeepStrictEqual(dependencyGraph(before, packagePath), dependencyGraph(after, packagePath));
}

export function dependencyGraph(lock, packagePath) {
  const { root, packages } = dependencyClosure(lock, packagePath);
  return {
    name: root.name,
    dependencies: root.dependencies, devDependencies: root.devDependencies,
    optionalDependencies: root.optionalDependencies, peerDependencies: root.peerDependencies,
    peerDependenciesMeta: root.peerDependenciesMeta,
    packages: Object.fromEntries([...packages].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? lockPath : lockPath.slice(index + marker.length);
}
