import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoots = ['apps', 'packages', 'scripts'];
const textFilePattern = /\.(ts|tsx|js|mjs|html|css|json)$/;
const referenceProductName = ['lingo', 'pie'].join('');
const markers = [
  new RegExp(`${referenceProductName}\.com`, 'i'),
  new RegExp(`api\.${referenceProductName}`, 'i'),
  new RegExp(referenceProductName, 'i'),
];
const scannedFiles = [];
const findings = [];

async function collectFiles(currentPath) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath);
    } else if (entry.isFile() && textFilePattern.test(entry.name)) {
      scannedFiles.push(relative(repoRoot, fullPath));
    }
  }
}

for (const runtimeRoot of runtimeRoots) {
  await collectFiles(join(repoRoot, runtimeRoot));
}

for (const file of scannedFiles) {
  const content = await readFile(join(repoRoot, file), 'utf8');
  for (const marker of markers) {
    if (marker.test(content)) findings.push({ file, marker: marker.source });
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, scannedFiles: scannedFiles.length, findings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, scannedFiles: scannedFiles.length }, null, 2));
