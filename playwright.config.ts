import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chromiumOptions = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] };
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width:1440, height:1000 } },
  projects: [
    { name:'chromium', use:{ browserName:'chromium', launchOptions:chromiumOptions } },
    ...(process.env.PUREDDIT_TEST_FIREFOX === '1' ? [{ name:'firefox', use:{ browserName:'firefox' as const } }] : []),
  ],
  webServer: { command:'npm run dev -- --port 5173', url:'http://127.0.0.1:5173', reuseExistingServer:!process.env.CI },
});
