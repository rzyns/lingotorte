import { test, expect, nav, loadSyntheticFixture, saveFirstWord } from './support.ts';

// lt-0zc/lt-aot: the IndexedDB snapshot cache restores learner state and transcript on reload
// without pairing the local service in Settings.
test('D: reload keeps the saved item and transcript without opening Settings', async ({ page }) => {
  await loadSyntheticFixture(page);
  const cueText = (await page.locator('.cue-row').first().locator('.cue-target, .cue-text').first().innerText()).trim();
  const word = await saveFirstWord(page, 'hello (e2e)');
  await nav(page, 'Saved');
  await expect(page.locator('.saved-item h3', { hasText: word })).toHaveCount(1);

  // The snapshot cache write is debounced; wait until IndexedDB holds the saved item.
  await expect.poll(() => page.evaluate(async (needle) => {
    const names = (await indexedDB.databases()).map((d) => d.name ?? '');
    for (const name of names) {
      const db = await new Promise<IDBDatabase>((ok, ko) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
      for (const store of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((ok, ko) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
        if (JSON.stringify(all).includes(needle)) { db.close(); return true; }
      }
      db.close();
    }
    return false;
  }, 'hello (e2e)'), { message: 'snapshot cache contains the saved item', timeout: 10_000 }).toBe(true);

  await page.reload();
  await nav(page, 'Saved');
  const item = page.locator('.saved-item').filter({ has: page.getByRole('heading', { name: word, exact: true }) });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Meaning: hello (e2e)');
  await nav(page, 'Player');
  await expect(page.locator('.cue-row').first()).toContainText(cueText);
});
