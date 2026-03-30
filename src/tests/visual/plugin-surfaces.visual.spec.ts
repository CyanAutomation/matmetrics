// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('plugin UI visual baselines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugin-visual-harness');
  });

  test('captures plugin header and shell baseline', async ({ page }) => {
    await expect(page.getByLabel('Plugin shell baseline')).toHaveScreenshot(
      'plugin-shell-baseline.png'
    );
  });

  test('captures section card, form, and table baseline', async ({ page }) => {
    await expect(
      page.getByLabel('Shared primitives baseline')
    ).toHaveScreenshot('plugin-primitives-baseline.png');
  });

  test('captures destructive confirmation baseline', async ({ page }) => {
    await expect(page.getByLabel('Destructive flow baseline')).toHaveScreenshot(
      'plugin-destructive-confirmation-baseline.png'
    );
  });
});
