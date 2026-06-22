import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function start(label, args) {
  const child = spawn(npmCmd, args, {
    stdio: 'inherit',
    env: process.env,
  });
  children.push({ label, child });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[local] ${label} exited with code=${code ?? 'null'} signal=${signal ?? 'null'}; stopping sibling process.`);
    stopChildren();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function stopChildren() {
  for (const { child } of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shuttingDown = true;
  stopChildren();
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  stopChildren();
});

console.log('[local] Starting Lingotorte loopback local service on 127.0.0.1:5174 and Vite UI on 127.0.0.1:5173.');
start('local-service', ['run', 'dev:local-service']);
start('vite-ui', ['run', 'dev', '--', '--host', '127.0.0.1']);
