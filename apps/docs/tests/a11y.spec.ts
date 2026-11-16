import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loadReference } from '../reference/load.ts';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'not found', path: '/page-that-does-not-exist/' },
  { name: 'connect', path: '/connect/' },
  { name: 'authentication', path: '/authentication/' },
  { name: 'examples', path: '/examples/' },
  { name: 'data and licensing', path: '/data-and-licensing/' },
  { name: 'responsible use', path: '/responsible-use/' },
  { name: 'status and limits', path: '/status-and-limits/' },
  { name: 'self-hosting', path: '/self-hosting/' },
  { name: 'accessibility statement', path: '/accessibility/' },
  { name: 'support', path: '/support/' },
  { name: 'tools', path: '/tools/' },
  { name: 'resources', path: '/resources/' },
  { name: 'prompts', path: '/prompts/' },
] as const;

const MCP_URL = 'https://mcp.thenational.academy/mcp';
const HEALTHY = JSON.stringify({ status: 'ok', mode: 'streamable-http' });

async function serveHealth(page: Page, status: number, body = HEALTHY): Promise<void> {
  await page.route('**/mcp/healthz', (route) =>
    route.fulfill({ status, contentType: 'application/json', body }),
  );
}

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
    await serveHealth(page, 200);
    for (const pageDef of PAGES.filter((entry) => entry.name !== 'not found')) {
      await page.goto(pageDef.path);
      await applyTheme(page, 'dark');
      await applyTheme(page, 'light');
    }
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
        'Connect',
        'Authentication',
        'Examples',
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
    const block = page.getByRole('region', { name: 'MCP server URL' });
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

  test('@a11y home shows a healthy server as text, not colour alone', async ({ page }) => {
    await serveHealth(page, 200);
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'server' })).toHaveText(
      'The server is up. It answered its health check just now.',
    );
  });

  for (const [label, status, body] of [
    ['an error status', 503, HEALTHY],
    ['an unexpected body', 200, '{"status":"down"}'],
  ] as const) {
    test(`@a11y home falls back to a health-check link on ${label}`, async ({ page }) => {
      await serveHealth(page, status, body);
      await page.goto('/');
      const region = page.getByRole('status').filter({ hasText: 'server' });
      await expect(region).toContainText("We can't check the server from this page.");
      await expect(region.getByRole('link', { name: 'Open the health check' })).toHaveAttribute(
        'href',
        `${MCP_URL}/healthz`,
      );
    });
  }

  for (const theme of THEMES) {
    test(`@a11y Connect tabs switch with arrow keys, Home and End, with a visible focus ring, ${theme}`, async ({
      page,
    }) => {
      await page.goto('/connect/');
      await applyTheme(page, theme);
      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveText(['Claude', 'ChatGPT', 'Cursor', 'VS Code', 'Claude Code']);
      const first = tabs.first();
      for (let presses = 0; presses < 50; presses += 1) {
        if (await first.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(first).toBeFocused();
      await expect(first).toHaveAttribute('aria-selected', 'true');
      expect(await first.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
        'none',
      );
      const expectSelected = async (name: string) => {
        const tab = page.getByRole('tab', { name, exact: true });
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(tab).toHaveAttribute('tabindex', '0');
        await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
        await expect(page.getByRole('tabpanel')).toHaveCount(1);
      };
      await page.keyboard.press('ArrowRight');
      await expectSelected('ChatGPT');
      await page.keyboard.press('End');
      await expectSelected('Claude Code');
      await page.keyboard.press('ArrowRight');
      await expectSelected('Claude');
      await page.keyboard.press('ArrowLeft');
      await expectSelected('Claude Code');
      await page.keyboard.press('Home');
      await expectSelected('Claude');
      await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tabpanel', { name: 'Claude', exact: true })).toBeFocused();
    });
  }

  test("@a11y every Connect tab ends by listing Oak's tools and has a sign-in step", async ({
    page,
  }) => {
    await page.goto('/connect/');
    for (const name of ['Claude', 'ChatGPT', 'Cursor', 'VS Code', 'Claude Code']) {
      await page.getByRole('tab', { name, exact: true }).click();
      const steps = page.getByRole('tabpanel', { name, exact: true }).locator('ol > li');
      await expect(steps.filter({ hasText: "Oak's sign-in page" })).toHaveCount(1);
      await expect(steps.last()).toContainText("Oak's tools");
    }
  });

  test('@a11y the copy button copies the URL by keyboard and announces it politely', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Copy URL' });
    for (let presses = 0; presses < 50; presses += 1) {
      if (await button.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(button).toBeFocused();
    expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    const announcer = page.getByRole('status').filter({ hasText: 'Copied' });
    await page.keyboard.press('Enter');
    await expect(announcer).toHaveText('Copied to your clipboard.');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MCP_URL);
  });
});
