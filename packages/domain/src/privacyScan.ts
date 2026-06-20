import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

export type PrivacyBoundaryFinding = Readonly<{
  file: string;
  marker: string;
}>;

export type PrivacyBoundaryScanResult = Readonly<{
  scannedFiles: readonly string[];
  findings: readonly PrivacyBoundaryFinding[];
}>;

const runtimeRoots = ['apps', 'packages', 'scripts'] as const;
const textFilePattern = /\.(ts|tsx|js|mjs|html|css|json)$/;
const referenceProductName = ['lingo', 'pie'].join('');
const disallowedRuntimeMarkers = [
  new RegExp(`${referenceProductName}\.com`, 'i'),
  new RegExp(`api\.${referenceProductName}`, 'i'),
  new RegExp(referenceProductName, 'i'),
];

async function collectFiles(rootPath: string, currentPath: string, out: string[]): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(rootPath, fullPath, out);
      continue;
    }
    if (entry.isFile() && textFilePattern.test(entry.name)) {
      out.push(relative(rootPath, fullPath));
    }
  }
}

export async function scanRuntimePrivacyBoundaries(repoRoot: URL | string): Promise<PrivacyBoundaryScanResult> {
  const rootPath = typeof repoRoot === 'string' ? repoRoot : fileURLToPath(repoRoot);
  const scannedFiles: string[] = [];
  for (const runtimeRoot of runtimeRoots) {
    await collectFiles(rootPath, join(rootPath, runtimeRoot), scannedFiles);
  }

  const findings: PrivacyBoundaryFinding[] = [];
  for (const file of scannedFiles) {
    const content = await readFile(join(rootPath, file), 'utf8');
    for (const marker of disallowedRuntimeMarkers) {
      if (marker.test(content)) {
        findings.push({ file, marker: marker.source });
      }
    }
  }

  return { scannedFiles: [...scannedFiles].sort(), findings };
}
