import path from 'node:path';
import { test, expect, nav, loadSyntheticFixture, expectPlayable } from './support.ts';

const fixtures = path.resolve(import.meta.dirname, '../../../fixtures');

test('A1: Library → Load synthetic fixture → Player plays with cues', async ({ page }) => {
  await loadSyntheticFixture(page);
  await expect(page.getByRole('heading', { name: 'Player', exact: true })).toBeVisible();
  await expectPlayable(page);
});

test('A2: Library → upload fixture media + subtitles via file inputs → Player', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Library');
  await page.locator('#local-media-file').setInputFiles(path.join(fixtures, 'media/synthetic-polish-dialogue.webm'));
  await page.locator('#local-target-subtitle-file').setInputFiles(path.join(fixtures, 'subtitles/synthetic-polish-dialogue.target.srt'));
  await page.locator('#local-native-subtitle-file').setInputFiles(path.join(fixtures, 'subtitles/synthetic-polish-dialogue.native.srt'));
  await page.getByRole('button', { name: 'Import local media', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Player', exact: true })).toBeVisible();
  await expectPlayable(page);
  await expect(page.locator('.cue-row').first()).toContainText('Cześć');
});
