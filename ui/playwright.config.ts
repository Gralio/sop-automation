import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  // Use the installed system Chrome so we don't depend on Playwright's bundled
  // browser download (headless by default).
  use: { baseURL: 'http://127.0.0.1:5190', channel: 'chrome' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
