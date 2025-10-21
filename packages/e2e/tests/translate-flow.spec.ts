import { test, expect } from '@playwright/test';

test.describe('Translation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in with demo user
    await page.goto('/app');
    await page.getByPlaceholder('Enter your email').fill('demo@stremio-ai.com');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('should show translation interface', async ({ page }) => {
    // Check for translate button
    await expect(page.getByText('Translate Subtitle')).toBeVisible();

    // Check for library link
    await expect(page.getByText('My Library')).toBeVisible();

    // Check for Stremio instructions
    await expect(page.getByText(/Using with Stremio/i)).toBeVisible();
  });

  test('should display credits balance', async ({ page }) => {
    // Demo user should have credits
    const balance = page.locator('text=Available Credits').locator('..');
    await expect(balance).toBeVisible();

    // Get balance value
    const balanceText = await balance.textContent();
    const balanceValue = parseFloat(balanceText?.match(/[\d.]+/)?.[0] || '0');

    // Should have some credits (demo user has 100)
    expect(balanceValue).toBeGreaterThan(0);
  });

  test('should allow top-up credits', async ({ page }) => {
    // Get initial balance
    await page.waitForTimeout(1000);
    const initialBalanceText = await page
      .locator('text=Available Credits')
      .locator('..')
      .textContent();
    const initialBalance = parseFloat(initialBalanceText?.match(/[\d.]+/)?.[0] || '0');

    // Click top-up
    await page.getByRole('button', { name: /Add 10 Credits/i }).click();

    // Handle alert
    await page.waitForTimeout(2000);

    // Reload to see new balance
    await page.reload();
    await page.waitForTimeout(1000);

    // Get new balance
    const newBalanceText = await page.locator('text=Available Credits').locator('..').textContent();
    const newBalance = parseFloat(newBalanceText?.match(/[\d.]+/)?.[0] || '0');

    // Balance should have increased
    expect(newBalance).toBeGreaterThanOrEqual(initialBalance + 10);
  });
});
