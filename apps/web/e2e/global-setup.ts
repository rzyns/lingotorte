import type { FullConfig } from '@playwright/test';

/** Wait (bounded) for the web service; Compose starts it without a readiness healthcheck. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('baseURL is not configured');
  const deadline = Date.now() + 60_000;
  let last = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`web service at ${baseURL} not ready: ${last}`);
}
