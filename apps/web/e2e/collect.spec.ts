import { test, expect, nav, loadSyntheticFixture, saveFirstWord } from './support.ts';

test('B1: click a word → Save form → meaning → Save → listed in Saved', async ({ page }) => {
  await loadSyntheticFixture(page);
  const word = await saveFirstWord(page, 'hello (e2e)');
  await nav(page, 'Saved');
  const item = page.locator('.saved-item').filter({ has: page.getByRole('heading', { name: word, exact: true }) });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Meaning: hello (e2e)');
});

test('B2: drag-select across words opens the form and does not save immediately', async ({ page }) => {
  await loadSyntheticFixture(page);
  const words = page.locator('.cue-row').first().locator('.cue-word');
  const first = await words.nth(1).boundingBox();
  const last = await words.nth(2).boundingBox();
  if (!first || !last) throw new Error('transcript words have no layout box');
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move((first.x + last.x) / 2, first.y + first.height / 2, { steps: 5 });
  await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, { steps: 5 });
  await page.mouse.up();
  const panel = page.locator('.selection-panel');
  await expect(panel.getByRole('heading', { name: 'Save a phrase' })).toBeVisible();
  await expect(panel).toContainText('Selected: “to jest”');
  await expect(panel.getByRole('button', { name: 'Save occurrence' })).toBeVisible();
  // Nothing persisted until Save occurrence (lt-cms).
  await nav(page, 'Saved');
  await expect(page.locator('.saved-item')).toHaveCount(0);
});
