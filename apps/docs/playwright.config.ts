import { defineConfig } from '@playwright/test';

const PORT = Number(process.env['DOCS_PORT'] ?? 4173);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    browserName: 'chromium',
  },
  webServer: {
    command: 'pnpm run build:server-deps && pnpm run build && pnpm run preview',
    url: `http://localhost:${String(PORT)}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
