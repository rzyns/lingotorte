#!/usr/bin/env node
// lt-42o: run the Playwright smoke tests inside an isolated, disposable Compose project.
// Builds api/web plus the e2e runner, enrolls the internal origin http://web:4173 for this
// project only, runs the specs on the internal network, then removes the project (down -v).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.LINGOTORTE_E2E_PROJECT ?? 'lt-e2e';
// `down -v` deletes the project's volumes, so only disposable lt-e2e* projects are accepted.
if (!/^lt-e2e[a-z0-9-]*$/.test(project)) {
  console.error(`run-e2e: refusing LINGOTORTE_E2E_PROJECT=${JSON.stringify(project)}: must match /^lt-e2e[a-z0-9-]*$/ (teardown runs \`down -v\`, which would delete that project's volumes). No docker command was run.`);
  process.exit(2);
}
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

const composeArgs = (args) => ['compose', '-p', project, '--profile', 'tools', ...args];

function down() {
  console.log(`$ docker compose -p ${project} --profile tools down -v --remove-orphans`);
  return spawnSync('docker', composeArgs(['down', '-v', '--remove-orphans']), { cwd: root, env, stdio: 'inherit' }).status ?? 1;
}

let child = null;
let interrupted = false;
function onSignal(signal) {
  if (interrupted) return;
  interrupted = true;
  console.error(`run-e2e: ${signal} received; tearing down ${project}`);
  if (child) child.kill(signal);
  down();
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

function compose(...args) {
  console.log(`$ docker compose -p ${project} --profile tools ${args.join(' ')}`);
  return new Promise((resolve) => {
    child = spawn('docker', composeArgs(args), { cwd: root, env, stdio: 'inherit' });
    child.on('error', () => { child = null; resolve(1); });
    child.on('exit', (code) => { child = null; resolve(code ?? 1); });
  });
}

let status = await compose('build', 'api', 'web', 'e2e');
if (status === 0) status = await compose('up', '-d', 'api', 'web');
if (status === 0) status = await compose('run', '--rm', 'e2e', ...process.argv.slice(2));
if (!interrupted) process.exit(status || down());
