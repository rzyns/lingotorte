#!/usr/bin/env node
// lt-42o: run the Playwright smoke tests inside an isolated, disposable Compose project.
// Builds api/web plus the e2e runner, enrolls the internal origin http://web:4173 for this
// project only, runs the specs on the internal network, then removes the project (down -v).
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.LINGOTORTE_E2E_PROJECT ?? 'lt-e2e';
const env = {
  ...process.env,
  LINGOTORTE_MEDIA_DIR: path.join(root, 'fixtures', 'media'),
  LINGOTORTE_IMAGE: 'lingotorte:e2e',
  LINGOTORTE_CONTRIBUTOR_IMAGE: 'lingotorte:e2e-contributor',
  LINGOTORTE_E2E_IMAGE: 'lingotorte:e2e-runner',
  // The published port is host-only and not an enrolled origin: only the in-network runner is admitted.
  LINGOTORTE_BIND_HOST: '127.0.0.1',
  LINGOTORTE_WEB_PORT: process.env.LINGOTORTE_E2E_HOST_PORT ?? '5193',
  LINGOTORTE_PUBLIC_ORIGINS: 'http://web:4173',
  LINGOTORTE_WEB_ALLOWED_HOSTS: 'web',
};
mkdirSync(path.join(root, 'apps', 'web', 'e2e', 'artifacts'), { recursive: true });

function compose(...args) {
  console.log(`$ docker compose -p ${project} --profile tools ${args.join(' ')}`);
  return spawnSync('docker', ['compose', '-p', project, '--profile', 'tools', ...args], { cwd: root, env, stdio: 'inherit' }).status ?? 1;
}

let status = compose('build', 'api', 'web', 'e2e');
if (status === 0) status = compose('up', '-d', 'api', 'web');
if (status === 0) status = compose('run', '--rm', 'e2e', ...process.argv.slice(2));
const down = compose('down', '-v', '--remove-orphans');
process.exit(status || down);
