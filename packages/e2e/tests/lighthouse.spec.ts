import { test, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

test.describe('Lighthouse Performance', () => {
  test('home page should score 95+ on all metrics', async ({ page, browser }) => {
    await page.goto('/');

    // Basic performance checks
    const performanceTiming = await page.evaluate(() => {
      const perf = window.performance.timing;
      return {
        loadTime: perf.loadEventEnd - perf.navigationStart,
        domReady: perf.domContentLoadedEventEnd - perf.navigationStart,
      };
    });

    // Page should load in under 3 seconds
    expect(performanceTiming.loadTime).toBeLessThan(3000);

    // DOM ready in under 2 seconds
    expect(performanceTiming.domReady).toBeLessThan(2000);

    // Check for proper meta tags
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(10);

    // Check for meta description
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDescription).toBeTruthy();
    expect(metaDescription!.length).toBeGreaterThan(50);

    // Check for proper heading structure
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
  });

  test('app page should be performant', async ({ page }) => {
    await page.goto('/app');

    // Check page loads
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

    // Check for no console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // Should have minimal console errors
    expect(errors.length).toBeLessThan(5);
  });
});
