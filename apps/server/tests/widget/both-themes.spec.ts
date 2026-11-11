/**
 * Playwright tests for the both-themes design-review page.
 *
 * The page renders the exact widget twice in same-origin iframes with
 * the theme FORCED per pane through the same channels a real MCP Apps
 * host drives (`data-theme` on the root; inline host style variables).
 * The assertions are therefore identical under every Playwright project
 * (widget-light, widget-dark, widget-forced-colors) — forcing beats the
 * ambient colour scheme, which is the page's entire point.
 */
import { expect, test } from '@playwright/test';

test.describe('Both-themes review page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/both-themes.html', { waitUntil: 'networkidle' });
  });

  test('renders the widget in both forced themes', async ({ page }) => {
    const light = page.frameLocator('iframe[data-theme="light"]');
    const dark = page.frameLocator('iframe[data-theme="dark"]');

    await expect(light.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(dark.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(light.locator('.oak-app')).toBeVisible();
    await expect(dark.locator('.oak-app')).toBeVisible();
  });

  test('renders the wordmark in the pane ink under both FORCED themes', async ({
    page,
  }, testInfo) => {
    // Per pane: the geometry paints in whatever the link's ink is (the
    // currentColor wiring, proven here on the forced data-theme channel).
    for (const theme of ['light', 'dark'] as const) {
      const pane = page.frameLocator(`iframe[data-theme="${theme}"]`);
      const logo = pane.locator('.oak-brand-banner__logo');
      await expect(logo).toBeVisible();

      const linkColor = await pane
        .locator('.oak-brand-banner__link')
        .evaluate((el) => getComputedStyle(el).color);
      const geometryFill = await logo
        .locator('path')
        .first()
        .evaluate((el) => getComputedStyle(el).fill);

      expect(geometryFill, `${theme} pane geometry ink`).toBe(linkColor);
    }

    // Across panes: the forced data-theme + host-variable channel must
    // RE-RESOLVE the ink — a [data-theme="dark"] override that failed
    // would render light-theme ink in the dark pane, and fill==color
    // above stays green for ANY ink, so only this divergence catches it.
    // Under forced colours the system palette collapses both panes to the
    // same ink by design, so the expected value derives from the project.
    const inks = await Promise.all(
      (['light', 'dark'] as const).map((theme) =>
        page
          .frameLocator(`iframe[data-theme="${theme}"]`)
          .locator('.oak-brand-banner__link')
          .evaluate((el) => getComputedStyle(el).color),
      ),
    );
    expect(
      inks[0] !== inks[1],
      `pane inks ${inks[0] ?? ''} / ${inks[1] ?? ''} — the forced data-theme channel did not re-resolve the link colour`,
    ).toBe(testInfo.project.name !== 'widget-forced-colors');
  });

  test('simulates the host chat surface around each pane', async ({ page }) => {
    const light = page.frameLocator('iframe[data-theme="light"]');
    const dark = page.frameLocator('iframe[data-theme="dark"]');

    // The host-variable channel reaches each widget document root.
    await expect(light.locator('html')).toHaveAttribute(
      'style',
      /--color-background-primary: ?#ffffff/u,
    );
    await expect(dark.locator('html')).toHaveAttribute(
      'style',
      /--color-background-primary: ?#262624/u,
    );
  });
});
