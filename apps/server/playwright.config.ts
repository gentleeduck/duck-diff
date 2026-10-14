import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 800 } },
})
