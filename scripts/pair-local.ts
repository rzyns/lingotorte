import { privateTerminal, retrieveCapability } from '../apps/local-service/src/privateDelivery.ts';
// Intentionally no arguments, output-file option or stdout/stderr secret path.
if (process.argv.length !== 2) process.exit(1);
try {
  const terminal = await privateTerminal();
  try {
    const capability = await retrieveCapability();
    await terminal.write(`\nLingotorte session capability (private terminal only):\n${capability}\n`);
  } finally { await terminal.close(); }
} catch { console.error('Private pairing unavailable; a private controlling terminal and ready receiver are required.'); process.exitCode = 1; }
