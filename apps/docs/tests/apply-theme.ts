import { expect, type Page } from '@playwright/test';

export const THEMES = ['light', 'dark'] as const;
export type ThemeName = (typeof THEMES)[number];

export async function applyTheme(page: Page, theme: ThemeName): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await expect(toggle).toBeVisible();
  const wantDark = theme === 'dark';
  if ((await toggle.getAttribute('aria-pressed')) !== String(wantDark)) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-pressed', String(wantDark));
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (wantDark) {
    expect(background, 'dark must not resolve the light background').not.toBe('rgb(255, 255, 255)');
  } else {
    expect(background, 'light must resolve the light background').toBe('rgb(255, 255, 255)');
  }
}
