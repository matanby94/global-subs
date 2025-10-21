import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Onboarding Flow', () => {
  test('should sign up, buy credits, and see wallet balance', async ({ page }) => {
    // Navigate to app
    await page.goto('/app');

    // Sign in form should be visible
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

    // Enter email
    const testEmail = `test-${Date.now()}@example.com`;
    await page.getByPlaceholder('Enter your email').fill(testEmail);

    // Click sign in/up button
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Wait for dashboard
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

    // Check that balance is visible
    await expect(page.getByText('Available Credits')).toBeVisible();

    // Initial balance should be 0
    const balanceText = await page.locator('text=Available Credits').locator('..').textContent();
    expect(balanceText).toContain('0.00');

    // Click top-up button
    await page.getByRole('button', { name: /Add 10 Credits/i }).click();

    // Wait for alert or success message
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('successfully');
      await dialog.accept();
    });

    // Wait a bit for the update
    await page.waitForTimeout(2000);

    // Reload page to see updated balance
    await page.reload();

    // Balance should now be 10
    await expect(page.locator('text=Available Credits').locator('..')).toContainText('10.00');
  });

  test('should pass accessibility checks', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
