import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.artifacts', '.git', 'coverage', 'dist', 'node_modules',
]);

const files = await walk(root);
const markdownFiles = files.filter((file) => file.endsWith('.md'));
const failures = [];

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8');
  await verifyLinks(file, source);
  await verifyInlineRepositoryPaths(file, source);
  verifyDocumentSize(file, source);
}

if (failures.length > 0) {
  throw new Error(`Documentation verification failed:\n${failures.join('\n')}`);
}

console.log(`Documentation verified: ${markdownFiles.length} Markdown files checked`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return [walk(target)];
    return entry.isFile() ? [[target]] : [];
  }));
  return nested.flat().sort();
}

async function verifyLinks(file, source) {
  const links = source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu);
  for (const match of links) {
    const raw = match[1].trim().replace(/^<|>$/gu, '');
    const destination = raw.split(/\s+["']/u, 1)[0];
    if (
      destination.length === 0 ||
      destination.startsWith('#') ||
      /^[a-z][a-z0-9+.-]*:/iu.test(destination)
    ) continue;
    const [pathname] = destination.split('#', 1);
    const target = path.resolve(path.dirname(file), decodeURIComponent(pathname));
    await stat(target).catch(() => {
      failures.push(`${relative(file)} links to missing ${destination}`);
    });
  }
}

async function verifyInlineRepositoryPaths(file, source) {
  const paths = source.matchAll(
    /`((?:(?:src|tests|performance|verification|examples|docs|\.github)\/)[^`]+|(?:package\.json|package-lock\.json|vite\.config\.ts|tsconfig(?:\.build)?\.json|eslint\.config\.js|\.nvmrc))`/gu,
  );
  for (const match of paths) {
    const destination = match[1];
    if (/[*?[\]<>]/u.test(destination)) continue;
    const exists = await stat(path.resolve(root, destination))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      failures.push(`${relative(file)} names missing ${destination}`);
    }
  }
}

function verifyDocumentSize(file, source) {
  const name = relative(file);
  if (!name.startsWith('docs/')) return;
  const lines = source.split(/\r?\n/u).length;
  const words = source.trim().split(/\s+/u).filter(Boolean).length;
  const router = name === 'docs/README.md' || name === 'docs/engineering/README.md';
  const maximumLines = router ? 80 : 120;
  const maximumWords = router ? 600 : 1_200;
  if (lines > maximumLines || words > maximumWords) {
    failures.push(`${name} exceeds its budget (${lines}/${maximumLines} lines, ${words}/${maximumWords} words)`);
  }
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}
