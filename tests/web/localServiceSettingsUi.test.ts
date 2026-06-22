import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppModel } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}

async function makeTempConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-settings-service-'));
  return {
    root,
    config: {
      host: '127.0.0.1',
      port: 0,
      databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'),
      modelCacheDir: join(root, 'models'),
      allowOnlineProviders: false,
    },
  } as const;
}

describe('local service settings UI', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;
  const cleanups: (() => Promise<void>)[] = [];

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(async () => {
    dom.window.close();
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('connects to the loopback service from Settings and reports durable-state status', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const model = createAppModel();
    model.view = 'settings';
    rerenderApp(model);

    const serviceInput = document.querySelector('input[name="local-service-url"]') as HTMLInputElement | null;
    expect(serviceInput).toBeTruthy();
    serviceInput!.value = service.origin;
    serviceInput!.dispatchEvent(new dom.window.Event('input'));

    const connectButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Connect local service') as HTMLButtonElement | undefined;
    expect(connectButton).toBeTruthy();
    connectButton!.click();

    for (let i = 0; i < 20 && model.localService.status !== 'connected'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(model.localService.status).toBe('connected');
    expect(document.getElementById('app')?.textContent).toContain('Connected to local service');
    expect(document.getElementById('app')?.textContent).toContain('SQLite durable state');
  });
});
