import { test as base, expect, type Page } from '@playwright/test';

/**
 * lt-42o: every request from any page in the test's BrowserContext (popups included)
 * must stay on the stack's own web origin (or be a browser-local blob:/data: URL), and
 * every WebSocket must target that same host (e.g. a Vite HMR socket). Anything else
 * fails the test after it runs.
 */
export const test = base.extend<{ outbound: string[] }>({
  outbound: [async ({ context, baseURL }, use, testInfo) => {
    const allowed = new Set([new URL(baseURL!).origin]);
    const observed = new Set<string>();
    const outbound: string[] = [];
    const web = new URL(baseURL!);
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'blob:' || url.protocol === 'data:') return;
      observed.add(url.origin);
      if (!allowed.has(url.origin)) outbound.push(request.url());
    });
    const guardSockets = (page: Page) => page.on('websocket', (ws) => {
      const url = new URL(ws.url());
      observed.add(`${url.protocol}//${url.host}`);
      const sameOrigin = url.host === web.host && url.protocol === (web.protocol === 'https:' ? 'wss:' : 'ws:');
      if (!sameOrigin) outbound.push(ws.url());
    });
    context.pages().forEach(guardSockets);
    context.on('page', guardSockets);
    await use(outbound);
    console.log(`[no-egress] ${testInfo.title}: allowlist=${JSON.stringify([...allowed])} observed=${JSON.stringify([...observed])}`);
    expect(outbound, 'requests left the compose stack').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function nav(page: Page, name: 'Library' | 'Player' | 'Saved' | 'Review'): Promise<void> {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name, exact: true }).click();
}

export async function loadSyntheticFixture(page: Page): Promise<void> {
  await page.goto('/');
  await nav(page, 'Library');
  await page.getByRole('button', { name: 'Load synthetic fixture' }).first().click();
  await expect(page.locator('.cue-row').first()).toBeVisible();
}

export async function expectPlayable(page: Page): Promise<void> {
  const video = page.locator('.video-stage video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration), { message: 'video duration' }).toBeGreaterThan(0);
  expect(await page.locator('.cue-row').count()).toBeGreaterThanOrEqual(1);
}

/** Click the first transcript word, give it a meaning and save it (spec B). Returns the word. */
export async function saveFirstWord(page: Page, meaning: string): Promise<string> {
  const word = page.locator('.cue-row').first().locator('.cue-word').first();
  const text = (await word.innerText()).trim();
  await word.click();
  const panel = page.locator('.selection-panel');
  await expect(panel.getByRole('heading', { name: 'Save a word' })).toBeVisible();
  await panel.getByLabel('Meaning (optional)').fill(meaning);
  await panel.locator('[data-action="save-occurrence"]').click();
  await expect(panel.getByRole('heading', { name: 'Save a word or phrase' })).toBeVisible();
  return text;
}
