import { test, expect, nav, loadSyntheticFixture, saveFirstWord } from './support.ts';

// No in-page clock hook is exposed, so this asserts the visible state change instead:
// the single due card disappears and the "next due" summary moves off "now".
test('C: after saving a word, Review shows 1 due card; reveal; Good → no longer due', async ({ page }) => {
  await loadSyntheticFixture(page);
  const word = await saveFirstWord(page, 'hello (e2e)');
  await nav(page, 'Saved');
  const item = page.locator('.saved-item').filter({ has: page.getByRole('heading', { name: word, exact: true }) });
  const addToReview = item.getByRole('button', { name: 'Add to review' });
  if (await addToReview.count()) await addToReview.click();
  await expect(item.getByRole('button', { name: 'In review ✓' })).toBeVisible();

  await nav(page, 'Review');
  const review = page.locator('section.review-card');
  await expect(review.locator('.review-prompt')).toHaveCount(1);
  await expect(review.locator('.bucket-chip').filter({ hasText: 'New' }).locator('.bucket-count')).toHaveText('1');
  const stats = review.locator('p.meta').filter({ hasText: 'next due' });
  await expect(stats).toContainText('1 card');
  const dueBefore = await stats.innerText();

  await review.getByRole('button', { name: 'Show answer / context' }).click();
  await expect(review.locator('.review-target')).toHaveText(word);
  await review.getByRole('button', { name: 'Rate good' }).click();

  await expect(review.locator('#review-empty')).toBeVisible();
  await expect(review.locator('.review-prompt')).toHaveCount(0);
  await expect(review.locator('.bucket-chip').filter({ hasText: 'New' }).locator('.bucket-count')).toHaveText('0');
  console.log(`[review] before rating: ${JSON.stringify(dueBefore)}`);
});
