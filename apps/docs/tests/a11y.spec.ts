import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loadReference } from '../reference/load.ts';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'not found', path: '/page-that-does-not-exist/' },
  { name: 'tools', path: '/tools/' },
  { name: 'resources', path: '/resources/' },
  { name: 'prompts', path: '/prompts/' },
] as const;

const THEMES = ['light', 'dark'] as const;
type ThemeName = (typeof THEMES)[number];

async function applyTheme(page: Page, theme: ThemeName): Promise<void> {
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

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeFindings(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
  expect(axe.violations.length, JSON.stringify(axe.violations, null, 2)).toBe(0);
  expect(
    axe.incomplete.length,
    `unreviewed axe incomplete results:\n${JSON.stringify(axe.incomplete, null, 2)}`,
  ).toBe(0);
  const brand = await new AxeBuilder({ page }).withRules(['color-contrast-enhanced']).analyze();
  expect(
    [...brand.violations, ...brand.incomplete].length,
    `Oak's 7:1 text contrast bar:\n${JSON.stringify(brand.violations, null, 2)}`,
  ).toBe(0);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const reflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    minLeft: Math.min(
      0,
      ...[...document.querySelectorAll('main *')]
        .filter((el) => el.closest('pre') === null)
        .map((el) => el.getBoundingClientRect().left),
    ),
  }));
  expect(
    reflow.scrollWidth,
    'SC 1.4.10: the page must not scroll horizontally',
  ).toBeLessThanOrEqual(reflow.clientWidth);
  expect(reflow.minLeft, 'content left of the origin is unreachable').toBe(0);
}

const VIEWS = [
  { label: '1280px', viewport: { width: 1280, height: 900 }, scale: 1 },
  { label: '320px reflow', viewport: { width: 320, height: 900 }, scale: 1 },
  { label: '200% zoom', viewport: { width: 1280 / 2, height: 900 / 2 }, scale: 2 },
] as const;

test.describe('docs shell accessibility', () => {
  for (const pageDef of PAGES) {
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        test(`@a11y ${pageDef.name}, ${theme}, ${view.label} passes WCAG 2.2 AA`, async ({
          browser,
        }) => {
          const context = await browser.newContext({
            viewport: view.viewport,
            deviceScaleFactor: view.scale,
          });
          const page = await context.newPage();
          await page.goto(pageDef.path);
          await applyTheme(page, theme);
          await expectNoHorizontalScroll(page);
          await expectNoAxeFindings(page);
          await context.close();
        });
      }
    }
  }

  test('@a11y the gate fails on a planted image with no alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.style.colorScheme !== '', undefined, {
      timeout: 10_000,
    });
    await page.evaluate(() => {
      const image = document.createElement('img');
      image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      image.width = 24;
      image.height = 24;
      document.querySelector('main')?.append(image);
    });
    await expect(page.locator('main img:not([alt])')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(axe.violations.map((violation) => violation.id)).toContain('image-alt');
  });

  test('@a11y the page raises no CSP violations or console errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto('/');
    await applyTheme(page, 'dark');
    await applyTheme(page, 'light');
    expect(problems).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`@a11y keyboard reaches skip link, navigation and theme toggle with a visible focus ring, ${theme}`, async ({
      page,
    }) => {
      await page.goto('/');
      await applyTheme(page, theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const expected = [
        'Skip to main content',
        'Oak MCP server docs',
        'Home',
        'Quick start',
        'Tools',
        'Resources',
        'Prompts',
        'Dark theme',
      ];
      for (const name of expected) {
        await page.keyboard.press('Tab');
        const focused = page.locator(':focus-visible');
        await expect(focused).toBeVisible();
        await expect(focused).toHaveAccessibleName(name);
        const ring = await focused.evaluate((element) => {
          const channels = (value: string) =>
            (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const luminance = (rgb: number[]) => {
            const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
              const scaled = channel / 255;
              return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const style = getComputedStyle(element);
          const [hi = 0, lo = 0] = [
            luminance(channels(style.outlineColor)),
            luminance(channels(getComputedStyle(document.body).backgroundColor)),
          ].sort((a, b) => b - a);
          return {
            outlineWidth: parseFloat(style.outlineWidth),
            outlineStyle: style.outlineStyle,
            contrast: (hi + 0.05) / (lo + 0.05),
          };
        });
        expect(ring.outlineStyle, `${name} has no focus outline`).not.toBe('none');
        expect(
          ring.contrast,
          `${name} focus ring contrast is below 3:1 (SC 1.4.11)`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          ring.outlineWidth,
          `${name} focus outline is thinner than 2px`,
        ).toBeGreaterThanOrEqual(2);
      }
    });
  }

  test('@a11y the code block takes focus, scrolls by keyboard and is announced by label', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    const block = page.getByRole('region', { name: 'Example MCP client configuration' });
    await expect(block).toHaveAttribute('tabindex', '0');
    await block.focus();
    await expect(block).toBeFocused();
    const overflows = await block.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows, 'expected the sample to overflow at 320px').toBe(true);
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(() => block.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
  });

  test('@a11y each tool is a heading with its annotations as text and a focusable input schema', async ({
    page,
  }) => {
    const { tools } = loadReference();
    await page.goto('/tools/');
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText([
      'On this page',
      ...tools.map((tool) => tool.title ?? tool.name),
    ]);
    for (const tool of tools) {
      const section = page.getByRole('region', { name: tool.title ?? tool.name, exact: true });
      await expect(section.getByRole('definition').first()).toHaveText(tool.name);
      if (tool.annotations?.readOnlyHint !== undefined) {
        await expect(section.getByRole('term').filter({ hasText: 'Read only' })).toBeVisible();
      }
      const schema = section.getByRole('region', { name: `Input schema for ${tool.name}` });
      await expect(schema).toHaveAttribute('tabindex', '0');
    }
  });

  test('@a11y keyboard reaches the first tool link and input schema with a visible focus ring', async ({
    page,
  }) => {
    const [first] = loadReference().tools;
    if (first === undefined) throw new Error('the reference lists no tools');
    await page.goto('/tools/');
    const link = page.getByRole('link', { name: first.title ?? first.name, exact: true });
    const schema = page.getByRole('region', { name: `Input schema for ${first.name}` });
    for (const target of [link, schema]) {
      for (let presses = 0; presses < 200; presses += 1) {
        if (await target.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(target).toBeFocused();
      const outline = await target.evaluate((element) => getComputedStyle(element).outlineStyle);
      expect(outline).not.toBe('none');
    }
  });
});
